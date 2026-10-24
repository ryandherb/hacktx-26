"""Stateless pre-quote intake: profile defaults, user corrections, and missing fields."""

from pydantic import ValidationError

from .pre_quote_schemas import (
    PreQuoteInput,
    PreQuoteSurveyAnswers,
    PreQuoteSurveyQuestion,
    PreQuoteSurveyRequest,
    PreQuoteSurveyResult,
)

PROFILE_FIELDS = {
    "repair_type": "open_issue",
    "vehicle_model": "vehicle_model",
    "vehicle_year": "vehicle_year",
    "location": "zip_code",
}
QUESTIONS = (
    PreQuoteSurveyQuestion(field="repair_type", prompt="What repair do you need, or what symptoms are you noticing?", input_type="text"),
    PreQuoteSurveyQuestion(field="vehicle_model", prompt="What model is your Toyota?", input_type="text"),
    PreQuoteSurveyQuestion(field="vehicle_year", prompt="What is your vehicle's model year?", input_type="number"),
    PreQuoteSurveyQuestion(field="location", prompt="Where do you need the repair? Enter a ZIP code or city and state.", input_type="text"),
)


def prepare_survey(req: PreQuoteSurveyRequest, profile: dict | None) -> PreQuoteSurveyResult:
    values = {}
    for field, profile_field in PROFILE_FIELDS.items():
        # Invalid stored values need a user answer, just like absent values.
        try:
            parsed = PreQuoteSurveyAnswers(**{field: (profile or {}).get(profile_field)})
            values[field] = getattr(parsed, field)
        except ValidationError:
            values[field] = None

    # Only explicitly supplied fields override defaults. Null/blank clears a default.
    values.update(req.answers.model_dump(exclude_unset=True))
    answers = PreQuoteSurveyAnswers(**values)
    missing = [question.field for question in QUESTIONS if getattr(answers, question.field) is None]
    return PreQuoteSurveyResult(
        profile_id=req.profile_id,
        answers=answers,
        missing_fields=missing,
        questions=[question for question in QUESTIONS if question.field in missing],
        complete=not missing,
        quote_input=PreQuoteInput(**answers.model_dump()) if not missing else None,
    )
