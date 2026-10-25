"""Issue #2: quotability, table and manual estimates, vehicle value, PFO, and the Muse client.

Runs fully offline with the LLM disabled; Muse paths are exercised with fakes.
"""

from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from issue_1_pre_quote_survey.pre_quote_api import app as survey_app
from issue_2_cost_agent.app import cost_config, pfo_agent, repair_classifier
from issue_2_cost_agent.app.clients import muse
from issue_2_cost_agent.cost_api import app
from issue_2_cost_agent.app.engine.repair_costs import age_multiplier, estimate_from_table, state_from_location
from issue_2_cost_agent.app.cost_agent import build_handoff
from issue_2_cost_agent.app.cost_config import CostAgentSettings
from issue_2_cost_agent.app.models.cost_schemas import CostQuoteResult, PFOFactors
from issue_2_cost_agent.app.engine.vehicle_value import value_vehicle

client = TestClient(app)
AS_OF = 2026
MARIA_INPUT = {"repair_type": "transmission slipping", "vehicle_model": "Camry",
               "vehicle_year": 2012, "location": "78705"}
# Market fixture ranges for the three demo profiles (apps/api/app/fixtures/market.json).
MARKET_VALUE_RANGES = {
    ("Camry", 2012, 148000): (4200, 5600),
    ("Corolla", 2010, 171000): (2200, 3200),
    ("RAV4", 2014, 112000): (7800, 9600),
}


def use_settings(monkeypatch, **overrides):
    settings = CostAgentSettings(_env_file=None, **overrides)
    monkeypatch.setattr(cost_config, "get_cost_settings", lambda: settings)
    return settings


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def no_network(*args, **kwargs):
        pytest.fail("Cost Agent tests must not make external requests")

    monkeypatch.setattr("httpx.HTTPTransport.handle_request", no_network)
    monkeypatch.setattr("httpx.AsyncHTTPTransport.handle_async_request", no_network)
    use_settings(monkeypatch, llm_provider="none", llm_api_key="")


def fake_llm(monkeypatch, reply):
    calls = []

    def complete_json(system, user):
        calls.append(user)
        return reply(user) if callable(reply) else reply

    monkeypatch.setattr(muse, "complete_json", complete_json)
    return calls


def post(path, payload, status=200):
    response = client.post(path, json=payload)
    assert response.status_code == status, response.text
    return response.json()


# ---------- classification ----------

@pytest.mark.parametrize("text, category", [
    ("transmission slipping", "transmission"),
    ("A/C compressor failing", "ac_compressor"),
    ("check engine light, oxygen sensor", "o2_sensor"),
    ("Brake pads", "brakes"),
    ("brakes grinding", "brakes"),
])
def test_keyword_classifier_quotes_specific_repairs(text, category):
    result = repair_classifier.classify_repair(text)
    assert (result.quotable, result.category, result.kind, result.method) == (True, category, "repair", "keyword")


@pytest.mark.parametrize("text, kind", [
    ("engine not starting", "symptom"),
    ("electricity out", "symptom"),
    ("check engine light is on", "symptom"),
    ("weird noise from the front", "symptom"),
    ("new tires and an alternator", "multiple"),
    ("something feels off", "unknown"),
])
def test_vague_or_multiple_issues_are_not_quotable(text, kind):
    result = repair_classifier.classify_repair(text)
    assert result.quotable is False
    assert result.kind == kind
    assert "shop diagnosis" in result.reason


def test_llm_classification_is_used_when_valid(monkeypatch):
    fake_llm(monkeypatch, {"category": "water_pump", "confidence": 0.92, "multiple_repairs": False})
    result = repair_classifier.classify_repair("coolant everywhere and the pump is whining")
    assert (result.method, result.category, result.quotable) == ("llm", "water_pump", True)


@pytest.mark.parametrize("reply, kind", [
    ({"category": "brakes", "confidence": 0.4}, "unknown"),
    ({"category": "no_start", "confidence": 0.95}, "symptom"),
    ({"category": "flux_capacitor", "confidence": 0.99}, "unknown"),
    ({"category": "brakes", "confidence": 0.9, "multiple_repairs": True}, "multiple"),
])
def test_llm_low_confidence_symptoms_and_unlisted_ids_are_not_quotable(monkeypatch, reply, kind):
    fake_llm(monkeypatch, reply)
    result = repair_classifier.classify_repair("brakes")
    assert (result.method, result.kind, result.quotable) == ("llm", kind, False)


