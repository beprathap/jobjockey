import json
import random
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import Page, sync_playwright

from lib.applied_tracker import has_applied, save_applied_job
from lib.location import resolve_state_for_form

ROOT = Path(__file__).resolve().parent.parent
STORAGE_STATE_PATH = ROOT / "storageState.json"

AUTO_SUBMIT = "--auto-submit" in sys.argv

profile = json.loads((ROOT / "config" / "profile.json").read_text())
search_config = json.loads((ROOT / "config" / "search-config.json").read_text())

resume_abs_path = ROOT / profile["resumeFile"]


# --- Text/role-based locators. Dice's DOM changes over time; if a step stops
# matching, adjust the string here rather than hunting through the rest of the file. ---
def search_box(page: Page):
    return page.get_by_placeholder(re.compile("job title or keyword", re.IGNORECASE))


def location_box(page: Page):
    return page.get_by_placeholder(re.compile("city, state, zip", re.IGNORECASE))


def search_submit(page: Page):
    return page.get_by_role("button", name=re.compile("search", re.IGNORECASE))


def easy_apply_filter(page: Page):
    return page.get_by_text(re.compile("^easy apply$", re.IGNORECASE)).first


def job_cards(page: Page):
    return page.locator('[data-testid="job-search-serp-card"], article[id^="job-"]')


def job_title_link(card):
    return card.locator("a").first


def easy_apply_button(page: Page):
    return page.get_by_role("button", name=re.compile("easy apply", re.IGNORECASE))


def submit_button(page: Page):
    return page.get_by_role("button", name=re.compile("^submit$|submit application", re.IGNORECASE))


def next_step_button(page: Page):
    return page.get_by_role("button", name=re.compile("^next$|continue", re.IGNORECASE))


def resume_file_input(page: Page):
    return page.locator('input[type="file"]')


def random_delay(min_ms: int = 800, max_ms: int = 2200) -> None:
    time.sleep(random.uniform(min_ms, max_ms) / 1000)


def fill_if_present(scope, label_pattern: str, value) -> bool:
    try:
        field = scope.get_by_label(re.compile(label_pattern, re.IGNORECASE)).first
        if field.count():
            field.fill(str(value))
            return True
    except Exception:
        pass  # field not present or not fillable — leave for manual review
    return False


def select_if_present(scope, label_pattern: str, option_pattern: str) -> bool:
    try:
        field = scope.get_by_label(re.compile(label_pattern, re.IGNORECASE)).first
        if field.count():
            field.select_option(label=re.compile(option_pattern, re.IGNORECASE))
            return True
    except Exception:
        pass  # field not present or option text doesn't match — leave for manual review
    return False


def fill_known_easy_apply_fields(page: Page, state_for_form: str) -> list[str]:
    filled = []

    if fill_if_present(page, "phone", profile["phone"]):
        filled.append("phone")
    if fill_if_present(page, "^state$|location", state_for_form):
        filled.append(f"state ({state_for_form})")
    if select_if_present(page, "work authorization|employment eligibility", profile["workAuthorization"]):
        filled.append("work authorization")
    if select_if_present(page, "sponsorship", "yes" if profile["requiresSponsorship"] else "no"):
        filled.append("sponsorship")

    file_input = resume_file_input(page)
    if file_input.count() and resume_abs_path.exists():
        file_input.first.set_input_files(str(resume_abs_path))
        filled.append("resume upload")

    return filled


def pause_for_review(message: str) -> None:
    input(f"\n{message}\nPress ENTER to continue... ")


def process_job(page: Page, job_url: str, job_id: str) -> bool:
    print(f"\n--- Opening job {job_id}: {job_url}")
    page.goto(job_url)
    random_delay()

    try:
        location_text = page.locator('[data-testid="job-location"], [class*="location"]').first.inner_text()
    except Exception:
        location_text = ""

    try:
        jd_text = page.locator("body").inner_text()
    except Exception:
        jd_text = ""

    state_for_form = resolve_state_for_form(location_text, jd_text, profile["fallbackState"])
    print(f'Location on posting: "{location_text.strip()}" -> using state: {state_for_form}')

    apply_btn = easy_apply_button(page)
    if not apply_btn.count():
        print("No Easy Apply button found — skipping (may require external application).")
        return False

    apply_btn.first.click()
    random_delay()

    # Multi-step Easy Apply wizards: walk forward filling known fields on each step.
    for _ in range(6):
        filled = fill_known_easy_apply_fields(page, state_for_form)
        if filled:
            print(f"Filled: {', '.join(filled)}")

        next_btn = next_step_button(page)
        submit_btn = submit_button(page)

        if submit_btn.count():
            if AUTO_SUBMIT:
                submit_btn.first.click()
                print("Submitted automatically (--auto-submit).")
            else:
                pause_for_review(
                    "Easy Apply form filled. Review it in the browser and click Submit yourself, "
                    "or fix anything that looks wrong first."
                )
            return True

        if next_btn.count():
            next_btn.first.click()
            random_delay()
            continue

        # Neither Next nor Submit found — unknown step, hand off to the user.
        pause_for_review(
            "Reached an application step this script doesn't recognize. "
            "Handle it manually in the browser, then continue."
        )
        return True

    print("Gave up after 6 steps without finding Submit — check this job manually.")
    return False


def search_and_collect_jobs(page: Page, keyword: str) -> list[dict]:
    page.goto("https://www.dice.com/jobs")
    random_delay()

    search_box(page).fill(keyword)
    location_box(page).fill(search_config.get("location", ""))
    search_submit(page).click()
    random_delay()

    apply_filter = easy_apply_filter(page)
    if search_config.get("easyApplyOnly") and apply_filter.count():
        apply_filter.first.click()
        random_delay()

    cards = job_cards(page)
    count = cards.count()
    jobs = []

    for i in range(count):
        card = cards.nth(i)
        link = job_title_link(card)
        try:
            href = link.get_attribute("href")
            title = link.inner_text()
        except Exception:
            continue
        if not href:
            continue

        title_lower = title.lower()
        if any(kw.lower() in title_lower for kw in search_config["excludeTitleKeywords"]):
            continue

        job_url = urljoin("https://www.dice.com", href)
        job_id = job_url.rstrip("/").split("/")[-1]
        jobs.append({"jobId": job_id, "jobUrl": job_url, "title": title})

    return jobs


def main() -> None:
    if not STORAGE_STATE_PATH.exists():
        print("No saved session found. Run `python src/login.py` first.")
        sys.exit(1)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        context = browser.new_context(storage_state=str(STORAGE_STATE_PATH))
        page = context.new_page()

        applied = 0
        max_applications = search_config["maxApplicationsPerRun"]

        for keyword in search_config["keywords"]:
            if applied >= max_applications:
                break

            print(f'\n=== Searching: "{keyword}" ===')
            jobs = search_and_collect_jobs(page, keyword)
            print(f"Found {len(jobs)} candidate jobs.")

            for job in jobs:
                if applied >= max_applications:
                    break
                if has_applied(job["jobId"]):
                    print(f"Already applied to {job['jobId']} — skipping.")
                    continue

                success = process_job(page, job["jobUrl"], job["jobId"])
                if success:
                    save_applied_job(job["jobId"], {"title": job["title"], "url": job["jobUrl"], "keyword": keyword})
                    applied += 1
                random_delay(1500, 3500)

        print(f"\nDone. Applied to {applied} job(s) this run.")
        browser.close()


if __name__ == "__main__":
    main()
