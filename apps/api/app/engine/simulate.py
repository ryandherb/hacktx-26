

from app.engine import valuation
from app.engine import krt
from app.models.schemas import (
    AffordabilityResult,
    AnalysisRequest,
    MarketData,
    PFOFactors,
    Profile,
    AnalysisResult,
    KRTResult
)


def run(
    profile: Profile,
    market: MarketData,
    afford: AffordabilityResult,
    req: AnalysisRequest,
    snapshot: dict,
    pfo_factors: PFOFactors,
    repair_cost: float | None = None
) -> AnalysisResult:
    if repair_cost is None:
        repair_cost = valuation.estimated_repair_cost(market)
    krt_result: KRTResult = krt.score(
        profile,
        valuation.current_value(market),
        afford,
        market,
        repair_cost,
        snapshot,
        pfo_factors
    ) 
    
    recommendation =  set_recommendation(krt_result)
    suggested_models = krt_result.suggested_models if recommendation == "trade" else None
    
    return AnalysisResult (
        recommendation=recommendation,
        result=krt_result,
        new_monthly_payment=krt_result.new_payment,
        suggested_models=suggested_models,
        apr=pfo_factors.apr,
        down_payment=pfo_factors.down_payment
    )
    
    
    

# "50% rule": a repair costing half the car's value or more, on a car near the end of its
# life, isn't worth making when a replacement fits the budget, even if keeping is cheaper
# month to month.
REPAIR_RATIO_TRADE = 0.5
REMAINING_LIFE_TRADE = 0.3


def set_recommendation(krt_result: KRTResult) -> str:
    """Lowest monthly cost wins. Trade only if a replacement payment is affordable.

    Refinance must be strictly cheaper than keep (they're equal with no loan); ties go to keep.
    The 50% rule above overrides cost and recommends trade.
    """
    if (
        krt_result.trade_affordable
        and krt_result.repair_ratio >= REPAIR_RATIO_TRADE
        and krt_result.remaining_life <= REMAINING_LIFE_TRADE
    ):
        return "trade"
    options = [("keep", krt_result.keepResult)]
    if krt_result.refinanceResult < krt_result.keepResult:
        options.append(("refinance", krt_result.refinanceResult))
    if krt_result.trade_affordable and krt_result.tradeResult < krt_result.keepResult:
        options.append(("trade", krt_result.tradeResult))
    return min(options, key=lambda o: o[1])[0]  # min keeps the first on ties
