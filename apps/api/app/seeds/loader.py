import json
from pathlib import Path

from app.models.schemas import Profile

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent / "fixtures"


def load_profiles() -> list[Profile]:
    with open(HERE / "toyota_profiles.json") as f:
        return [Profile(**p) for p in json.load(f)]


def get_profile(profile_id: str) -> Profile | None:
    return next((p for p in load_profiles() if p.id == profile_id), None)


def load_fixture(name: str) -> dict:
    with open(FIXTURES / f"{name}.json") as f:
        return json.load(f)
