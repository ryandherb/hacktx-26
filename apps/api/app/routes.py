from datetime import date

from fastapi import APIRouter, HTTPException

from app.clients import llm, nessie, serpapi
from app.cost_agent import build_handoff, quote_for_profile
from app.engine import affordability, simulate
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
from app.seeds.pre_quote_profiles import load_profile_records

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


def _profile_record(profile_id: str) -> dict:
    """The raw stored profile, as the survey and Cost Agent read it."""
    return next(p for p in load_profile_records() if p.get("id") == profile_id)


@router.post("/analyze", response_model=AnalysisResult)
def analyze(req: AnalysisRequest):
    profile = _profile_or_404(req.profile_id)
    snapshot = nessie.get_snapshot(profile)
    afford = affordability.compute(snapshot)
    mkt = serpapi.get_market_data(profile)

    # Cost Agent quote (from POST /quote, or priced here from the profile's open issue) and
    # PFO factors (from POST /onboarding, or defaults) -> the inputs krt.score() needs.
    pfo = req.pfo_factors or PFOFactors(down_payment=req.down_payment)
    try:
        quote = req.quote or quote_for_profile(_profile_record(profile.id), date.today().year)
        if quote.profile_id not in (None, profile.id):
            raise ValueError(f"Quote is for profile '{quote.profile_id}', not '{profile.id}'")
        handoff = build_handoff(quote, pfo)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e

    # KRT engine: monthly costs, recommendation, and suggested Toyota models.
    analysis = simulate.run(profile, mkt, afford, req, snapshot, **handoff.krt_arguments())

    explanation = llm.explain(
        {
            "recommendation": analysis.recommendation,
            "krt": analysis.result,
            "vehicle": f"{profile.vehicle_year} {profile.vehicle_model}",
            "repair_cost": handoff.repair_cost,
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
