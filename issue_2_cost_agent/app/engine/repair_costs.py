"""Step 2 of the Cost Agent: deterministic repair cost range, reported at the high end."""

import re

from ..models.cost_schemas import ManualQuote, RepairEstimate
from .cost_tables import (
    AGE_MULTIPLIERS,
    DEFAULT_MODEL,
    GENERAL_TIERS,
    LABOR_MULTIPLIERS,
    MODELS,
    OLDEST_AGE_MULTIPLIER,
    REPAIR_CATEGORIES,
    STATE_NAMES,
    ZIP_PREFIX_STATES,
    model_key,
)

ZIP_RE = re.compile(r"\b(\d{5})(?:-\d{4})?\b")
STATE_CODE_RE = re.compile(r"(?:^|[\s,])([A-Za-z]{2})\s*$")


def _round10(value: float) -> float:
    return float(round(value / 10) * 10)


def state_from_location(location: str) -> str | None:
    """ZIP code or "City, ST" / "City, State" -> two-letter state, if we can tell."""
    zip_match = ZIP_RE.search(location)
    if zip_match:
        prefix = int(zip_match.group(1)[:3])
        return next((st for lo, hi, st in ZIP_PREFIX_STATES if lo <= prefix <= hi), None)
    code = STATE_CODE_RE.search(location.strip())
    if code and code.group(1).upper() in LABOR_MULTIPLIERS:
        return code.group(1).upper()
    lowered = location.lower()
    return next((st for name, st in STATE_NAMES.items() if name in lowered), None)


def age_multiplier(age_years: int) -> float:
    return next((m for max_age, m in AGE_MULTIPLIERS if age_years <= max_age), OLDEST_AGE_MULTIPLIER)


def estimate_from_table(
    category: str, vehicle_model: str, vehicle_year: int, location: str, as_of_year: int,
    label: str | None = None,
) -> RepairEstimate:
    """Price a catalog repair or a general tier; `label` names a general-tier repair."""
    entry = REPAIR_CATEGORIES.get(category) or GENERAL_TIERS[category]
    model = MODELS.get(model_key(vehicle_model), DEFAULT_MODEL)
    state = state_from_location(location)
    m_model = model["repair_multiplier"]
    m_age = age_multiplier(max(0, as_of_year - vehicle_year))
    m_region = LABOR_MULTIPLIERS.get(state, 1.0)
    factor = m_model * m_age * m_region
    low, high = _round10(entry["low"] * factor), _round10(entry["high"] * factor)
    return RepairEstimate(
        source="table",
        category=category,
        label=label or entry["label"],
        repair_cost_low=low,
        repair_cost_high=high,
        repair_cost_estimate=high,
        model_multiplier=m_model,
        age_multiplier=m_age,
        region_multiplier=m_region,
        region=state,
    )


def estimate_from_manual(manual: ManualQuote, category: str | None, label: str | None) -> RepairEstimate:
    amount = round(manual.amount, 2)
    return RepairEstimate(
        source="manual",
        category=category,
        label=label or "Shop quote",
        repair_cost_low=amount,
        repair_cost_high=amount,
        repair_cost_estimate=amount,
        shop=manual.shop,
    )
