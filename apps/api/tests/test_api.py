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


def test_analyze_rejects_quote_for_another_profile():
    quote = client.post("/quote", json={"profile_id": "maria", "quote_input": MARIA_QUOTE_INPUT}).json()
    r = client.post("/analyze", json={"profile_id": "dev", "quote": quote})
    assert r.status_code == 422


# Demo answers from the web app's PFO step for each demo profile.
MARIA_PFO = {"down_payment": 6500, "credit_band": "excellent", "other_debt_load": "none",
             "upcoming_major_expense": False, "income_stability": "growing", "car_usage": "medium"}
DEV_PFO = {"down_payment": 0, "credit_band": "fair", "other_debt_load": "none",
           "upcoming_major_expense": False, "income_stability": "at_risk", "car_usage": "medium"}


def _demo(pid, pfo_answers, manual_quote=None):
    survey = client.post("/pre-quote-survey", json={"profile_id": pid}).json()
    body = {"profile_id": pid, "quote_input": survey["quote_input"]}
    if manual_quote:
        body["manual_quote"] = manual_quote
    quote = client.post("/quote", json=body).json()
    pfo = client.post("/onboarding", json={"answers": pfo_answers}).json()["factors"]
    return client.post("/analyze", json={"profile_id": pid, "quote": quote, "pfo_factors": pfo}).json()


def test_demo_profiles_get_different_recommendations():
    maria = _demo("maria", MARIA_PFO)
    dev = _demo("dev", DEV_PFO, {"amount": 1450, "shop": "South Austin Auto A/C"})
    assert maria["recommendation"] == "trade"  # 50% rule: repair is worth more than the car
    assert maria["suggested_models"][0]["name"].startswith("2026 ")
    assert "trading in is your best move" in maria["explanation"]
    assert dev["recommendation"] == "keep"  # no replacement fits his budget


def test_every_option_gets_a_brief_and_detailed_explanation():
    for body in (_demo("maria", MARIA_PFO), _demo("dev", DEV_PFO, {"amount": 1450, "shop": "South Austin Auto A/C"})):
        opts = body["option_explanations"]
        assert set(opts) == {"keep", "trade", "refinance"}
        assert all(o["brief"] and o["details"] for o in opts.values())
        assert "no loan to refinance" in opts["refinance"]["brief"]
    dev = _demo("dev", DEV_PFO, {"amount": 1450, "shop": "South Austin Auto A/C"})
    assert "quoted at $1,450 by South Austin Auto A/C" in dev["option_explanations"]["keep"]["details"]
