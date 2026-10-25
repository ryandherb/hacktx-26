from app.models.schemas import (KRTResult, Profile, MarketData, AffordabilityResult)
from datetime import date

from app.engine import insurance, valuation

L_EXPECTED = 200000
AVG_UNSCHED_REPAIRS = 0.3
HORIZON = 36

MILEAGE_SCALER = 100000
BASE_REPAIR_COST = 1000
PRICE_TIER_SCALER = 15000

# Defaults when PFO factors don't supply them
DEFAULT_APR = 0.07
DEFAULT_DOWN_PCT = 0.2
LOAN_TERM_MONTHS = 60

def score(
    profile: Profile, 
    car_value: float, 
    afford: AffordabilityResult, 
    market: MarketData, 
    repair_cost: float,
    snapshot: dict,
    pfo_factors: dict | None = None) -> KRTResult:
    pfo_factors = pfo_factors or {}
    apr = pfo_factors.get("apr", DEFAULT_APR)
    
    # derived Inputs
    repair_ratio = repair_cost / car_value
    equity = car_value - profile.loan_balance
    pr_runway = (afford.savings_balance - repair_cost) / afford.monthly_spend
    remaining_life = max(0, 1 - (profile.mileage / L_EXPECTED))
    lifetime_average = profile.mileage / (12 * (date.today().year - profile.vehicle_year) + 6)
    
    # scheduled maintenence costs
    m_sched = sum(task.cost / task.interval for task in market.scheduled_maintenance) * lifetime_average
    
    # unscheduled repair costs (stochastic)
    aging_factor = calculate_aging_factor(profile.mileage)
    average_repair_cost = calculate_average_repair_cost(profile.mileage, car_value)
    m_unsched = (AVG_UNSCHED_REPAIRS * aging_factor * average_repair_cost) / 12
    
    total_m = m_sched + m_unsched
    
    # insurance calculations
    replacement_price = valuation.default_replacement(market)["price"]
    ins_now = insurance.current_premium(profile, snapshot, car_value)
    ins_trade = insurance.trade_premium(ins_now, car_value, replacement_price)
    ins_delta = ins_trade - ins_now
    
    # Costs per month over economic horizon
    
    # Keep: the repair cost over the horizon, total monthly repair expenses and the current monthly insurance payment
    c_keep = repair_cost / HORIZON + total_m + profile.monthly_payment

    # Trade: equity (negative rolls into the loan) and down payment reduce the financed amount
    down = pfo_factors.get("down_payment", DEFAULT_DOWN_PCT * replacement_price)
    financed = max(0, replacement_price - down - equity)
    new_payment = loan_payment(financed, apr, LOAN_TERM_MONTHS)
    c_trade = down / HORIZON + new_payment + ins_delta

    # Refinance: keep the car, re-amortize the remaining balance at the PFO APR
    refi_payment = loan_payment(profile.loan_balance, apr, LOAN_TERM_MONTHS)
    c_refinance = c_keep - profile.monthly_payment + refi_payment

    return KRTResult(
        keepResult=round(c_keep, 2),
        refinanceResult=round(c_refinance, 2),
        tradeResult=round(c_trade, 2),
        repair_ratio=repair_ratio,
        pr_runway=pr_runway,
        remaining_life=remaining_life
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
