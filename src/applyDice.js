import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import readline from "node:readline/promises";

import { resolveStateForForm } from "./lib/location.js";
import { hasApplied, saveAppliedJob } from "./lib/appliedTracker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const STORAGE_STATE_PATH = join(ROOT, "storageState.json");

const AUTO_SUBMIT = process.argv.includes("--auto-submit");

const profile = JSON.parse(readFileSync(join(ROOT, "config/profile.json"), "utf-8"));
const searchConfig = JSON.parse(readFileSync(join(ROOT, "config/search-config.json"), "utf-8"));

const resumeAbsPath = join(ROOT, profile.resumeFile);

// --- Text/role-based locators. Dice's DOM changes over time; if a step stops
// matching, adjust the string here rather than hunting through the rest of the file. ---
const UI = {
  searchBox: () => page => page.getByPlaceholder(/job title or keyword/i),
  locationBox: () => page => page.getByPlaceholder(/city, state, zip/i),
  searchSubmit: () => page => page.getByRole("button", { name: /search/i }),
  easyApplyFilter: () => page => page.getByText(/^easy apply$/i).first(),
  jobCard: () => page => page.locator('[data-testid="job-search-serp-card"], article[id^="job-"]'),
  jobTitleLink: (card) => card.locator("a").first(),
  easyApplyButton: () => page => page.getByRole("button", { name: /easy apply/i }),
  submitButton: () => page => page.getByRole("button", { name: /^submit$|submit application/i }),
  nextStepButton: () => page => page.getByRole("button", { name: /^next$|continue/i }),
  resumeFileInput: () => page => page.locator('input[type="file"]'),
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function randomDelay(minMs = 800, maxMs = 2200) {
  return delay(minMs + Math.random() * (maxMs - minMs));
}

async function fillIfPresent(scope, labelPattern, value) {
  try {
    const field = scope.getByLabel(labelPattern).first();
    if (await field.count()) {
      await field.fill(String(value));
      return true;
    }
  } catch {
    // field not present or not fillable — leave for manual review
  }
  return false;
}

async function selectIfPresent(scope, labelPattern, optionPattern) {
  try {
    const field = scope.getByLabel(labelPattern).first();
    if (await field.count()) {
      await field.selectOption({ label: optionPattern });
      return true;
    }
  } catch {
    // field not present or option text doesn't match — leave for manual review
  }
  return false;
}

async function fillKnownEasyApplyFields(page, stateForForm) {
  const filled = [];

  if (await fillIfPresent(page, /phone/i, profile.phone)) filled.push("phone");
  if (await fillIfPresent(page, /^state$|location/i, stateForForm)) filled.push(`state (${stateForForm})`);
  if (await selectIfPresent(page, /work authorization|employment eligibility/i, new RegExp(profile.workAuthorization, "i"))) {
    filled.push("work authorization");
  }
  if (await selectIfPresent(page, /sponsorship/i, profile.requiresSponsorship ? /yes/i : /no/i)) {
    filled.push("sponsorship");
  }

  const fileInput = UI.resumeFileInput()(page);
  if ((await fileInput.count()) && existsSync(resumeAbsPath)) {
    await fileInput.first().setInputFiles(resumeAbsPath);
    filled.push("resume upload");
  }

  return filled;
}

async function pauseForReview(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(`\n${message}\nPress ENTER to continue... `);
  rl.close();
}

async function processJob(page, jobUrl, jobId) {
  console.log(`\n--- Opening job ${jobId}: ${jobUrl}`);
  await page.goto(jobUrl);
  await randomDelay();

  const locationText = await page
    .locator('[data-testid="job-location"], [class*="location"]')
    .first()
    .innerText()
    .catch(() => "");
  const jdText = await page.locator("body").innerText().catch(() => "");

  const stateForForm = resolveStateForForm(locationText, jdText, profile.fallbackState);
  console.log(`Location on posting: "${locationText.trim()}" -> using state: ${stateForForm}`);

  const easyApplyBtn = UI.easyApplyButton()(page);
  if (!(await easyApplyBtn.count())) {
    console.log("No Easy Apply button found — skipping (may require external application).");
    return false;
  }

  await easyApplyBtn.first().click();
  await randomDelay();

  // Multi-step Easy Apply wizards: walk forward filling known fields on each step.
  for (let step = 0; step < 6; step++) {
    const filled = await fillKnownEasyApplyFields(page, stateForForm);
    if (filled.length) console.log(`Filled: ${filled.join(", ")}`);

    const nextBtn = UI.nextStepButton()(page);
    const submitBtn = UI.submitButton()(page);

    if (await submitBtn.count()) {
      if (AUTO_SUBMIT) {
        await submitBtn.first().click();
        console.log("Submitted automatically (--auto-submit).");
      } else {
        await pauseForReview(
          "Easy Apply form filled. Review it in the browser and click Submit yourself, " +
            "or fix anything that looks wrong first."
        );
      }
      return true;
    }

    if (await nextBtn.count()) {
      await nextBtn.first().click();
      await randomDelay();
      continue;
    }

    // Neither Next nor Submit found — unknown step, hand off to the user.
    await pauseForReview(
      "Reached an application step this script doesn't recognize. " +
        "Handle it manually in the browser, then continue."
    );
    return true;
  }

  console.log("Gave up after 6 steps without finding Submit — check this job manually.");
  return false;
}

async function searchAndCollectJobs(page, keyword) {
  await page.goto("https://www.dice.com/jobs");
  await randomDelay();

  await UI.searchBox()(page).fill(keyword);
  await UI.locationBox()(page).fill(searchConfig.location || "");
  await UI.searchSubmit()(page).click();
  await randomDelay();

  const easyApplyFilter = UI.easyApplyFilter()(page);
  if (searchConfig.easyApplyOnly && (await easyApplyFilter.count())) {
    await easyApplyFilter.first().click();
    await randomDelay();
  }

  const cards = UI.jobCard()(page);
  const count = await cards.count();
  const jobs = [];

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const link = UI.jobTitleLink(card);
    const href = await link.getAttribute("href").catch(() => null);
    const title = await link.innerText().catch(() => "");
    if (!href) continue;

    const excluded = searchConfig.excludeTitleKeywords.some((kw) =>
      title.toLowerCase().includes(kw.toLowerCase())
    );
    if (excluded) continue;

    const jobUrl = new URL(href, "https://www.dice.com").toString();
    const jobId = jobUrl.split("/").pop();
    jobs.push({ jobId, jobUrl, title });
  }

  return jobs;
}

async function main() {
  if (!existsSync(STORAGE_STATE_PATH)) {
    console.error("No saved session found. Run `npm run login` first.");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
  const page = await context.newPage();

  let applied = 0;

  for (const keyword of searchConfig.keywords) {
    if (applied >= searchConfig.maxApplicationsPerRun) break;

    console.log(`\n=== Searching: "${keyword}" ===`);
    const jobs = await searchAndCollectJobs(page, keyword);
    console.log(`Found ${jobs.length} candidate jobs.`);

    for (const job of jobs) {
      if (applied >= searchConfig.maxApplicationsPerRun) break;
      if (hasApplied(job.jobId)) {
        console.log(`Already applied to ${job.jobId} — skipping.`);
        continue;
      }

      const success = await processJob(page, job.jobUrl, job.jobId);
      if (success) {
        saveAppliedJob(job.jobId, { title: job.title, url: job.jobUrl, keyword });
        applied++;
      }
      await randomDelay(1500, 3500);
    }
  }

  console.log(`\nDone. Applied to ${applied} job(s) this run.`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
