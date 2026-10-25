from app.engine import insurance
from app.models.schemas import Profile
from app.seeds.loader import get_profile, load_fixture


def test_premium_read_from_nessie_purchases():
    snap = load_fixture("nessie")["maria"]
    assert insurance.premium_from_snapshot(snap) == 128


def test_profile_override_wins():
    p = get_profile("maria").model_copy(update={"insurance_premium": 200.0})
    assert insurance.current_premium(p, load_fixture("nessie")["maria"], 4900) == 200.0


def test_fallback_when_no_insurance_purchases():
    p = get_profile("maria")
    est = insurance.current_premium(p, {"purchases": []}, 4900)
    assert est > insurance.BASE_LIABILITY_MONTHLY


def test_trade_premium_rises_with_vehicle_value():
    new = insurance.trade_premium(128, 4900, 24500)
    assert new > 128
    # liability portion carries over; only physical damage scales with value
    assert new == round(128 - 4900 * 0.035 / 12 + 24500 * 0.035 / 12, 2)