@pytest.mark.parametrize("reply", [None, {"confidence": "high"}, {"category": "brakes", "confidence": 7}])
def test_llm_failure_or_bad_shape_falls_back_to_keywords(monkeypatch, reply):
    fake_llm(monkeypatch, reply)
    result = repair_classifier.classify_repair("transmission slipping")
    assert (result.method, result.category) == ("keyword", "transmission")


# ---------- repair estimate ----------

def test_table_estimate_points_to_high_end():
    est = estimate_from_table("transmission", "Camry", 2012, "78705", AS_OF)
    assert (est.repair_cost_low, est.repair_cost_high) == (2750.0, 4950.0)
    assert est.repair_cost_estimate == est.repair_cost_high
    assert (est.model_multiplier, est.age_multiplier, est.region_multiplier, est.region) == (1.0, 1.1, 1.0, "TX")


@pytest.mark.parametrize("location, state", [
    ("78705", "TX"), ("Austin, TX", "TX"), ("austin tx", "TX"), ("Dallas, Texas", "TX"),
    ("90210", "CA"), ("02139", "MA"), ("Boise, ID", None), ("somewhere", None),
])
def test_location_parsing(location, state):
    assert state_from_location(location) == state


def test_region_model_and_age_change_the_price():
    base = estimate_from_table("brakes", "Camry", 2020, "Austin, TX", AS_OF).repair_cost_high
    assert estimate_from_table("brakes", "Camry", 2020, "Los Angeles, CA", AS_OF).repair_cost_high > base
    assert estimate_from_table("brakes", "Tundra", 2020, "Austin, TX", AS_OF).repair_cost_high > base
    assert estimate_from_table("brakes", "Camry", 2008, "Austin, TX", AS_OF).repair_cost_high > base
    assert estimate_from_table("brakes", "Unknown Car", 2020, "Austin, TX", AS_OF).model_multiplier == 1.0
    assert [age_multiplier(a) for a in (0, 5, 6, 15, 16)] == [1.0, 1.0, 1.05, 1.1, 1.15]


# ---------- vehicle value ----------

@pytest.mark.parametrize("model, year, miles", MARKET_VALUE_RANGES)
def test_value_lands_in_market_fixture_range(model, year, miles):
    value = value_vehicle(model, year, miles, "profile", AS_OF)
    low, high = MARKET_VALUE_RANGES[(model, year, miles)]
    assert low <= value.private_sale_estimate <= high
    assert value.trade_in_estimate < value.private_sale_estimate
    assert value.private_sale_low < value.private_sale_estimate < value.private_sale_high
    assert value.model_recognized


def test_value_drops_with_age_and_mileage():
    base = value_vehicle("Camry", 2016, 120000, "user", AS_OF).private_sale_estimate
    assert value_vehicle("Camry", 2012, 120000, "user", AS_OF).private_sale_estimate < base
    assert value_vehicle("Camry", 2016, 200000, "user", AS_OF).private_sale_estimate < base
    assert value_vehicle("Camry", 1990, 400000, "user", AS_OF).private_sale_estimate == 500.0
    assert value_vehicle("Toyota RAV 4 XLE", 2016, 120000, "user", AS_OF).model_recognized


# ---------- /quote ----------

@pytest.mark.parametrize("profile_id", ["maria", "dev", "sam"])
def test_survey_output_flows_into_complete_quote(profile_id):
    survey = TestClient(survey_app).post("/pre-quote-survey", json={"profile_id": profile_id}).json()
    assert survey["complete"] is True
    body = post("/quote", {"profile_id": profile_id, "quote_input": survey["quote_input"]})
    assert body["complete"] is True
    assert body["needs_manual"] is False and body["questions"] == []
    assert body["repair"]["source"] == "table"
    assert body["repair"]["repair_cost_estimate"] == body["repair"]["repair_cost_high"] > 0
    assert body["vehicle"]["mileage_source"] == "profile"
    assert body["nearby_shops"] and body["nearby_shops"][0]["source"] == "fixture"
    assert "not financial advice" in body["disclaimer"]


