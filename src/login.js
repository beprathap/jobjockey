import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import readline from "node:readline/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE_PATH = join(__dirname, "..", "storageState.json");

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.dice.com/dashboard/login");

  console.log("\nA browser window has opened to the Dice login page.");
  console.log("Log in manually (handle any CAPTCHA/2FA/MFA as needed).");
  console.log("Once you're logged in and see your Dice dashboard, come back here.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Press ENTER once you're logged in... ");
  rl.close();

  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`\nSession saved to ${STORAGE_STATE_PATH}`);
  console.log("You can now run `npm run apply` without logging in again.");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
