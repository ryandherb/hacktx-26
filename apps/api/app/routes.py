from fastapi import APIRouter, HTTPException

from app.clients import llm, nessie, serpapi
from app.engine import affordability, krt, simulate, valuation
from app.models.schemas import (
    AnalysisRequest,
    AnalysisResult,
    CarFundRequest,
    CarFundResult,
    MarketData,
    PFOFactors,
    Profile,
)
from app.seeds.loader import get_profile, load_profiles

router = APIRouter()


def _profile_or_404(profile_id: str) -> Profile:
    profile = get_profile(profile_id)
    if not profile:
        raise HTTPException(404, f"Unknown profile '{profile_id}'")
    return profile


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/profiles", response_model=list[Profile])
def profiles():
    return load_profiles()


@router.get("/market/{profile_id}", response_model=MarketData)
def market(profile_id: str):
    return serpapi.get_market_data(_profile_or_404(profile_id))


@router.post("/analyze", response_model=AnalysisResult)
def analyze(req: AnalysisRequest):
    profile = _profile_or_404(req.profile_id)
    snapshot = nessie.get_snapshot(profile)
    afford = affordability.compute(snapshot)
    mkt = serpapi.get_market_data(profile)
    # Cost curve for the chart (placeholder model in simulate.py).
    curve, crossover, _ = simulate.run(profile, mkt, afford, req)

    # KRT engine: monthly costs for keep / trade / refinance, then the recommendation.
    repair_cost = valuation.estimated_repair_cost(mkt)
    pfo = PFOFactors(down_payment=req.down_payment)
    result = krt.score(
        profile, valuation.current_value(mkt), afford, mkt, repair_cost, snapshot, pfo
    )
    rec = krt.recommend(result, afford)

    explanation = llm.explain(
        {
            "recommendation": rec,
            "krt": result,
            "repair_cost": repair_cost,
            "crossover_month": crossover,
            "affordability": afford,
            "horizon_months": req.horizon_months,
        }
    )
    return AnalysisResult(
        profile_id=profile.id,
        curve=curve,
        crossover_month=crossover,
        result=result,
        recommendation=rec,
        affordability=afford,
        market=mkt,
        explanation=explanation,
    )


@router.post("/car-fund", response_model=CarFundResult)
def car_fund(req: CarFundRequest):
    profile = _profile_or_404(req.profile_id)
    return nessie.create_car_fund(profile, req)
