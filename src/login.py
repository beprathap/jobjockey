from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
STORAGE_STATE_PATH = ROOT / "storageState.json"


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        page.goto("https://www.dice.com/dashboard/login")

        print("\nA browser window has opened to the Dice login page.")
        print("Log in manually (handle any CAPTCHA/2FA/MFA as needed).")
        print("Once you're logged in and see your Dice dashboard, come back here.\n")

        input("Press ENTER once you're logged in... ")

        context.storage_state(path=str(STORAGE_STATE_PATH))
        print(f"\nSession saved to {STORAGE_STATE_PATH}")
        print("You can now run `python src/apply_dice.py` without logging in again.")

        browser.close()


if __name__ == "__main__":
    main()
