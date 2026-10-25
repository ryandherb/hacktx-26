from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


SurveyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
SurveyYear = Annotated[int, Field(strict=True, ge=1886)]
SurveyField = Literal["repair_type", "vehicle_model", "vehicle_year", "location"]


class PreQuoteSurveyAnswers(BaseModel):
    model_config = ConfigDict(extra="forbid")

    repair_type: SurveyText | None = None
    vehicle_model: SurveyText | None = None
    vehicle_year: SurveyYear | None = None
    location: SurveyText | None = None

    @field_validator("repair_type", "vehicle_model", "location", mode="before")
    @classmethod
    def blank_is_missing(cls, value):
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("vehicle_year")
    @classmethod
    def plausible_model_year(cls, value):
        if value is not None and value > date.today().year + 1:
            raise ValueError("Vehicle year cannot be later than next year")
        return value


class PreQuoteInput(PreQuoteSurveyAnswers):
    """Complete intake contract for the future Cost Agent; no pricing is performed."""

    repair_type: SurveyText
    vehicle_model: SurveyText
    vehicle_year: SurveyYear
    location: SurveyText


class PreQuoteSurveyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile_id: SurveyText | None = None
    answers: PreQuoteSurveyAnswers = Field(default_factory=PreQuoteSurveyAnswers)


class PreQuoteSurveyQuestion(BaseModel):
    field: SurveyField
    prompt: str
    input_type: Literal["text", "number"]


class PreQuoteSurveyResult(BaseModel):
    profile_id: str | None
    answers: PreQuoteSurveyAnswers
    missing_fields: list[SurveyField]
    questions: list[PreQuoteSurveyQuestion]
    complete: bool
    quote_input: PreQuoteInput | None
