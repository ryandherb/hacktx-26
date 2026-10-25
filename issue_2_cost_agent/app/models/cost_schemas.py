"""Request/response models for the Cost Agent (issue #2). Mirrored in web/lib/cost_api.ts."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from issue_1_pre_quote_survey.app.models.pre_quote_schemas import PreQuoteInput, SurveyText  # UNPACK: becomes from .pre_quote_schemas

Money = Annotated[float, Field(ge=0, le=1_000_000)]
Mileage = Annotated[int, Field(strict=True, ge=0, le=1_000_000)]
ShopName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ReplyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]

CreditBand = Literal["excellent", "good", "fair", "poor", "unknown"]
IncomeStability = Literal["growing", "steady", "at_risk", "unsure"]
DebtLoad = Literal["none", "light", "heavy"]
Level = Literal["low", "medium", "high"]
PfoField = Literal[
    "down_payment", "credit_band", "other_debt_load", "upcoming_major_expense", "income_stability", "car_usage"
]


# ---------- /quote ----------

class ManualQuote(BaseModel):
    """A real-world quote the customer already has from a shop."""

    model_config = ConfigDict(extra="forbid")

    amount: Annotated[float, Field(gt=0, le=100_000)]
    shop: ShopName | None = None


class CostQuoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile_id: SurveyText | None = None
    quote_input: PreQuoteInput  # from POST /pre-quote-survey once complete is true
    mileage: Mileage | None = None  # overrides the profile's mileage
    manual_quote: ManualQuote | None = None


class RepairClassification(BaseModel):
    category: str | None  # REPAIR_CATEGORIES or SYMPTOMS key; None when unrecognized
    label: str | None
    kind: Literal["repair", "symptom", "multiple", "unknown"]
    quotable: bool
    confidence: float
    method: Literal["llm", "keyword"]
    reason: str


class RepairEstimate(BaseModel):
    source: Literal["table", "manual"]
    category: str | None
    label: str
    repair_cost_low: float
    repair_cost_high: float
    repair_cost_estimate: float  # high end, per issue #2
    model_multiplier: float | None = None
    age_multiplier: float | None = None
    region_multiplier: float | None = None
    region: str | None = None
    shop: str | None = None


class VehicleValue(BaseModel):
    model_recognized: bool
    vehicle_age_years: int
    mileage: int
    mileage_source: Literal["profile", "user"]
    private_sale_low: float
    private_sale_high: float
    private_sale_estimate: float
    trade_in_low: float
    trade_in_high: float
    trade_in_estimate: float


class RepairShop(BaseModel):
    name: str
    source: Literal["fixture"]


class CostQuestion(BaseModel):
    field: Literal["manual_quote", "mileage"]
    prompt: str
    input_type: Literal["number"]


class CostQuoteResult(BaseModel):
    profile_id: str | None
    quote_input: PreQuoteInput
    classification: RepairClassification
    needs_manual: bool
    questions: list[CostQuestion]
    repair: RepairEstimate | None
    vehicle: VehicleValue | None
    nearby_shops: list[RepairShop]
    complete: bool
    disclaimer: str


# ---------- /onboarding (PFO) ----------

class PfoAnswers(BaseModel):
    """What the survey asks. Mapped onto PFOFactors by app/pfo_agent.py."""

    model_config = ConfigDict(extra="forbid")

    down_payment: Money | None = None
    credit_band: CreditBand | None = None
    other_debt_load: DebtLoad | None = None
    upcoming_major_expense: bool | None = None  # within the next 12 months
    income_stability: IncomeStability | None = None
    car_usage: Level | None = None


class PFOFactors(BaseModel):
    """Same fields as issue #3's PFOFactors in apps/api/app/models/schemas.py; replace with
    that model at integration. krt.score() reads `apr` and `down_payment` today."""

    apr: float | None = None
    down_payment: float | None = None
    income_outlook: Literal["increasing", "stable", "decreasing", "uncertain"] = "stable"
    job_stability: Literal["secure", "at_risk", "unknown"] = "unknown"
    upcoming_major_expense: bool = False
    other_debt_load: DebtLoad
    windfall_expected: bool = False
    payment_risk_tolerance: Level = "medium"
    household_members: int | None = 1
    car_usage: Level = "medium"
    credit_confidence: Level


class PfoReply(BaseModel):
    """Free-text answer to one question. Structured form values go in `answers` instead."""

    model_config = ConfigDict(extra="forbid")

    field: PfoField
    text: ReplyText


class OnboardingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answers: PfoAnswers = Field(default_factory=PfoAnswers)
    reply: PfoReply | None = None


class PfoOption(BaseModel):
    value: str
    label: str


class PfoQuestion(BaseModel):
    field: PfoField
    prompt: str
    input_type: Literal["number", "choice"]
    unit: Literal["dollars"] | None = None
    options: list[PfoOption] = Field(default_factory=list)


class OnboardingResult(BaseModel):
    answers: PfoAnswers
    question: PfoQuestion | None  # next (or repeated) question; None when complete
    retry: bool  # true when the last reply could not be understood
    message: str | None
    answered: int
    total: int
    accepts_free_text: bool  # true when Muse is configured; otherwise render a form
    complete: bool
    factors: PFOFactors | None


# ---------- handoff to issue #3 ----------

class CostAgentHandoff(BaseModel):
    """Everything krt.score() needs from the Cost Agent. Built by cost_agent.build_handoff()
    from a complete CostQuoteResult and complete PFO factors (the backend is stateless)."""

    profile_id: str | None
    quote_input: PreQuoteInput
    repair: RepairEstimate
    vehicle: VehicleValue
    pfo_factors: PFOFactors
    repair_cost: float  # krt.score(repair_cost=...): repair.repair_cost_estimate, the high end
    car_value: float  # krt.score(car_value=...): vehicle.trade_in_estimate (equity if traded in)

    def krt_arguments(self) -> dict:
        """Keyword arguments for krt.score(); the route adds profile, afford, market, snapshot."""
        return {
            "car_value": self.car_value,
            "repair_cost": self.repair_cost,
            "pfo_factors": self.pfo_factors,  # krt.score() reads attributes (pfo_factors.apr, ...)
        }
