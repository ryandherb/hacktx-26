"""Raw profile records for the pre-quote survey and Cost Agent (same file as seeds/loader.py)."""

import json
from pathlib import Path

PROFILE_FIXTURE = Path(__file__).resolve().parent / "toyota_profiles.json"


def load_profile_records() -> list[dict]:
    """Return raw records so incomplete profiles can still go through intake."""
    with PROFILE_FIXTURE.open(encoding="utf-8") as fixture:
        return json.load(fixture)


def survey_profile_records() -> list[dict]:
    """FastAPI dependency; tests override it with their own records."""
    return load_profile_records()