def test_unquotable_issue_asks_for_manual_quote():
    payload = {"profile_id": "maria", "quote_input": {**MARIA_INPUT, "repair_type": "engine not starting"}}
    body = post("/quote", payload)
    assert body["needs_manual"] is True and body["complete"] is False
    assert body["repair"] is None
    assert [q["field"] for q in body["questions"]] == ["manual_quote"]
    assert body["vehicle"] is not None  # value doesn't depend on the repair

    payload["manual_quote"] = {"amount": 1875.5, "shop": "Central TX Auto Care"}
    body = post("/quote", payload)
    assert body["complete"] is True
    assert body["repair"]["source"] == "manual"
    assert body["repair"]["repair_cost_estimate"] == body["repair"]["repair_cost_low"] == 1875.5
    assert body["repair"]["shop"] == "Central TX Auto Care"


def test_manual_quote_overrides_table_for_quotable_issue():
    body = post("/quote", {"quote_input": MARIA_INPUT, "mileage": 150000, "manual_quote": {"amount": 3100}})
    assert body["repair"]["source"] == "manual"
    assert body["repair"]["category"] == "transmission"
    assert body["repair"]["repair_cost_estimate"] == 3100


def test_mileage_is_asked_without_a_profile_and_then_used():
    body = post("/quote", {"quote_input": MARIA_INPUT})
    assert body["vehicle"] is None and body["complete"] is False
    assert [q["field"] for q in body["questions"]] == ["mileage"]
    assert body["nearby_shops"] == []

    body = post("/quote", {"quote_input": MARIA_INPUT, "mileage": 90000})
    assert body["complete"] is True
    assert (body["vehicle"]["mileage"], body["vehicle"]["mileage_source"]) == (90000, "user")


def test_user_mileage_overrides_profile():
    body = post("/quote", {"profile_id": "maria", "quote_input": MARIA_INPUT, "mileage": 60000})
    assert (body["vehicle"]["mileage"], body["vehicle"]["mileage_source"]) == (60000, "user")


@pytest.mark.parametrize("extra", [
    {"manual_quote": {"amount": 0}},
    {"manual_quote": {"amount": -5}},
    {"mileage": "lots"},
    {"mileage": -1},
    {"surprise": True},
])
def test_invalid_quote_requests_are_rejected(extra):
    post("/quote", {"quote_input": MARIA_INPUT, **extra}, status=422)


def test_incomplete_survey_input_is_rejected():
    post("/quote", {"quote_input": {**MARIA_INPUT, "location": None}}, status=422)


def test_unknown_profile_returns_404():
    post("/quote", {"profile_id": "nope", "quote_input": MARIA_INPUT}, status=404)


def test_quote_route_does_not_call_llm_when_disabled(monkeypatch):
    def boom(*args, **kwargs):
        pytest.fail("chat() must not run with LLM_PROVIDER=none")

    monkeypatch.setattr(muse, "chat", boom)
    post("/quote", {"profile_id": "sam", "quote_input": {**MARIA_INPUT, "repair_type": "oxygen sensor"}})


# ---------- /onboarding (PFO) ----------

FORM_ANSWERS = {
    "down_payment": 3000,
    "credit_band": "good",
    "other_debt_load": "light",
    "upcoming_major_expense": False,
    "income_stability": "steady",
    "car_usage": "medium",
}
# Ryan's PFOFactors (apps/api/app/models/schemas.py on main), field for field.
RYAN_PFO_FIELDS = {
    "apr", "down_payment", "income_outlook", "job_stability", "upcoming_major_expense", "other_debt_load",
    "windfall_expected", "payment_risk_tolerance", "household_members", "car_usage", "credit_confidence",
}


