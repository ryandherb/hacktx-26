from app.models.schemas import Profile

INSURANCE_KEYWORDS = (
    "insurance", "geico", "progressive", "state farm", "allstate", "usaa",
    "farmers", "liberty mutual", "nationwide", "travelers", "toyota insurance",
)


PHYSICAL_DAMAGE_RATE = 0.035
BASE_LIABILITY_MONTHLY = 70.0
MAX_PHYSICAL_SHARE = 0.6


def _is_insurance(purchase: dict) -> bool:
    text = f"{purchase.get('description', '')} {purchase.get('merchant', '')}".lower()
    return any(k in text for k in INSURANCE_KEYWORDS)


def premium_from_snapshot(snapshot: dict) -> float | None:
    """Average monthly insurance spend from Nessie purchases, or None if none found."""
    items = [p for p in snapshot.get("purchases", []) if _is_insurance(p)]
    if not items:
        return None
    months = {p["transaction_date"][:7] for p in items}
    return sum(p["amount"] for p in items) / len(months)


def _physical_damage_monthly(vehicle_value: float) -> float:
    return vehicle_value * PHYSICAL_DAMAGE_RATE / 12


def current_premium(profile: Profile, snapshot: dict, vehicle_value: float) -> float:
    """Monthly premium the customer pays today."""
    if profile.insurance_premium is not None:
        return profile.insurance_premium
    found = premium_from_snapshot(snapshot)
    if found is not None:
        return round(found, 2)
    return round(BASE_LIABILITY_MONTHLY + _physical_damage_monthly(vehicle_value), 2)


def trade_premium(
    current_monthly: float, current_value: float, replacement_price: float
) -> float:
    """Estimated monthly premium on the replacement car."""
    physical_now = min(
        _physical_damage_monthly(current_value), MAX_PHYSICAL_SHARE * current_monthly
    )
    liability = current_monthly - physical_now
    return round(liability + _physical_damage_monthly(replacement_price), 2)
