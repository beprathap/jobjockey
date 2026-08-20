import re

from .us_states import STATE_ABBR_TO_NAME, STATE_NAME_TO_ABBR

REMOTE_PATTERN = re.compile(r"\bremote\b", re.IGNORECASE)
ABBR_PATTERN = re.compile(r"\b([A-Z]{2})\b")


def extract_state_from_text(text: str) -> str | None:
    """Pulls a US state out of free text like 'City, ST', 'City, State', or 'ST'."""
    if not text:
        return None

    abbr_match = ABBR_PATTERN.search(text)
    if abbr_match and abbr_match.group(1) in STATE_ABBR_TO_NAME:
        return STATE_ABBR_TO_NAME[abbr_match.group(1)]

    lower = text.lower()
    for name_lower, abbr in STATE_NAME_TO_ABBR.items():
        if name_lower in lower:
            return STATE_ABBR_TO_NAME[abbr]

    return None


def resolve_state_for_form(raw_location_text: str, job_description_text: str, fallback_state: str) -> str:
    """
    Resolve the state name to fill into the Dice application form.
    Rule: only the state name goes in the form, never a city.
    If the job is remote, use the applicant's own fallback state instead
    of anything parsed from the posting.
    """
    location_text = (raw_location_text or "").strip()
    is_remote = bool(REMOTE_PATTERN.search(location_text)) or bool(
        REMOTE_PATTERN.search(job_description_text or "")
    )

    if is_remote:
        return fallback_state

    state = extract_state_from_text(location_text) or extract_state_from_text(job_description_text or "")
    return state or fallback_state