def test_form_path_asks_six_questions_in_order_then_completes():
    answers, asked = {}, []
    for field, value in FORM_ANSWERS.items():
        body = post("/onboarding", {"answers": answers})
        assert body["complete"] is False and body["accepts_free_text"] is False
        assert body["factors"] is None
        asked.append(body["question"]["field"])
        answers[field] = value
    body = post("/onboarding", {"answers": answers})
    assert asked == list(FORM_ANSWERS)
    assert body["complete"] is True and body["question"] is None
    assert (body["answered"], body["total"]) == (6, 6)
    assert body["factors"] == {
        "apr": 0.07, "down_payment": 3000.0, "income_outlook": "stable", "job_stability": "secure",
        "upcoming_major_expense": False, "other_debt_load": "light", "windfall_expected": False,
        "payment_risk_tolerance": "medium", "household_members": 1, "car_usage": "medium",
        "credit_confidence": "high",
    }


def test_factors_have_exactly_ryans_pfo_fields():
    body = post("/onboarding", {"answers": FORM_ANSWERS})
    assert set(body["factors"]) == RYAN_PFO_FIELDS


@pytest.mark.parametrize("band, apr, confidence", [
    ("excellent", 0.055, "high"), ("good", 0.07, "high"), ("fair", 0.11, "medium"),
    ("poor", 0.16, "low"), ("unknown", None, "low"),
])
def test_credit_band_maps_to_apr_and_confidence(band, apr, confidence):
    factors = post("/onboarding", {"answers": {**FORM_ANSWERS, "credit_band": band}})["factors"]
    assert (factors["apr"], factors["credit_confidence"]) == (apr, confidence)


@pytest.mark.parametrize("stability, outlook, job", [
    ("growing", "increasing", "secure"), ("steady", "stable", "secure"),
    ("at_risk", "decreasing", "at_risk"), ("unsure", "uncertain", "unknown"),
])
def test_income_question_maps_to_outlook_and_job_stability(stability, outlook, job):
    factors = post("/onboarding", {"answers": {**FORM_ANSWERS, "income_stability": stability}})["factors"]
    assert (factors["income_outlook"], factors["job_stability"]) == (outlook, job)


def test_choice_questions_include_options():
    body = post("/onboarding", {"answers": {k: v for k, v in FORM_ANSWERS.items() if k != "credit_band"}})
    question = body["question"]
    assert question["field"] == "credit_band" and question["input_type"] == "choice"
    assert "good" in [o["value"] for o in question["options"]]


@pytest.mark.parametrize("field, text, value", [
    ("down_payment", "3k", 3000.0),
    ("down_payment", "$3,500", 3500.0),
    ("down_payment", "about 1500 dollars", 1500.0),
    ("down_payment", "none", 0.0),
    ("credit_band", "Good (670-739)", "good"),
    ("credit_band", "720", "good"),
    ("credit_band", "not sure", "unknown"),
    ("other_debt_load", "none", "none"),
    ("other_debt_load", "heavy", "heavy"),
    ("upcoming_major_expense", "yes", True),
    ("upcoming_major_expense", "Nope", False),
    ("income_stability", "Secure and steady", "steady"),
    ("car_usage", "low", "low"),
])
def test_free_text_rules_parse_without_llm(field, text, value):
    body = post("/onboarding", {"reply": {"field": field, "text": text}})
    assert body["answers"][field] == value
    assert body["retry"] is False


def test_unclear_reply_without_llm_repeats_question():
    body = post("/onboarding", {"answers": {"down_payment": 2000},
                                "reply": {"field": "car_usage", "text": "I do DoorDash most nights"}})
    assert body["retry"] is True
    assert body["question"]["field"] == "car_usage"
    assert "options" in body["message"]
    assert body["answers"]["down_payment"] == 2000  # earlier answers survive


def test_llm_extraction_fills_messy_replies(monkeypatch):
    use_settings(monkeypatch, llm_provider="meta", llm_api_key="test-key")
    replies = {"down_payment": {"amount": 2000}, "car_usage": {"value": "high"},
               "upcoming_major_expense": {"value": True}, "other_debt_load": {"value": "heavy"}}
    fake_llm(monkeypatch, lambda prompt: next(
        v for k, v in replies.items() if pfo_agent.QUESTION_BY_FIELD[k].prompt in prompt))
    for field, text, expected in [("down_payment", "maybe two grand", 2000.0),
                                  ("car_usage", "I do DoorDash most nights", "high"),
                                  ("upcoming_major_expense", "my kid starts college in the fall", True),
                                  ("other_debt_load", "student loans plus two cards", "heavy")]:
        body = post("/onboarding", {"reply": {"field": field, "text": text}})
        assert body["accepts_free_text"] is True
        assert body["answers"][field] == expected


