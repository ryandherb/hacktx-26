"""Issue #1: intake completeness, profile merging, validation, and statelessness."""

from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from issue_1_pre_quote_survey.pre_quote_api import app
from issue_1_pre_quote_survey.pre_quote_schemas import PreQuoteInput
from issue_1_pre_quote_survey import pre_quote_profiles as loader
from issue_1_pre_quote_survey.pre_quote_router import router

client = TestClient(app)
ENDPOINT = "/pre-quote-survey"
COMPLETE = {
    "repair_type": "Brake pads",
    "vehicle_model": "Camry",
    "vehicle_year": 2012,
    "location": "Austin, TX",
}


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def no_network(*args, **kwargs):
        pytest.fail("Pre-quote survey must not make external requests")

    monkeypatch.setattr("httpx.HTTPTransport.handle_request", no_network)
    monkeypatch.setattr("httpx.AsyncHTTPTransport.handle_async_request", no_network)


def survey(payload):
    response = client.post(ENDPOINT, json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_no_profile_prompts_for_all_required_fields():
    body = survey({})
    assert body["missing_fields"] == list(COMPLETE)
    assert [q["field"] for q in body["questions"]] == list(COMPLETE)
    assert body["questions"][2]["input_type"] == "number"
    assert body["complete"] is False
    assert body["quote_input"] is None


@pytest.mark.parametrize("profile_id", ["maria", "dev", "sam"])
def test_complete_profile_prefills_without_questions(profile_id):
    profile = next(p for p in loader.load_profile_records() if p["id"] == profile_id)
    body = survey({"profile_id": profile_id})
    assert body["complete"] is True
    assert body["questions"] == body["missing_fields"] == []
    assert body["quote_input"] == {
        "repair_type": profile["open_issue"],
        "vehicle_model": profile["vehicle_model"],
        "vehicle_year": profile["vehicle_year"],
        "location": profile["zip_code"],
    }
    PreQuoteInput.model_validate(body["quote_input"])


def test_incomplete_profile_can_be_completed_without_other_profile_fields(monkeypatch):
    monkeypatch.setattr(loader, "load_profile_records", lambda: [
        {"id": "partial", "vehicle_model": "Corolla", "vehicle_year": None, "zip_code": " "}
    ])
    body = survey({"profile_id": "partial"})
    assert body["missing_fields"] == ["repair_type", "vehicle_year", "location"]
    body["answers"].update(repair_type="A/C compressor", vehicle_year=2010, location="78741")
    completed = survey({"profile_id": "partial", "answers": body["answers"]})
    assert completed["complete"] is True
    assert completed["quote_input"]["vehicle_model"] == "Corolla"


def test_invalid_stored_fields_prompt_instead_of_crashing(monkeypatch):
    monkeypatch.setattr("issue_1_pre_quote_survey.pre_quote_profiles.load_profile_records", lambda: [
        {"id": "partial", "vehicle_model": 123, "vehicle_year": 0, "open_issue": "", "zip_code": None}
    ])
    assert survey({"profile_id": "partial"})["missing_fields"] == list(COMPLETE)


def test_manual_intake_and_whitespace_normalization():
    answers = {**COMPLETE, "repair_type": "  Brake pads  ", "location": "  Austin, TX "}
    body = survey({"answers": answers})
    assert body["complete"] is True
    assert body["quote_input"] == COMPLETE
    assert body["profile_id"] is None


def test_overrides_do_not_modify_profile_or_other_requests():
    before = survey({"profile_id": "maria"})
    changed = survey({"profile_id": "maria", "answers": COMPLETE})
    assert changed["quote_input"] == COMPLETE
    assert survey({"profile_id": "maria"}) == before
    assert survey({})["complete"] is False


@pytest.mark.parametrize("value", [None, "", "   "])
def test_explicit_clear_requests_new_answer(value):
    body = survey({"profile_id": "maria", "answers": {"repair_type": value}})
    assert body["missing_fields"] == ["repair_type"]
    assert body["quote_input"] is None
    assert body["answers"]["vehicle_model"] == "Camry"


def test_multiple_stateless_turns():
    first = survey({"answers": {"repair_type": "Engine not starting"}})
    assert first["missing_fields"] == ["vehicle_model", "vehicle_year", "location"]
    second = survey({"answers": {**first["answers"], "vehicle_model": "Prius", "vehicle_year": 2017}})
    assert second["missing_fields"] == ["location"]
    final = survey({"answers": {**second["answers"], "location": "02108"}})
    assert final["complete"] is True
    # Ambiguous symptoms are preserved for the future Cost Agent to classify.
    assert final["quote_input"]["repair_type"] == "Engine not starting"
    assert final["quote_input"]["location"] == "02108"


@pytest.mark.parametrize("answers", [
    {"vehicle_year": 1885}, {"vehicle_year": date.today().year + 2},
    {"vehicle_year": True}, {"vehicle_year": 2012.5}, {"vehicle_year": "2012"},
    {"repair_type": 123}, {"location": ["Austin"]}, {"vehicle_model": "x" * 501},
    {"repair_cost": 500},
])
def test_invalid_answers_return_422(answers):
    assert client.post(ENDPOINT, json={"answers": answers}).status_code == 422


@pytest.mark.parametrize("year", [1886, date.today().year + 1])
def test_model_year_boundaries(year):
    assert survey({"answers": {**COMPLETE, "vehicle_year": year}})["complete"] is True


def test_unknown_profile_is_404_even_with_complete_answers():
    assert client.post(ENDPOINT, json={"profile_id": "unknown", "answers": COMPLETE}).status_code == 404


@pytest.mark.parametrize("payload", [{"profile_id": " "}, {"unexpected": True}, {"answers": None}])
def test_invalid_request_returns_422(payload):
    assert client.post(ENDPOINT, json=payload).status_code == 422


def test_openapi_exposes_survey_contract():
    schema = client.get("/openapi.json").json()
    operation = schema["paths"][ENDPOINT]["post"]
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("PreQuoteSurveyResult")
    assert set(schema["components"]["schemas"]["PreQuoteInput"]["required"]) == set(COMPLETE)


def test_router_mounts_in_another_app_with_team_profile_adapter():
    integrated_app = FastAPI()
    integrated_app.include_router(router)
    integrated_app.dependency_overrides[loader.survey_profile_records] = lambda: [
        {"id": "team-profile", "vehicle_model": "Prius", "vehicle_year": 2017}
    ]
    integrated_client = TestClient(integrated_app)
    first = integrated_client.post(ENDPOINT, json={"profile_id": "team-profile"})
    assert first.status_code == 200
    assert first.json()["missing_fields"] == ["repair_type", "location"]
    completed = integrated_client.post(ENDPOINT, json={
        "profile_id": "team-profile",
        "answers": {"repair_type": "Brake pads", "location": "02108"},
    })
    assert completed.status_code == 200
    assert completed.json()["complete"] is True
    assert completed.json()["quote_input"]["vehicle_model"] == "Prius"
    # Integration does not leak the overridden profile source into the demo app.
    assert survey({"profile_id": "maria"})["complete"] is True


def test_frontend_origin_can_send_json_requests():
    response = client.options(ENDPOINT, headers={
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
