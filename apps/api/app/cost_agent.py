"""Stateless /quote orchestration (classify -> estimate or manual -> vehicle value) and the
handoff to issue #3's krt.score()."""

import json
from pathlib import Path

from .pre_quote_service import prepare_survey
from .repair_classifier import classify_repair
from .engine.repair_costs import estimate_from_manual, estimate_from_table
from .models.schemas import (
    CostAgentHandoff,
    CostQuestion,
    CostQuoteRequest,
    CostQuoteResult,
    PFOFactors,
    PreQuoteSurveyRequest,
    RepairShop,
)
from .engine.cost_tables import DISCLAIMER
from .engine.vehicle_value import value_vehicle

SHOPS_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "cost_repair_shops.json"
MILEAGE_QUESTION = CostQuestion(
    field="mileage", prompt="About how many miles are on the car?", input_type="number"
)


def _profile_mileage(profile: dict | None) -> int | None:
    mileage = (profile or {}).get("mileage")
    valid = isinstance(mileage, int) and not isinstance(mileage, bool) and 0 <= mileage <= 1_000_000
    return mileage if valid else None


def nearby_shops(profile_id: str | None) -> list[RepairShop]:
    """Fixture shops for demo profiles."""
    if profile_id is None:
        return []
    with SHOPS_FIXTURE.open(encoding="utf-8") as fixture:
        names = json.load(fixture).get(profile_id, [])
    return [RepairShop(name=name, source="fixture") for name in names]


def build_quote(req: CostQuoteRequest, profile: dict | None, as_of_year: int) -> CostQuoteResult:
    q = req.quote_input
    classification = classify_repair(q.repair_type)
    questions: list[CostQuestion] = []

    # A real shop quote always wins over the table.
    if req.manual_quote is not None:
        repair = estimate_from_manual(req.manual_quote, classification.category, classification.label)
    elif classification.quotable:
        repair = estimate_from_table(
            classification.category, q.vehicle_model, q.vehicle_year, q.location, as_of_year,
            classification.label,
        )
    else:
        repair = None
        questions.append(CostQuestion(
            field="manual_quote",
            prompt=f"{classification.reason} If you already have a quote, enter the total amount.",
            input_type="number",
        ))

    if req.mileage is not None:
        mileage, source = req.mileage, "user"
    else:
        mileage, source = _profile_mileage(profile), "profile"
    if mileage is None:
        vehicle = None
        questions.append(MILEAGE_QUESTION)
    else:
        vehicle = value_vehicle(q.vehicle_model, q.vehicle_year, mileage, source, as_of_year)

    return CostQuoteResult(
        profile_id=req.profile_id,
        quote_input=q,
        classification=classification,
        needs_manual=repair is None,
        questions=questions,
        repair=repair,
        vehicle=vehicle,
        nearby_shops=nearby_shops(req.profile_id),
        complete=repair is not None and vehicle is not None,
        disclaimer=DISCLAIMER,
    )


def build_handoff(quote: CostQuoteResult, factors: PFOFactors) -> CostAgentHandoff:
    """Combine a complete /quote result and complete PFO factors into krt.score() inputs."""
    if not quote.complete or quote.repair is None or quote.vehicle is None:
        raise ValueError("Quote is incomplete: answer its questions before scoring")
    return CostAgentHandoff(
        profile_id=quote.profile_id,
        quote_input=quote.quote_input,
        repair=quote.repair,
        vehicle=quote.vehicle,
        pfo_factors=factors,
        repair_cost=quote.repair.repair_cost_estimate,
        car_value=quote.vehicle.trade_in_estimate,
    )


def quote_for_profile(profile: dict, as_of_year: int) -> CostQuoteResult:
    """Run the survey + Cost Agent on a stored profile's own open_issue, with no user input.

    /analyze uses this when the client doesn't send a quote, so it still prices the repair
    with the Cost Agent. The result may be incomplete (e.g. a symptom that needs a manual quote).
    """
    survey = prepare_survey(PreQuoteSurveyRequest(profile_id=profile.get("id")), profile)
    if survey.quote_input is None:
        missing = ", ".join(survey.missing_fields)
        raise ValueError(f"Profile is missing {missing}; complete POST /pre-quote-survey first")
    req = CostQuoteRequest(profile_id=profile.get("id"), quote_input=survey.quote_input)
    return build_quote(req, profile, as_of_year=as_of_year)