@pytest.mark.parametrize("field, reply", [
    ("car_usage", {"value": "spaceship"}),
    ("upcoming_major_expense", {"value": "maybe"}),
    ("down_payment", {"amount": "lots"}),
    ("down_payment", {"amount": True}),
    ("down_payment", {"amount": -50}),
    ("credit_band", None),
])
def test_invalid_llm_extraction_is_rejected(monkeypatch, field, reply):
    fake_llm(monkeypatch, reply)
    body = post("/onboarding", {"reply": {"field": field, "text": "hmm hard to say really"}})
    assert body["retry"] is True and body["answers"][field] is None


def test_rules_are_tried_before_llm(monkeypatch):
    calls = fake_llm(monkeypatch, {"amount": 999})
    body = post("/onboarding", {"reply": {"field": "down_payment", "text": "$1,200"}})
    assert body["answers"]["down_payment"] == 1200.0
    assert calls == []


@pytest.mark.parametrize("payload", [
    {"answers": {"credit_band": "amazing"}},
    {"answers": {"down_payment": -1}},
    {"answers": {"keep_horizon_months": 24}},
    {"reply": {"field": "salary", "text": "100k"}},
    {"reply": {"field": "credit_band", "text": "   "}},
])
def test_invalid_onboarding_requests_are_rejected(payload):
    post("/onboarding", payload, status=422)


# ---------- handoff to issue #3 (krt.score) ----------

def _complete_quote_and_factors(profile_id="maria"):
    survey = TestClient(survey_app).post("/pre-quote-survey", json={"profile_id": profile_id}).json()
    quote = CostQuoteResult(**post("/quote", {"profile_id": profile_id, "quote_input": survey["quote_input"]}))
    factors = PFOFactors(**post("/onboarding", {"answers": FORM_ANSWERS})["factors"])
    return quote, factors


def test_handoff_uses_high_end_repair_cost_and_trade_in_value():
    quote, factors = _complete_quote_and_factors()
    handoff = build_handoff(quote, factors)
    assert handoff.repair_cost == quote.repair.repair_cost_estimate == quote.repair.repair_cost_high
    assert handoff.car_value == quote.vehicle.trade_in_estimate > 0
    args = handoff.krt_arguments()
    assert set(args) == {"car_value", "repair_cost", "pfo_factors"}
    assert args["pfo_factors"].apr == 0.07 and args["pfo_factors"].down_payment == 3000.0


def test_handoff_refuses_incomplete_quote():
    quote, factors = _complete_quote_and_factors()
    with pytest.raises(ValueError):
        build_handoff(quote.model_copy(update={"complete": False, "repair": None}), factors)


def test_matches_ryans_pfo_schema_once_merged():
    schemas = pytest.importorskip("app.models.schemas")
    if not hasattr(schemas, "PFOFactors"):
        pytest.skip("issue #3 PFOFactors not merged yet")
    assert set(schemas.PFOFactors.model_fields) == RYAN_PFO_FIELDS
    _, factors = _complete_quote_and_factors()
    schemas.PFOFactors(**factors.model_dump())  # validates against the real model


@pytest.mark.parametrize("profile_id", ["maria", "dev", "sam"])
def test_handoff_feeds_ryans_krt_score_once_merged(profile_id):
    krt = pytest.importorskip("app.engine.krt")
    from app.engine import affordability
    from app.models.schemas import MaintenanceTask, MarketData
    from app.seeds.loader import get_profile, load_fixture

    quote, factors = _complete_quote_and_factors(profile_id)
    market_data = load_fixture("market")[profile_id]
    market_data.setdefault("scheduled_maintenance", [MaintenanceTask(cost=60, interval=5000)])
    snapshot = load_fixture("nessie")[profile_id]
    result = krt.score(
        get_profile(profile_id),
        afford=affordability.compute(snapshot),
        market=MarketData(**market_data),
        snapshot=snapshot,
        **build_handoff(quote, factors).krt_arguments(),
    )
    assert result.keepResult > 0 and result.tradeResult > 0 and result.refinanceResult > 0
    assert result.repair_ratio == pytest.approx(quote.repair.repair_cost_estimate / quote.vehicle.trade_in_estimate)


