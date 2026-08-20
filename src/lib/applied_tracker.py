import json
from datetime import datetime, timezone
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "applied-jobs.json"


def load_applied_jobs() -> dict:
    if not DATA_PATH.exists():
        return {}
    return json.loads(DATA_PATH.read_text())


def save_applied_job(job_id: str, meta: dict) -> None:
    applied = load_applied_jobs()
    applied[job_id] = {**meta, "appliedAt": datetime.now(timezone.utc).isoformat()}
    DATA_PATH.write_text(json.dumps(applied, indent=2))


def has_applied(job_id: str) -> bool:
    return job_id in load_applied_jobs()
