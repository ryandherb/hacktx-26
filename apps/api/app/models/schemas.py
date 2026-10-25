from typing import Literal

from pydantic import BaseModel, Field


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


class AnalysisRequest(BaseModel):
    profile_id: str
    horizon_months: int = 36
    replacement_price: float | None = None  # override default replacement option
    down_payment: float | None = None


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
    reccomendation: Literal["keep", "refinance", "trade"]
    result: KRTResult
    new_monthly_payment: float
    
    suggested_models: list[SuggestedModel] | None = None 
    
    apr: float
    down_payment: float


class CarFundRequest(BaseModel):
    profile_id: str
    monthly_amount: float
    target_amount: float


class CarFundResult(BaseModel):
    account_id: str
    monthly_amount: float
    target_amount: float
    simulated: bool
