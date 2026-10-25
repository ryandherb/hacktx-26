from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


class ServiceRecord(BaseModel):
    month: str  # "2025-03"
    description: str
    cost: float


class Profile(BaseModel):
    id: str
    name: str
    nessie_customer_id: str | None = None
    vehicle_model: str
    vehicle_year: int
    mileage: int
    zip_code: str
    loan_balance: float = 0.0
    monthly_payment: float = 0.0
    service_history: list[ServiceRecord] = Field(default_factory=list)
    open_issue: str | None = None  # e.g. "transmission slipping"
    insurance_premium: float | None = None  # monthly; manual/PFO override of Nessie


class AffordabilityResult(BaseModel):
    monthly_income: float
    monthly_spend: float
    savings_balance: float
    monthly_surplus: float
    runway_months: float
    can_afford_payment: bool
    max_comfortable_payment: float

class MaintenanceTask(BaseModel):
    cost: float
    interval: int

class MarketData(BaseModel):
    current_vehicle_value_low: float
    current_vehicle_value_high: float
    scheduled_maintenance: list[MaintenanceTask]
    replacement_options: list[dict]  # name, price, kind (new/cpo/used)
    repair_quotes: list[dict]  # shop, estimate, source


class CurvePoint(BaseModel):
    month: int
    keep_cost: float
    replace_cost: float

class PFOFactors(BaseModel):
    apr: float | None = None
    down_payment: float | None = None

    income_outlook: Literal["increasing", "stable", "decreasing", "uncertain"] = "stable"
    job_stability: Literal["secure", "at_risk", "unknown"] = "unknown"

    upcoming_major_expense: bool = False
    other_debt_load: Literal["none", "light", "heavy"] = "none"
    windfall_expected: bool = False

    payment_risk_tolerance: Literal["low", "medium", "high"] = "medium"
    household_members: int | None = 1

    car_usage: Literal["low", "medium", "high"] = "medium"

    credit_confidence: Literal["low", "medium", "high"] = "medium"

class SuggestedModel(BaseModel):
    name: str
    price: float
    kind: str  # new | cpo | used
    seats: int
    mpg: float
    body: str
    down_payment: float
    new_payment: float
    insurance_delta: float
    fuel_delta: float
    monthly_cost: float
    reason: str = ""

class KRTResult(BaseModel):
    keepResult: float
    refinanceResult: float
    tradeResult: float
    repair_ratio: float
    pr_runway: float
    remaining_life: float
    new_payment: float
    refi_payment: float
    suggested_models: list[SuggestedModel]
    trade_affordable: bool

class AnalysisResult(BaseModel):
    profile_id: str = ""
    recommendation: Literal["keep", "refinance", "trade"]
    result: KRTResult
    new_monthly_payment: float

    suggested_models: list[SuggestedModel] | None = None  # only when recommendation == "trade"

    apr: float | None = None  # None when PFO didn't supply one (engine used its default)
    down_payment: float | None = None

    affordability: AffordabilityResult | None = None
    market: MarketData | None = None
    explanation: str = ""  # short, plain-language summary (Explanation Agent)
    explanation_details: str = ""  # longer version with the full numbers (drop-down)

    # Legacy chart data for the old dashboard (app/page.tsx); empty now.
    curve: list[CurvePoint] = Field(default_factory=list)
    crossover_month: int | None = None


class CarFundRequest(BaseModel):
    profile_id: str
    monthly_amount: float
    target_amount: float


class CarFundResult(BaseModel):
    account_id: str
    monthly_amount: float
    target_amount: float
    simulated: bool


# ---------- Pre-quote survey (issue #1): POST /pre-quote-survey ----------

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


# ---------- Cost Agent + PFO Agent (issue #2): POST /quote, POST /onboarding ----------

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
    category: str | None  # REPAIR_CATEGORIES, GENERAL_TIERS, or SYMPTOMS key; None when unrecognized
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


# ---------- POST /analyze ----------
# Defined last because it carries the Cost Agent and PFO results above.

class AnalysisRequest(BaseModel):
    profile_id: str
    horizon_months: int = 36
    replacement_price: float | None = None  # override default replacement option
    down_payment: float | None = None  # used only when pfo_factors is not sent
    # From POST /quote (must be complete). When omitted, /analyze quotes the profile's
    # open_issue itself with the same Cost Agent.
    quote: CostQuoteResult | None = None
    # From POST /onboarding (factors). When omitted, the PFOFactors defaults are used.
    pfo_factors: PFOFactors | None = None
