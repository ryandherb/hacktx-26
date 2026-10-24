"""Keep-vs-replace simulation.

PLACEHOLDER MATH so the whole pipeline renders end to end. Replace the body of
`run()` with the real model (repair/maintenance growth, depreciation, financing,
fuel savings, uncertainty bands). Keep the function signature so routes and the UI
keep working.
"""

from app.engine import valuation
from app.models.schemas import (
    AffordabilityResult,
    AnalysisRequest,
    CurvePoint,
    MarketData,
    Profile,
)


def run(
    profile: Profile,
    market: MarketData,
    afford: AffordabilityResult,
    req: AnalysisRequest,
) -> tuple[list[CurvePoint], int | None, str]:
    """Return (curve, crossover_month, recommendation)."""
    horizon = req.horizon_months
    option = valuation.default_replacement(market)
    price = req.replacement_price or option["price"]
    down = req.down_payment if req.down_payment is not None else 0.2 * price
    trade_in = valuation.current_value(market)
    repair_now = valuation.estimated_repair_cost(market)

    monthly_keep = 80.0 + 2.5 * (profile.mileage / 1000)  # TODO: real repair/maintenance model
    monthly_replace = (price - down - trade_in) / 60.0  # TODO: real loan math

    curve: list[CurvePoint] = []
    crossover: int | None = None
    for m in range(0, horizon + 1):
        keep = repair_now + monthly_keep * m
        replace = down + monthly_replace * m
        curve.append(
            CurvePoint(month=m, keep_cost=round(keep, 2), replace_cost=round(replace, 2))
        )
        if crossover is None and m > 0 and replace < keep:
            crossover = m

    if crossover is None:
        recommendation = "keep"
    elif crossover <= 1 and afford.can_afford_payment:
        recommendation = "replace_now"
    else:
        recommendation = "replace_later"
    return curve, crossover, recommendation
