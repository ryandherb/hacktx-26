import httpx
import pytest

from app.clients import llm
from app.config import Settings

LIVE = dict(
    use_fixtures=False,
    llm_provider="meta",
    llm_api_key="test-key",
    llm_model="test-model",
    llm_base_url="",
)

AFFORD = {
    "monthly_income": 5200.0,
    "monthly_spend": 4100.0,
    "savings_balance": 6000.0,
    "monthly_surplus": 1100.0,
    "runway_months": 1.5,
    "can_afford_payment": True,
    "max_comfortable_payment": 385.0,
}

FACTORS = [
    {"name": "repair cost vs. car value", "weight": 0.35, "detail": "repair is 60% of value"},
    {"name": "monthly surplus", "weight": 0.15},
    {"name": "mileage", "weight": 0.25},
    {"name": "keep horizon", "weight": 0.05},
]

CASES = {
    "repair": dict(krt_score=22, crossover_month=None),
    "trade": dict(krt_score=81, crossover_month=7),
    "repair_then_trade": dict(krt_score=55, crossover_month=20),
}


def ctx(rec: str) -> dict:
    return {
        "recommendation": rec,
        "horizon_months": 36,
        "factors": FACTORS,
        "affordability": AFFORD,
        "repair_cost_low": 1800.0,
        "repair_cost_high": 2600.0,
        "curve": [{"month": 1, "keep_cost": 2000.0, "replace_cost": 3000.0}],
        **CASES[rec],
    }


def use_settings(monkeypatch, **overrides):
    s = Settings(**{**LIVE, **overrides})
    monkeypatch.setattr(llm, "get_settings", lambda: s)
    return s


def fail_if_called(*a, **k):
    raise AssertionError("LLM should not be called")


# --- template fallback --------------------------------------------------------


@pytest.mark.parametrize(
    "overrides",
    [
        {"use_fixtures": True},
        {"llm_provider": "none"},
        {"llm_api_key": ""},
    ],
)
def test_template_used_when_llm_disabled(monkeypatch, overrides):
    use_settings(monkeypatch, **overrides)
    monkeypatch.setattr(llm.httpx, "post", fail_if_called)
    text = llm.explain(ctx("trade"))
    assert llm.DISCLAIMER in text


@pytest.mark.parametrize("rec", ["repair", "trade", "repair_then_trade"])
def test_template_restates_given_numbers_only(monkeypatch, rec):
    use_settings(monkeypatch, use_fixtures=True)
    c = ctx(rec)
    text = llm.explain(c)
    assert f"{c['krt_score']} out of 100" in text
    assert "$1,800 to $2,600" in text
    assert "$385" in text and "$1,100" in text
    # Top 3 factors by weight, in order; the smallest is left out.
    assert "repair cost vs. car value, mileage, monthly surplus" in text
    assert "keep horizon" not in text
    if c["crossover_month"] is None:
        assert "around month" not in text
    else:
        assert f"month {c['crossover_month']}" in text
    assert llm._invented_numbers(text, llm._build_facts(c)) == []
    assert text.endswith(llm.DISCLAIMER)


@pytest.mark.parametrize(
    "legacy,expected_phrase",
    [
        ("keep", "Repairing and keeping"),
        ("replace_now", "Trading in now"),
        ("replace_later", "Repairing now and planning to trade later"),
    ],
)
def test_legacy_recommendations(monkeypatch, legacy, expected_phrase):
    use_settings(monkeypatch, use_fixtures=True)
    assert llm.normalize_recommendation(legacy) != legacy
    text = llm.explain({"recommendation": legacy, "crossover_month": 12})
    assert expected_phrase in text


def test_template_handles_route_minimal_context(monkeypatch):
    # routes.py currently passes only these two keys.
    use_settings(monkeypatch, use_fixtures=True)
    text = llm.explain({"crossover_month": None, "recommendation": "replace_later"})
    assert "does not pay off" in text
    assert llm.DISCLAIMER in text


# --- mocked provider ------------------------------------------------------------


def fake_post(reply_text: str, calls: list, status: int = 200):
    def _post(url, headers=None, json=None, timeout=None):
        calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return httpx.Response(
            status,
            json={"choices": [{"message": {"role": "assistant", "content": reply_text}}]},
            request=httpx.Request("POST", url),
        )

    return _post


