

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
    pfo_factors: PFOFactors
) -> AnalysisResult:
    krt_result: KRTResult = krt.score(
        profile,
        valuation.current_value(market),
        afford,
        market,
        req.replacement_price,
        snapshot,
        pfo_factors
    ) 
    
    recommendation =  set_recommendation(krt_result)
    suggested_models = krt_result.suggested_models if recommendation == "trade" else None
    
    return AnalysisResult (
        reccomendation=recommendation,
        result=krt_result,
        new_monthly_payment=krt_result.new_payment,
        suggested_models=suggested_models,
        apr=pfo_factors.apr,
        down_payment=pfo_factors.down_payment
    )
    
    
    

def set_recommendation(krt_result: KRTResult):
    match max(krt_result.keepResult, krt_result.refinanceResult, krt_result.tradeResult):
        case krt_result.keepResult:
            return "keep"
        case krt_result.refinanceResult:
            return "refinance"
        case krt_result.tradeResult:
            return "trade"