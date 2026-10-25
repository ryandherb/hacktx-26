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