@pytest.mark.parametrize("rec", ["repair", "trade", "repair_then_trade"])
def test_explain_uses_llm_reply(monkeypatch, rec):
    use_settings(monkeypatch)
    c = ctx(rec)
    crossover = c["crossover_month"]
    reply = (
        f"Your KRT score is {c['krt_score']} out of 100. "
        + (f"Trading gets cheaper around month {crossover}. " if crossover else "")
        + "Repair cost vs. car value mattered most, and a payment up to $385 is comfortable."
    )
    calls: list = []
    monkeypatch.setattr(llm.httpx, "post", fake_post(reply, calls))

    text = llm.explain(c)

    assert text.startswith(reply)
    assert text.endswith(llm.DISCLAIMER)  # appended when the LLM leaves it out
    assert len(calls) == 1
    call = calls[0]
    assert call["url"] == "https://api.meta.ai/v1/chat/completions"
    assert call["headers"]["Authorization"] == "Bearer test-key"
    body = call["json"]
    assert body["model"] == "test-model"
    assert body["messages"][0]["role"] == "system"
    assert "Never compute" in body["messages"][0]["content"]
    user_msg = body["messages"][1]["content"]
    assert f'"recommendation": "{rec}"' in user_msg
    assert '"krt_score": ' + str(c["krt_score"]) in user_msg
    assert "curve" not in user_msg  # raw curve is not sent


def test_explain_maps_legacy_rec_before_sending(monkeypatch):
    use_settings(monkeypatch)
    calls: list = []
    monkeypatch.setattr(llm.httpx, "post", fake_post("Trade in now.", calls))
    llm.explain({"recommendation": "replace_now", "crossover_month": 3})
    assert '"recommendation": "trade"' in calls[0]["json"]["messages"][1]["content"]


@pytest.mark.parametrize("rec", ["repair", "trade", "repair_then_trade"])
def test_invented_number_falls_back_to_template(monkeypatch, rec):
    use_settings(monkeypatch)
    calls: list = []
    monkeypatch.setattr(
        llm.httpx, "post", fake_post("You would save $4,321 by month 99.", calls)
    )
    c = ctx(rec)
    assert llm.explain(c) == llm._template(llm._build_facts(c))


def test_rounded_numbers_are_allowed():
    facts = {"affordability": {"monthly_surplus": 1234.56}, "krt_score": 72.4}
    assert llm._invented_numbers("About $1,235 a month, score 72, or 72.4.", facts) == []
    assert llm._invented_numbers("About $1,240 a month.", facts) == ["1,240"]
    assert llm._invented_numbers("Weight was 35%.", {"factors": [{"weight": 0.35}]}) == []


@pytest.mark.parametrize("status", [401, 500])
def test_http_error_falls_back(monkeypatch, status):
    use_settings(monkeypatch)
    monkeypatch.setattr(llm.httpx, "post", fake_post("x", [], status=status))
    assert llm.explain(ctx("trade")) == llm._template(llm._build_facts(ctx("trade")))


def test_network_error_falls_back(monkeypatch):
    use_settings(monkeypatch)

    def boom(*a, **k):
        raise httpx.ConnectError("no network")

    monkeypatch.setattr(llm.httpx, "post", boom)
    assert llm.DISCLAIMER in llm.explain(ctx("repair"))


def test_empty_reply_falls_back(monkeypatch):
    use_settings(monkeypatch)
    monkeypatch.setattr(llm.httpx, "post", fake_post("   ", []))
    assert llm.explain(ctx("repair")).endswith(llm.DISCLAIMER)


# --- _complete details ----------------------------------------------------------


def test_complete_custom_base_url(monkeypatch):
    use_settings(monkeypatch, llm_provider="custom", llm_base_url="http://x.test/v1/")
    calls: list = []
    monkeypatch.setattr(llm.httpx, "post", fake_post("hi", calls))
    assert llm._complete("hello") == "hi"
    assert calls[0]["url"] == "http://x.test/v1/chat/completions"
    assert calls[0]["json"]["messages"] == [{"role": "user", "content": "hello"}]


def test_complete_unknown_provider_without_base_url(monkeypatch):
    use_settings(monkeypatch, llm_provider="mystery")
    monkeypatch.setattr(llm.httpx, "post", fail_if_called)
    with pytest.raises(llm.LLMError):
        llm._complete("hello")


def test_complete_llama_api_shape(monkeypatch):
    use_settings(monkeypatch)

    def _post(url, **k):
        return httpx.Response(
            200,
            json={"completion_message": {"content": {"type": "text", "text": "ok"}}},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(llm.httpx, "post", _post)
    assert llm._complete("hello") == "ok"


def test_extract_parses_fenced_json(monkeypatch):
    use_settings(monkeypatch)
    monkeypatch.setattr(llm.httpx, "post", fake_post('```json\n{"band": "good"}\n```', []))
    assert llm.extract('{"band": str}', "my credit is pretty good") == {"band": "good"}


def test_extract_without_provider_raises(monkeypatch):
    use_settings(monkeypatch, llm_provider="none")
    with pytest.raises(NotImplementedError):
        llm.extract("{}", "text")
