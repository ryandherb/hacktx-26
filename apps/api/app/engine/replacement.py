import json
from pathlib import Path

from app.models.schemas import AffordabilityResult, PFOFactors, SuggestedModel

CATALOG_PATH = Path(__file__).resolve().parent.parent / "seeds" / "toyota_catalog.json"

GAS_PRICE = 3.00
OLD_CAR_MPG_FACTOR = 0.9
DEFAULT_SPECS = {"seats": 5, "mpg": 28, "body": "sedan"}
TOP_N = 3
FUEL_REASON_MIN = 20 


def load_catalog() -> dict:
    with open(CATALOG_PATH) as f:
        return json.load(f)


def specs_for(name: str, catalog: dict) -> dict:
    """Match a listing name like '2021 RAV4 XLE (CPO)' to catalog specs (longest match wins)."""
    hits = [model for model in catalog if model.lower() in name.lower()]
    return catalog[max(hits, key=len)] if hits else DEFAULT_SPECS


def monthly_fuel(mpg: float, miles_per_month: float) -> float:
    return miles_per_month / mpg * GAS_PRICE if mpg else 0.0


def current_fuel(vehicle_model: str, miles_per_month: float, catalog: dict) -> float:
    mpg = specs_for(vehicle_model, catalog)["mpg"] * OLD_CAR_MPG_FACTOR
    return monthly_fuel(mpg, miles_per_month)


def _reasons(pick: SuggestedModel, rank: int, seats_needed: int, affordable: bool) -> str:
    reasons = []
    if rank == 0:
        reasons.append("lowest monthly cost of the cars that fit" if affordable
                       else "lowest monthly cost, but over your comfortable payment")
    if pick.fuel_delta <= -FUEL_REASON_MIN:
        reasons.append(f"saves ~${-pick.fuel_delta:.0f}/mo on gas")
    if seats_needed > 5:
        reasons.append(f"seats {pick.seats} for your household of {seats_needed}")
    if pick.kind == "cpo":
        reasons.append("certified pre-owned with Toyota warranty")
    if not reasons:
        reasons.append(f"${pick.new_payment:.0f}/mo payment")
    return "; ".join(reasons)


def pick(
    options: list[SuggestedModel], pfo: PFOFactors, afford: AffordabilityResult
) -> tuple[list[SuggestedModel], bool]:
    """Return (top picks ranked by monthly cost, whether any pick is affordable)."""
    seats_needed = pfo.household_members or 1
    fits = [o for o in options if o.seats >= seats_needed] or options
    affordable = [o for o in fits if o.new_payment <= afford.max_comfortable_payment]
    ranked = sorted(affordable or fits, key=lambda o: o.monthly_cost)[:TOP_N]
    for i, o in enumerate(ranked):
        o.reason = _reasons(o, i, seats_needed, bool(affordable))
    return ranked, bool(affordable)
