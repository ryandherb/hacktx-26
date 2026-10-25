"""Mountable HTTP router for pre-quote intake only."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from .seeds.pre_quote_profiles import survey_profile_records
from .models.schemas import PreQuoteSurveyRequest, PreQuoteSurveyResult
from .pre_quote_service import prepare_survey

router = APIRouter(tags=["Pre-Quote Survey"])


@router.post("/pre-quote-survey", response_model=PreQuoteSurveyResult)
def pre_quote_survey(
    req: PreQuoteSurveyRequest,
    profiles: Annotated[list[dict], Depends(survey_profile_records)],
) -> PreQuoteSurveyResult:
    profile = None
    if req.profile_id is not None:
        profile = next((p for p in profiles if p.get("id") == req.profile_id), None)
        if profile is None:
            raise HTTPException(404, f"Unknown profile '{req.profile_id}'")
    return prepare_survey(req, profile)
