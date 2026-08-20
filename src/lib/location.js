import { STATE_ABBR_TO_NAME, STATE_NAME_TO_ABBR } from "./usStates.js";

const REMOTE_PATTERN = /\bremote\b/i;

/**
 * Resolve the state name to fill into the Dice application form.
 * Rule: only the state name goes in the form, never a city.
 * If the job is remote, use the applicant's own fallback state instead
 * of anything parsed from the posting.
 *
 * @param {string} rawLocationText - job card/detail location text, e.g. "Austin, TX", "Remote", "Remote - USA"
 * @param {string} jobDescriptionText - full JD text, scanned for "Remote" when the location field is ambiguous
 * @param {string} fallbackState - applicant's own state, used for remote jobs
 * @returns {string} full state name, e.g. "Texas"
 */
export function resolveStateForForm(rawLocationText, jobDescriptionText, fallbackState) {
  const locationText = (rawLocationText || "").trim();
  const isRemote = REMOTE_PATTERN.test(locationText) || REMOTE_PATTERN.test(jobDescriptionText || "");

  if (isRemote) {
    return fallbackState;
  }

  const state = extractStateFromText(locationText) || extractStateFromText(jobDescriptionText || "");
  return state || fallbackState;
}

/**
 * Pulls a US state out of free text formatted like "City, ST", "City, State", or "ST".
 * Returns the full state name, or null if nothing matched.
 */
export function extractStateFromText(text) {
  if (!text) return null;

  const abbrMatch = text.match(/\b([A-Z]{2})\b/);
  if (abbrMatch && STATE_ABBR_TO_NAME[abbrMatch[1]]) {
    return STATE_ABBR_TO_NAME[abbrMatch[1]];
  }

  const lower = text.toLowerCase();
  for (const [nameLower, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
    if (lower.includes(nameLower)) {
      return STATE_ABBR_TO_NAME[abbr];
    }
  }

  return null;
}
