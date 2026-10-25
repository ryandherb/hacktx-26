"""The Cost Agent's POST /quote is mounted on the shared app and decides quotability from the text."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
VEHICLE = {"vehicle_model": "Corolla", "vehicle_year": 2010, "location": "78741"}


def _quote(text: str, manual_quote=None) -> dict:
    body = {"profile_id": "dev", "quote_input": {**VEHICLE, "repair_type": text}}
    if manual_quote is not None:
        body["manual_quote"] = manual_quote
    r = client.post("/quote", json=body)
    assert r.status_code == 200
    return r.json()


def test_specific_repair_is_quotable():
    d = _quote("my transmission is slipping")
    assert d["classification"]["quotable"] is True
    assert d["repair"]["source"] == "table"
    assert d["needs_manual"] is False


def test_symptom_is_not_quotable():
    d = _quote("weird noise when driving")
    assert d["classification"]["kind"] == "symptom"
    assert d["classification"]["quotable"] is False
    assert d["repair"] is None
    assert d["needs_manual"] is True


def test_manual_quote_prices_an_unquotable_issue():
    d = _quote("weird noise when driving", {"amount": 1450, "shop": "Toyota of North Austin"})
    assert d["repair"]["source"] == "manual"
    assert d["repair"]["repair_cost_estimate"] == 1450


def test_pre_quote_survey_is_mounted():
    r = client.post("/pre-quote-survey", json={"profile_id": "dev", "answers": {"repair_type": "noise"}})
    assert r.status_code == 200
