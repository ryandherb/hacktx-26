from app.engine import krt, replacement
from app.models.schemas import AffordabilityResult, MarketData, PFOFactors
from app.seeds.loader import get_profile, load_fixture

AFFORD = AffordabilityResult(
    monthly_income=4600, monthly_spend=3100, savings_balance=9800, monthly_surplus=1500,
    runway_months=3.2, can_afford_payment=True, max_comfortable_payment=1200,
)


def _score(pid, pfo=None, afford=AFFORD):
    p, m = get_profile(pid), MarketData(**load_fixture("market")[pid])
    return krt.score(p, 4900, afford, m, 3000, load_fixture("nessie")[pid], pfo)


def test_specs_match_longest_model_name():
    catalog = replacement.load_catalog()
    assert replacement.specs_for("2022 RAV4 Hybrid LE (CPO)", catalog)["mpg"] == 40
    assert replacement.specs_for("2021 RAV4 XLE (CPO)", catalog)["mpg"] == 30
    assert replacement.specs_for("2022 Corolla Cross L", catalog)["body"] == "suv"
    assert replacement.specs_for("Mystery Car", catalog) == replacement.DEFAULT_SPECS


def test_picks_are_ranked_by_monthly_cost():
    picks = _score("maria").suggested_models
    assert 1 <= len(picks) <= replacement.TOP_N
    costs = [o.monthly_cost for o in picks]
    assert costs == sorted(costs)
    assert picks[0].reason


def test_household_size_filters_out_small_cars():
    picks = _score("sam", PFOFactors(household_members=7)).suggested_models
    assert [o.name for o in picks] == ["2026 Sienna LE"]
    assert "seats 8" in picks[0].reason


def test_unaffordable_trade_is_flagged():
    tight = AFFORD.model_copy(update={"max_comfortable_payment": 50})
    r = _score("maria", afford=tight)
    assert r.trade_affordable is False
    assert "over your comfortable payment" in r.suggested_models[0].reason


def test_hybrid_saves_on_gas():
    picks = {o.name: o for o in _score("maria").suggested_models}
    hybrid = picks.get("2022 Camry Hybrid LE (CPO)")
    assert hybrid is None or hybrid.fuel_delta < 0
