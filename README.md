# Job Application Automation

Browser automation (Playwright, no backend/API calls) that searches Dice
and runs through its Easy Apply flow using your resume/profile data.

## Setup

```bash
npm install
npx playwright install chromium
```

## 1. Log in once

```bash
npm run login
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
npm run apply         # fills each Easy Apply form, then pauses for you to review + click Submit
npm run apply:auto     # same, but clicks Submit automatically once known fields are filled
```

Start with `npm run apply` until you've watched it run against Dice's
current UI and are confident the fields are filling correctly — Dice's
DOM can change over time, so the selectors in `src/applyDice.js` (marked
under `UI`) may occasionally need small updates.

Applied jobs are recorded in `data/applied-jobs.json` (gitignored) so
reruns skip anything already applied to.

## Notes

- No credentials are stored anywhere — login is manual, only the browser
  session/cookies are persisted locally.
- Unknown/unrecognized form fields (screening questions, etc.) are never
  guessed at — the script pauses and hands control back to you.
