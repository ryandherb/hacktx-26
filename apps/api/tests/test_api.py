from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_profiles():
    r = client.get("/profiles")
    assert r.status_code == 200
    assert len(r.json()) >= 3


def test_analyze_runs_end_to_end():
    r = client.post("/analyze", json={"profile_id": "maria"})
    assert r.status_code == 200
    body = r.json()
    assert body["profile_id"] == "maria"
    assert body["recommendation"] in {"keep", "trade", "refinance"}
    assert body["result"]["keepResult"] > 0
    assert "not financial advice" in body["explanation"]
    assert "not financial advice" in body["explanation_details"]
    assert len(body["explanation"]) < len(body["explanation_details"])
    assert body["result"]["suggested_models"]


def test_analyze_profiles_get_different_explanations():
    texts = {
        pid: client.post("/analyze", json={"profile_id": pid}).json()["explanation"]
        for pid in ("maria", "dev", "sam")
    }
    assert len(set(texts.values())) == 3


def test_unknown_profile_404():
    assert client.post("/analyze", json={"profile_id": "nope"}).status_code == 404


MARIA_QUOTE_INPUT = {"repair_type": "transmission slipping", "vehicle_model": "Camry",
                     "vehicle_year": 2012, "location": "78704"}
PFO_ANSWERS = {"down_payment": 6000, "credit_band": "good", "other_debt_load": "none",
               "upcoming_major_expense": False, "income_stability": "growing", "car_usage": "high"}


def test_full_flow_survey_quote_onboarding_analyze():
    survey = client.post("/pre-quote-survey", json={"profile_id": "maria"}).json()
    assert survey["complete"]
    quote = client.post("/quote", json={"profile_id": "maria", "quote_input": survey["quote_input"]}).json()
    assert quote["complete"] and quote["repair"]["source"] == "table"
    pfo = client.post("/onboarding", json={"answers": PFO_ANSWERS}).json()
    assert pfo["complete"]

    r = client.post("/analyze", json={"profile_id": "maria", "quote": quote, "pfo_factors": pfo["factors"]})
    assert r.status_code == 200
    body = r.json()
    assert body["apr"] == pfo["factors"]["apr"]
    assert body["down_payment"] == 6000
    # The explanation restates the Cost Agent's repair estimate, not market.json's quotes.
    assert f"${quote['repair']['repair_cost_estimate']:,.0f}" in body["explanation_details"]


def test_analyze_uses_manual_quote():
    quote = client.post("/quote", json={"profile_id": "maria", "quote_input": MARIA_QUOTE_INPUT,
                                        "manual_quote": {"amount": 1234}}).json()
    body = client.post("/analyze", json={"profile_id": "maria", "quote": quote}).json()
    assert "$1,234" in body["explanation_details"]


def test_analyze_without_quote_prices_open_issue_with_cost_agent():
    quote = client.post("/quote", json={"profile_id": "dev", "quote_input": {
        "repair_type": "A/C compressor failing", "vehicle_model": "Corolla",
        "vehicle_year": 2010, "location": "78745"}}).json()
    with_quote = client.post("/analyze", json={"profile_id": "dev", "quote": quote}).json()
    without = client.post("/analyze", json={"profile_id": "dev"}).json()
    assert with_quote["result"] == without["result"]


def test_analyze_rejects_incomplete_quote():
    quote = client.post("/quote", json={"profile_id": "maria", "quote_input": {
        **MARIA_QUOTE_INPUT, "repair_type": "making a weird noise"}}).json()
    assert quote["needs_manual"]
    r = client.post("/analyze", json={"profile_id": "maria", "quote": quote})
    assert r.status_code == 422


def _bank(income, spending, savings, checking=500, insurance=120):
    months = ("2026-08", "2026-09", "2026-10")
    return {
        "accounts": [{"type": "Checking", "balance": checking}, {"type": "Savings", "balance": savings}],
        "deposits": [{"amount": income, "transaction_date": f"{m}-01", "description": "Payroll"} for m in months],
        "purchases": [p for m in months for p in (
            {"amount": insurance, "transaction_date": f"{m}-05", "description": "Auto insurance"},
            {"amount": spending - insurance, "transaction_date": f"{m}-15", "description": "Monthly spending"},
        )],
    }


def _custom(year, mileage, issue, bank, loan_balance=0, monthly_payment=0):
    return {"name": "Judge", "vehicle_model": "Camry", "vehicle_year": year, "mileage": mileage,
            "zip_code": "78758", "loan_balance": loan_balance, "monthly_payment": monthly_payment,
            "open_issue": issue, "bank": bank}


def _analyze_custom(custom, pfo_answers=PFO_ANSWERS):
    survey_input = {"repair_type": custom["open_issue"], "vehicle_model": "Camry",
                    "vehicle_year": custom["vehicle_year"], "location": custom["zip_code"]}
    quote = client.post("/quote", json={"quote_input": survey_input, "mileage": custom["mileage"]}).json()
    pfo = client.post("/onboarding", json={"answers": pfo_answers}).json()
    r = client.post("/analyze", json={"profile_id": "custom", "custom_profile": custom,
                                      "quote": quote, "pfo_factors": pfo["factors"]})
    assert r.status_code == 200, r.text
    return r.json()


def test_custom_profile_runs_end_to_end():
    body = _analyze_custom(_custom(2015, 126000, "brake pads", _bank(3900, 3100, 5200)))
    assert body["profile_id"] == "custom"
    assert body["recommendation"] in {"keep", "trade", "refinance"}
    assert body["affordability"]["monthly_income"] == 3900
    assert body["market"]["current_vehicle_value_low"] > 0  # from the Cost Agent, not market.json
    assert "not financial advice" in body["explanation"]


def test_custom_profile_results_follow_the_numbers():
    cheap = _analyze_custom(_custom(2017, 90000, "brake pads", _bank(2500, 2400, 800)))
    financed = _analyze_custom(_custom(2019, 70000, "transmission slipping", _bank(3500, 3200, 1500),
                                       loan_balance=9000, monthly_payment=320),
                               {**PFO_ANSWERS, "down_payment": 0, "credit_band": "fair"})
    assert cheap["recommendation"] == "keep"
    assert financed["recommendation"] == "refinance"  # a loan to refinance and a costly repair
    assert financed["result"]["keepResult"] > cheap["result"]["keepResult"]
    assert financed["result"]["repair_ratio"] > cheap["result"]["repair_ratio"]


def test_custom_profile_without_issue_or_quote_is_rejected():
    r = client.post("/analyze", json={"profile_id": "custom",
                                      "custom_profile": _custom(2015, 126000, None, _bank(3900, 3100, 5200))})
    assert r.status_code == 422


def test_custom_profile_requires_profile_body():
    assert client.post("/analyze", json={"profile_id": "custom"}).status_code == 422


def test_analyze_rejects_quote_for_another_profile():
    quote = client.post("/quote", json={"profile_id": "maria", "quote_input": MARIA_QUOTE_INPUT}).json()
    r = client.post("/analyze", json={"profile_id": "dev", "quote": quote})
    assert r.status_code == 422
