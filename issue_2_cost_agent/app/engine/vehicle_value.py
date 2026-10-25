"""Step 3 of the Cost Agent: deterministic current vehicle value.

Declining-balance depreciation from a synthetic original MSRP, adjusted for mileage
against 12k miles/year. Returns private-sale and trade-in ranges because issue #3
compares keep/repair, trade-in, and private sale.
"""

from typing import Literal

from ..models.cost_schemas import VehicleValue
from .cost_tables import DEFAULT_MODEL, MILES_PER_YEAR, MODELS, TRADE_IN_RATIO, VALUE_FLOOR, model_key

RANGE_SPREAD = 0.10  # +/- around the point estimate
MILEAGE_ADJ_PER_10K = 0.05
MILEAGE_ADJ_BOUNDS = (0.70, 1.20)


def _round50(value: float) -> float:
    return float(round(value / 50) * 50)


def value_vehicle(
    vehicle_model: str,
    vehicle_year: int,
    mileage: int,
    mileage_source: Literal["profile", "user"],
    as_of_year: int,
) -> VehicleValue:
    key = model_key(vehicle_model)
    model = MODELS.get(key, DEFAULT_MODEL)
    age = max(0, as_of_year - vehicle_year)

    expected_miles = age * MILES_PER_YEAR
    lo_adj, hi_adj = MILEAGE_ADJ_BOUNDS
    mileage_adj = min(hi_adj, max(lo_adj, 1 + MILEAGE_ADJ_PER_10K * (expected_miles - mileage) / 10_000))

    private = max(VALUE_FLOOR, model["msrp"] * (1 - model["depreciation"]) ** age * mileage_adj)
    trade_in = max(VALUE_FLOOR, private * TRADE_IN_RATIO)
    return VehicleValue(
        model_recognized=key is not None,
        vehicle_age_years=age,
        mileage=mileage,
        mileage_source=mileage_source,
        private_sale_low=_round50(private * (1 - RANGE_SPREAD)),
        private_sale_high=_round50(private * (1 + RANGE_SPREAD)),
        private_sale_estimate=_round50(private),
        trade_in_low=_round50(trade_in * (1 - RANGE_SPREAD)),
        trade_in_high=_round50(trade_in * (1 + RANGE_SPREAD)),
        trade_in_estimate=_round50(trade_in),
    )
