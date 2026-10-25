from fastapi import APIRouter, HTTPException

from app.clients import llm, nessie
from app.engine import affordability, simulate, valuation
from app.models.schemas import (
    AnalysisRequest,
    AnalysisResult,
    CarFundRequest,
    CarFundResult,
    MarketData,
    PFOFactors,
    Profile,
)
from app.seeds.loader import get_profile, load_fixture, load_profiles

router = APIRouter()


def _profile_or_404(profile_id: str) -> Profile:
    profile = get_profile(profile_id)
    if not profile:
        raise HTTPException(404, f"Unknown profile '{profile_id}'")
    return profile


def _market_data(profile: Profile) -> MarketData:
    """Vehicle value, maintenance, and replacement options from app/fixtures/market.json."""
    data = load_fixture("market").get(profile.id)
    if data is None:
        raise HTTPException(404, f"No market data for profile '{profile.id}'")
    return MarketData(**data)


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/profiles", response_model=list[Profile])
def profiles():
    return load_profiles()


@router.get("/market/{profile_id}", response_model=MarketData)
def market(profile_id: str):
    return _market_data(_profile_or_404(profile_id))


@router.post("/analyze", response_model=AnalysisResult)
def analyze(req: AnalysisRequest):
    profile = _profile_or_404(req.profile_id)
    snapshot = nessie.get_snapshot(profile)
    afford = affordability.compute(snapshot)
    mkt = _market_data(profile)
    pfo = req.pfo or PFOFactors(down_payment=req.down_payment)
    # Plan for the high end of the repair the customer saw; fall back to the fixture quotes.
    repair_cost = req.repair_cost_high or req.repair_cost_low or valuation.estimated_repair_cost(mkt)

    # KRT engine: monthly costs, recommendation, and suggested Toyota models.
    analysis = simulate.run(profile, mkt, afford, req, snapshot, pfo, repair_cost)

    explanation = llm.explain(
        {
            "recommendation": analysis.recommendation,
            "krt": analysis.result,
            "vehicle": f"{profile.vehicle_year} {profile.vehicle_model}",
            "repair_cost": repair_cost,
            "repair_cost_low": req.repair_cost_low,
            "repair_cost_high": req.repair_cost_high,
            "affordability": afford,
            "horizon_months": req.horizon_months,
        }
    )
    return analysis.model_copy(
        update={
            "profile_id": profile.id,
            "affordability": afford,
            "market": mkt,
            "explanation": explanation.summary,
            "explanation_details": explanation.details,
        }
    )


@router.post("/car-fund", response_model=CarFundResult)
def car_fund(req: CarFundRequest):
    profile = _profile_or_404(req.profile_id)
    return nessie.create_car_fund(profile, req)
