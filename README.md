# JobJockey

Browser automation (Playwright, no backend/API calls) that searches job
portals — starting with Dice — and rides through their Easy Apply flows
using your resume/profile data. More portals to come.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

## 1. Log in once

```bash
python src/login.py
```

This opens a real Chromium window on Dice's login page. Log in manually
(so you can handle any CAPTCHA/MFA), press Enter in the terminal once
you're on your dashboard, and the session is saved to `storageState.json`
(gitignored) for future runs.

## 2. Configure

- `config/profile.json` — your contact info, work authorization, resume
  file path, fallback state used for remote jobs.
- `config/search-config.json` — search keywords, Easy Apply filter,
  posted-within window, max applications per run, title keywords to skip.
- `resume/` — the resume file referenced by `profile.json`.

Location rule (as configured): only the **state** is filled into Dice's
location field, never the city. If a posting is remote, your
`fallbackState` from `profile.json` is used instead of the posting's
location.

## 3. Run

```bash
python src/apply_dice.py                 # fills each Easy Apply form, then pauses for you to review + click Submit
python src/apply_dice.py --auto-submit    # same, but clicks Submit automatically once known fields are filled
```

Start without `--auto-submit` until you've watched it run against Dice's
current UI and are confident the fields are filling correctly — Dice's
DOM can change over time, so the locator functions in `src/apply_dice.py`
(near the top of the file) may occasionally need small updates.

Applied jobs are recorded in `data/applied-jobs.json` (gitignored) so
reruns skip anything already applied to.

## Project layout

```
config/            profile.json, search-config.json — plain JSON, portal-agnostic
resume/            your resume file
src/
  login.py         manual login, saves the browser session
  apply_dice.py    Dice search + Easy Apply automation
  lib/
    location.py       state-only / remote-fallback location logic
    applied_tracker.py  tracks jobs already applied to
    us_states.py        state name/abbreviation lookup tables
data/               applied-jobs.json (gitignored)
```

## Notes

- No credentials are stored anywhere — login is manual, only the browser
  session/cookies are persisted locally.
- Unknown/unrecognized form fields (screening questions, etc.) are never
  guessed at — the script pauses and hands control back to you.
