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


# The demo answers the web app sends (lib/advisor/pfo.ts) and the repair cost each user saw.
MARIA = {
    "profile_id": "maria",
    "pfo": {"apr": 0.055, "credit_confidence": "high", "income_outlook": "increasing",
            "job_stability": "secure", "car_usage": "medium", "down_payment": 6000},
    "repair_cost_low": 2750,
    "repair_cost_high": 4950,
}
DEV = {
    "profile_id": "dev",
    "pfo": {"apr": 0.11, "credit_confidence": "medium", "income_outlook": "decreasing",
            "job_stability": "unknown", "car_usage": "medium", "down_payment": 500},
    "repair_cost_low": 1450,
    "repair_cost_high": 1450,
}


def test_demo_answers_give_different_recommendations():
    maria = client.post("/analyze", json=MARIA).json()
    dev = client.post("/analyze", json=DEV).json()
    sam = client.post("/analyze", json={"profile_id": "sam"}).json()
    assert maria["recommendation"] == "trade"  # 50% rule: repair is worth more than the car
    assert maria["suggested_models"][0]["name"].startswith("2026 ")
    assert "trading in is your best move" in maria["explanation"]
    assert dev["recommendation"] == "keep"  # no replacement fits his budget
    assert sam["recommendation"] == "refinance"


def test_repair_cost_from_request_is_used():
    body = client.post("/analyze", json=MARIA).json()
    assert round(body["result"]["repair_ratio"], 2) == round(4950 / 4900, 2)
    assert "$2,750 to $4,950" in body["explanation_details"]
