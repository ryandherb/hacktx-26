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
    assert body["curve"]
    assert body["recommendation"] in {"keep", "replace_now", "replace_later"}


def test_unknown_profile_404():
    assert client.post("/analyze", json={"profile_id": "nope"}).status_code == 404