# ---------- Muse client ----------

class FakeResponse:
    def __init__(self, content, status=200):
        self.status_code = status
        self._content = content

    def raise_for_status(self):
        if self.status_code >= 400:
            request = httpx.Request("POST", "https://api.meta.ai/v1/chat/completions")
            raise httpx.HTTPStatusError("error", request=request, response=httpx.Response(self.status_code))

    def json(self):
        return {"choices": [{"message": {"content": self._content}}], "usage": {"total_tokens": 42}}


def test_muse_client_posts_openai_style_request_and_caches(monkeypatch, tmp_path):
    use_settings(monkeypatch, llm_provider="meta", llm_api_key=" secret ", llm_model="muse-test",
                 llm_cache_path=str(tmp_path / "cache.sqlite3"))
    sent = []

    def fake_post(url, headers, json, timeout):
        sent.append((url, headers, json))
        return FakeResponse('```json\n{"category": "brakes", "confidence": 0.9}\n```')

    monkeypatch.setattr(muse.httpx, "post", fake_post)
    first = muse.complete_json("sys", "user")
    second = muse.complete_json("sys", "user")
    assert first == second == {"category": "brakes", "confidence": 0.9}
    assert len(sent) == 1  # second call served from cache
    url, headers, body = sent[0]
    assert url == "https://api.meta.ai/v1/chat/completions"
    assert headers["Authorization"] == "Bearer secret"
    assert body["model"] == "muse-test" and body["temperature"] == 0
    assert [m["role"] for m in body["messages"]] == ["system", "user"]


@pytest.mark.parametrize("response", [FakeResponse("not json at all"), FakeResponse("[1, 2]"), FakeResponse("{}", 401)])
def test_muse_client_returns_none_on_bad_reply_or_http_error(monkeypatch, tmp_path, response):
    use_settings(monkeypatch, llm_provider="meta", llm_api_key="k", llm_cache_path=str(tmp_path / "c.sqlite3"))
    monkeypatch.setattr(muse.httpx, "post", lambda *a, **k: response)
    assert muse.complete_json("sys", "user") is None


def test_muse_client_handles_timeout(monkeypatch, tmp_path):
    use_settings(monkeypatch, llm_provider="meta", llm_api_key="k", llm_cache_path=str(tmp_path / "c.sqlite3"))

    def timeout(*args, **kwargs):
        raise httpx.ReadTimeout("slow")

    monkeypatch.setattr(muse.httpx, "post", timeout)
    assert muse.complete_json("sys", "user") is None


@pytest.mark.parametrize("provider, key, enabled", [
    ("none", "k", False), ("meta", "", False), ("meta", "  ", False), ("META", "k", True), ("muse", "k", True),
])
def test_llm_enabled_needs_provider_and_key(provider, key, enabled):
    assert CostAgentSettings(_env_file=None, llm_provider=provider, llm_api_key=key).llm_enabled is enabled


def test_contract_fields_match_python_models():
    from issue_2_cost_agent.app.models import cost_schemas

    # issue_2_cost_agent/web/lib before unpacking, apps/web/lib after.
    here = Path(cost_schemas.__file__).resolve()
    ts_path = next(p for p in (here.parents[2] / "web/lib/cost_api.ts", here.parents[3] / "web/lib/cost_api.ts")
                   if p.exists())
    ts = ts_path.read_text(encoding="utf-8")
    for model in (cost_schemas.CostQuoteResult, cost_schemas.RepairEstimate, cost_schemas.VehicleValue,
                  cost_schemas.OnboardingResult, cost_schemas.PfoAnswers, cost_schemas.PFOFactors,
                  cost_schemas.CostAgentHandoff):
        for name in model.model_fields:
            assert f"{name}" in ts, f"{model.__name__}.{name} missing from web/lib/cost_api.ts"
