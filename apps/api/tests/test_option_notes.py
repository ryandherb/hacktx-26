"""Pros/cons per option (app/option_notes.py): short, deterministic, and only restating given numbers."""

import pytest
from fastapi.testclient import TestClient

from app import option_notes
from app.clients import llm
from app.main import app
from app.models.schemas import KRTResult, SuggestedModel

client = TestClient(app)

PICK = SuggestedModel(
    name="2021 Camry LE (CPO)", price=24500, kind="cpo", seats=5, mpg=32, body="sedan",
    down_payment=4900, new_payment=291.1, insurance_delta=57.17, fuel_delta=-16.2,
    monthly_cost=430.0, reason="lowest monthly cost of the cars that fit",
)


def ctx(keep: float, refi: float, trade: float, affordable: bool = True, **krt_overrides) -> dict:
    fields = dict(
        keepResult=keep, refinanceResult=refi, tradeResult=trade, repair_ratio=0.6, pr_runway=2.0,
        remaining_life=0.26, new_payment=291.1, refi_payment=83.2, suggested_models=[PICK],
        trade_affordable=affordable,
    )
    krt = KRTResult(**{**fields, **krt_overrides})
    return {"recommendation": "keep", "krt": krt, "repair_cost": 3000.0}


@pytest.mark.parametrize("pid", ["maria", "dev", "sam"])
def test_analyze_returns_notes_for_every_option(pid):
    body = client.post("/analyze", json={"profile_id": pid}).json()
    notes = body["option_notes"]
    assert set(notes) == {"keep", "trade", "refinance"}
    for n in notes.values():
        assert len(n["pros"]) <= 3 and len(n["cons"]) <= 3
    rec = body["recommendation"]
    assert notes[rec]["pros"][0].startswith("Lowest monthly cost")


def test_only_given_numbers():
    c = ctx(612.4, 612.4, 430.0, repair_ratio=1.25, pr_runway=-0.4, remaining_life=0.05)
    facts = llm._build_facts(c)
    for n in option_notes.build(c).values():
        for text in n.pros + n.cons:
            assert llm._invented_numbers(text, facts) == [], text


def test_cheapest_cost_is_a_pro_others_are_cons():
    notes = option_notes.build(ctx(612.4, 612.4, 430.0))
    assert notes["trade"].pros[0] == "Lowest monthly cost: about $430/mo"
    assert notes["keep"].cons[0] == "Costs about $612/mo"
    assert not any("Lowest" in p for p in notes["keep"].pros)


def test_refinance_unavailable_without_a_loan():
    n = option_notes.build(ctx(205.0, 205.0, 372.0))["refinance"]
    assert n.available is False and n.pros == []
    assert n.cons == ["You don't have a car loan to refinance"]


def test_refinance_with_a_loan():
    n = option_notes.build(ctx(389.0, 162.0, 488.0))["refinance"]
    assert n.available is True
    assert "Loan payment drops to about $83/mo" in n.pros
    assert "Still pay the $3,000 repair" in n.cons


def test_trade_over_budget_and_extras():
    n = option_notes.build(ctx(205.0, 205.0, 372.0, affordable=False))["trade"]
    assert "Newer car: 2021 Camry LE (CPO)" in n.pros
    assert "Saves about $16/mo on gas" in n.pros
    assert "Over your comfortable monthly payment" in n.cons
    assert "$4,900 down payment" in n.cons


def test_missing_krt_gives_no_notes():
    assert option_notes.build({"recommendation": "keep"}) == {}
