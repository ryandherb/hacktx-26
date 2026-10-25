"""Mountable HTTP router for the Cost Agent: POST /quote and POST /onboarding."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from .seeds.pre_quote_profiles import survey_profile_records

from .pfo_agent import run_onboarding
from .cost_agent import build_quote
from .models.schemas import CostQuoteRequest, CostQuoteResult, OnboardingRequest, OnboardingResult

router = APIRouter(tags=["Cost Agent"])


@router.post("/quote", response_model=CostQuoteResult)
def quote(
    req: CostQuoteRequest,
    profiles: Annotated[list[dict], Depends(survey_profile_records)],
) -> CostQuoteResult:
    profile = None
    if req.profile_id is not None:
        profile = next((p for p in profiles if p.get("id") == req.profile_id), None)
        if profile is None:
            raise HTTPException(404, f"Unknown profile '{req.profile_id}'")
    return build_quote(req, profile, as_of_year=date.today().year)


@router.post("/onboarding", response_model=OnboardingResult)
def onboarding(req: OnboardingRequest) -> OnboardingResult:
    return run_onboarding(req)
