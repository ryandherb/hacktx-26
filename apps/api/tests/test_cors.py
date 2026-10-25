from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def preflight(origin: str):
    return client.options(
        "/health", headers={"Origin": origin, "Access-Control-Request-Method": "POST"}
    )


def test_cors_allows_localhost_and_vercel():
    for origin in ["http://localhost:3000", "https://next-move-git-ryan.vercel.app"]:
        assert preflight(origin).headers.get("access-control-allow-origin") == origin


def test_cors_rejects_unknown_origin():
    assert "access-control-allow-origin" not in preflight("https://evil.example.com").headers
