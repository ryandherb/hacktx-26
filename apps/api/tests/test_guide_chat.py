from fastapi.testclient import TestClient

from app import guide_agent
from app.clients import llm
from app.config import Settings
from app.main import app
from app.models.schemas import GuideChatRequest

client = TestClient(app)

LIVE = dict(llm_provider="meta", llm_api_key="test-key", llm_model="test-model")


def use_settings(monkeypatch, **overrides):
    s = Settings(**{**LIVE, **overrides})
    monkeypatch.setattr(llm, "get_settings", lambda: s)


def ask(*texts: str, context: dict | None = None) -> dict:
    roles = ["user", "assistant"]
    msgs = [{"role": roles[i % 2], "content": t} for i, t in enumerate(texts)]
    return {"messages": msgs, "context": context}


def test_no_llm_returns_no_reply():
    r = client.post("/guide/chat", json=ask("How does this work?"))
    assert r.status_code == 200
    assert r.json() == {"reply": None, "source": "none"}


def test_last_message_must_be_from_user():
    r = client.post("/guide/chat", json=ask("Hi", "Hello! What can I help with?"))
    assert r.status_code == 422


def test_empty_conversation_rejected():
    assert client.post("/guide/chat", json={"messages": []}).status_code == 422


def test_sends_history_and_context(monkeypatch):
    use_settings(monkeypatch)
    seen = {}

    def fake_complete(prompt, system=None, history=None, **kw):
        seen.update(prompt=prompt, system=system, history=history)
        return "  Step 2 asks about your finances.  "

    monkeypatch.setattr(llm, "_complete", fake_complete)
    req = GuideChatRequest.model_validate(
        ask("Hi", "Hi! Ask me anything.", "Why do you need my credit score?",
            context={"step": "situation", "vehicle": "2012 Camry", "recommendation": None})
    )
    assert guide_agent.reply(req) == "Step 2 asks about your finances."
    assert seen["prompt"] == "Why do you need my credit score?"
    assert seen["history"] == [
        {"role": "user", "content": "Hi"},
        {"role": "assistant", "content": "Hi! Ask me anything."},
    ]
    assert "step 2, Your situation" in seen["system"]
    assert "2012 Camry" in seen["system"]


def test_history_is_capped(monkeypatch):
    use_settings(monkeypatch)
    seen = {}
    monkeypatch.setattr(llm, "_complete", lambda prompt, history=None, **kw: seen.update(history=history) or "ok")
    texts = [f"message {i}" for i in range(31)]  # odd count, so the last one is from the user
    guide_agent.reply(GuideChatRequest.model_validate(ask(*texts)))
    assert len(seen["history"]) == guide_agent.MAX_HISTORY - 1
    assert seen["history"][-1]["content"] == "message 29"


def test_llm_error_returns_none(monkeypatch):
    use_settings(monkeypatch)

    def boom(*a, **kw):
        raise llm.LLMError("down")

    monkeypatch.setattr(llm, "_complete", boom)
    assert guide_agent.reply(GuideChatRequest.model_validate(ask("Hello?"))) is None
