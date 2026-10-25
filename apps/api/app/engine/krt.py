from app.models.schemas import (KRTResult, PFOFactors, Profile, MarketData, AffordabilityResult, SuggestedModel)
from datetime import date

from app.engine import insurance, replacement

L_EXPECTED = 200000
AVG_UNSCHED_REPAIRS = 0.3
HORIZON = 36

MILEAGE_SCALER = 100000
BASE_REPAIR_COST = 1000
PRICE_TIER_SCALER = 15000

# fallbacks for PFOFactors not supplying
DEFAULT_APR = 0.07
DEFAULT_DOWN_PCT = 0.2
LOAN_TERM_MONTHS = 60
NO_SPEND_RUNWAY_MONTHS = 24.0  # pr_runway when there's no monthly spending to divide by

# translate credit confidence into a rough estimate apr
CREDIT_CONFIDENCE_APR = {
    "high": 0.055,
    "medium": DEFAULT_APR,
    "low": 0.11,
}

CAR_USAGE_MULTIPLIER = {
    "low": 0.75,
    "medium": 1.0,
    "high": 1.3,
}

# PFOFactor weights based on output
INCOME_OUTLOOK_MARGIN = {"increasing": -0.05, "stable": 0.0, "decreasing": 0.12, "uncertain": 0.05}
JOB_STABILITY_MARGIN = {"secure": 0.0, "at_risk": 0.15, "unknown": 0.0}
DEBT_LOAD_MARGIN = {"none": 0.0, "light": 0.04, "heavy": 0.10}
RISK_TOLERANCE_SCALER = {"low": 1.3, "medium": 1.0, "high": 0.7}
UPCOMING_EXPENSE_MARGIN = 0.06
WINDFALL_RELIEF = 0.05


def new_debt_risk_margin(pfo: PFOFactors) -> float:
    margin = (
        INCOME_OUTLOOK_MARGIN[pfo.income_outlook]
        + JOB_STABILITY_MARGIN[pfo.job_stability]
        + DEBT_LOAD_MARGIN[pfo.other_debt_load]
    )
    if pfo.upcoming_major_expense:
        margin += UPCOMING_EXPENSE_MARGIN
    if pfo.windfall_expected:
        margin -= WINDFALL_RELIEF
    margin *= RISK_TOLERANCE_SCALER[pfo.payment_risk_tolerance]
    return max(0.0, margin)


