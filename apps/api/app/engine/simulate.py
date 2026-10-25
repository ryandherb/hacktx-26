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
    *,
    repair_cost: float,
    car_value: float,
    pfo_factors: PFOFactors,
) -> AnalysisResult:
    """Score keep / refinance / trade. repair_cost, car_value, and pfo_factors come from
    the Cost Agent handoff: `run(..., **build_handoff(quote, factors).krt_arguments())`."""
    krt_result: KRTResult = krt.score(
        profile,
        car_value,
        afford,
        market,
        repair_cost,
        snapshot,
        pfo_factors,
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
    
    
    

def set_recommendation(krt_result: KRTResult) -> str:
    """Lowest monthly cost wins. Trade only if a replacement payment is affordable.

    Refinance must be strictly cheaper than keep (they're equal with no loan); ties go to keep.
    """
    options = [("keep", krt_result.keepResult)]
    if krt_result.refinanceResult < krt_result.keepResult:
        options.append(("refinance", krt_result.refinanceResult))
    if krt_result.trade_affordable and krt_result.tradeResult < krt_result.keepResult:
        options.append(("trade", krt_result.tradeResult))
    return min(options, key=lambda o: o[1])[0]  # min keeps the first on ties
