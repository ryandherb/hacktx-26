from app.engine import insurance, krt, valuation
from app.models.schemas import AffordabilityResult, MaintenanceTask, MarketData, PFOFactors
from app.seeds.loader import get_profile, load_fixture

AFFORD = AffordabilityResult(
    monthly_income=4600, monthly_spend=3100, savings_balance=9800, monthly_surplus=1500,
    runway_months=3.2, can_afford_payment=True, max_comfortable_payment=1200,
)


def _market(pid):
    data = load_fixture("market")[pid]
    data.setdefault("scheduled_maintenance", [MaintenanceTask(cost=60, interval=5000)])
    return MarketData(**data)


def test_score_returns_monthly_costs():
    p, m = get_profile("maria"), _market("maria")
    r = krt.score(p, valuation.current_value(m), AFFORD, m, 3000, load_fixture("nessie")["maria"])
    assert r.keepResult > 0 and r.tradeResult > 0
    assert r.refinanceResult == r.keepResult  # no loan to refinance


def test_trade_cost_is_best_pick_with_insurance_and_fuel():
    p, m = get_profile("maria"), _market("maria")
    snap = load_fixture("nessie")["maria"]
    r = krt.score(p, 4900, AFFORD, m, 3000, snap)
    best = r.suggested_models[0]
    assert r.tradeResult == best.monthly_cost
    assert r.new_payment == best.new_payment
    assert best.insurance_delta == round(insurance.trade_premium(128, 4900, best.price) - 128, 2)
    parts = best.down_payment / krt.HORIZON + best.new_payment + best.insurance_delta + best.fuel_delta
    assert abs(best.monthly_cost - parts) < 0.05


def test_loan_payment():
    assert krt.loan_payment(0, 0.07, 60) == 0
    assert round(krt.loan_payment(20000, 0.07, 60), 2) == 396.02


def test_default_pfo_factors_match_no_pfo_factors():
    p, m = get_profile("maria"), _market("maria")
    snap = load_fixture("nessie")["maria"]
    r_none = krt.score(p, 4900, AFFORD, m, 3000, snap)
    r_default = krt.score(p, 4900, AFFORD, m, 3000, snap, PFOFactors())
    assert r_none == r_default


def test_shaky_finances_raise_trade_and_refinance_but_not_keep():
    p, m = get_profile("maria"), _market("maria")
    snap = load_fixture("nessie")["maria"]
    baseline = krt.score(p, 4900, AFFORD, m, 3000, snap)
    shaky = PFOFactors(
        income_outlook="decreasing",
        job_stability="at_risk",
        other_debt_load="heavy",
        upcoming_major_expense=True,
    )
    stressed = krt.score(p, 4900, AFFORD, m, 3000, snap, shaky)
    assert stressed.keepResult == baseline.keepResult
    assert stressed.tradeResult > baseline.tradeResult
    assert stressed.refinanceResult > baseline.refinanceResult
    # trade takes on a brand new loan, so it should absorb more of the risk margin than refinance
    trade_bump = stressed.tradeResult / baseline.tradeResult
    refi_bump = stressed.refinanceResult / baseline.refinanceResult
    assert trade_bump > refi_bump


def test_credit_confidence_sets_apr_when_pfo_apr_missing():
    p, m = get_profile("maria"), _market("maria")
    snap = load_fixture("nessie")["maria"]
    low_conf = krt.score(p, 4900, AFFORD, m, 3000, snap, PFOFactors(credit_confidence="low"))
    high_conf = krt.score(p, 4900, AFFORD, m, 3000, snap, PFOFactors(credit_confidence="high"))
    # a worse assumed rate should never make the trade cheaper
    assert low_conf.tradeResult > high_conf.tradeResult


def test_explicit_apr_overrides_credit_confidence():
    p, m = get_profile("maria"), _market("maria")
    snap = load_fixture("nessie")["maria"]
    explicit = krt.score(p, 4900, AFFORD, m, 3000, snap, PFOFactors(apr=0.2, credit_confidence="high"))
    high_conf = krt.score(p, 4900, AFFORD, m, 3000, snap, PFOFactors(credit_confidence="high"))
    assert explicit.tradeResult > high_conf.tradeResult


def test_high_car_usage_raises_keep_cost():
    p, m = get_profile("maria"), _market("maria")
    snap = load_fixture("nessie")["maria"]
    baseline = krt.score(p, 4900, AFFORD, m, 3000, snap)
    heavy_use = krt.score(p, 4900, AFFORD, m, 3000, snap, PFOFactors(car_usage="high"))
    assert heavy_use.keepResult > baseline.keepResult