def score(
    profile: Profile,
    car_value: float,
    afford: AffordabilityResult,
    market: MarketData,
    repair_cost: float,
    snapshot: dict,
    pfo_factors: PFOFactors | None = None) -> KRTResult:
    pfo_factors = pfo_factors or PFOFactors()
    apr = pfo_factors.apr if pfo_factors.apr is not None else CREDIT_CONFIDENCE_APR[pfo_factors.credit_confidence]
    usage_multiplier = CAR_USAGE_MULTIPLIER[pfo_factors.car_usage]

    # derived Inputs
    repair_ratio = repair_cost / car_value
    equity = car_value - profile.loan_balance
    if afford.monthly_spend > 0:
        pr_runway = (afford.savings_balance - repair_cost) / afford.monthly_spend
    else:
        # No spending recorded (e.g. a typed-in profile with $0): runway can't be measured, so
        # keep the sign (negative = savings don't cover the repair) and cap it at two years.
        pr_runway = -1.0 if afford.savings_balance < repair_cost else NO_SPEND_RUNWAY_MONTHS
    remaining_life = max(0, 1 - (profile.mileage / L_EXPECTED))
    lifetime_average = profile.mileage / (12 * (date.today().year - profile.vehicle_year) + 6)

    # scheduled maintenence costs, scaled by self-reported forward usage rather than pure history
    m_sched = (
        sum(task.cost / task.interval for task in market.scheduled_maintenance)
        * lifetime_average
        * usage_multiplier
    )

    # unscheduled repair costs (stochastic)
    aging_factor = calculate_aging_factor(profile.mileage)
    average_repair_cost = calculate_average_repair_cost(profile.mileage, car_value)
    m_unsched = (AVG_UNSCHED_REPAIRS * aging_factor * average_repair_cost * usage_multiplier) / 12

    total_m = m_sched + m_unsched

    ins_now = insurance.current_premium(profile, snapshot, car_value)
    miles_per_month = lifetime_average * usage_multiplier
    catalog = replacement.load_catalog()
    fuel_now = replacement.current_fuel(profile.vehicle_model, miles_per_month, catalog)
    risk_margin = new_debt_risk_margin(pfo_factors)

    # Costs per month over economic horizon

    # Keep: the repair cost over the horizon, total monthly repair expenses and the current monthly insurance payment
    c_keep = repair_cost / HORIZON + total_m + profile.monthly_payment

    # Trade: price every replacement option, then use the best pick for c_trade
    options = [
        trade_option(o, car_value, equity, apr, pfo_factors, ins_now, fuel_now, miles_per_month, risk_margin, catalog)
        for o in market.replacement_options
    ]
    suggested, trade_affordable = replacement.pick(options, pfo_factors, afford)
    best = suggested[0]
    c_trade = best.monthly_cost
    new_payment = best.new_payment

    # Refinance: keep the car, re-amortize the remaining balance at the PFO APR
    refi_payment = loan_payment(profile.loan_balance, apr, LOAN_TERM_MONTHS)
    c_refinance = c_keep - profile.monthly_payment + refi_payment

    c_refinance *= 1 + risk_margin / 2

    return KRTResult(
        keepResult=round(c_keep, 2),
        refinanceResult=round(c_refinance, 2),
        tradeResult=round(c_trade, 2),
        repair_ratio=repair_ratio,
        pr_runway=pr_runway,
        remaining_life=remaining_life,
        new_payment=new_payment,
        refi_payment=refi_payment,
        suggested_models=suggested,
        trade_affordable=trade_affordable,
    )

def trade_option(option, car_value, equity, apr, pfo_factors, ins_now, fuel_now, miles_per_month, risk_margin, catalog) -> SuggestedModel:
    specs = replacement.specs_for(option["name"], catalog)
    price = option["price"]
    down = pfo_factors.down_payment if pfo_factors.down_payment is not None else DEFAULT_DOWN_PCT * price
    financed = max(0, price - down - equity)
    payment = loan_payment(financed, apr, LOAN_TERM_MONTHS)
    ins_delta = insurance.trade_premium(ins_now, car_value, price) - ins_now
    fuel_delta = replacement.monthly_fuel(specs["mpg"], miles_per_month) - fuel_now
    cost = (down / HORIZON + payment + ins_delta + fuel_delta) * (1 + risk_margin)
    return SuggestedModel(
        name=option["name"],
        price=price,
        kind=option.get("kind", "used"),
        seats=specs["seats"],
        mpg=specs["mpg"],
        body=specs["body"],
        down_payment=round(down, 2),
        new_payment=round(payment, 2),
        insurance_delta=round(ins_delta, 2),
        fuel_delta=round(fuel_delta, 2),
        monthly_cost=round(cost, 2),
    )

def loan_payment(principal, apr, months):
    if principal <= 0:
        return 0.0
    r = apr / 12
    if r == 0:
        return principal / months
    return principal * r / (1 - (1 + r) ** -months)
    
def calculate_aging_factor(mileage):
    scaled_milage = (mileage / MILEAGE_SCALER) ** 1.5
    return 1 + 0.54 * scaled_milage
    
def calculate_average_repair_cost(mileage, car_value):
    wear_drift = (1 + 0.15 * (mileage / MILEAGE_SCALER)) 
    price_tier = (car_value / PRICE_TIER_SCALER) ** 0.3
    
    return BASE_REPAIR_COST * wear_drift * price_tier
