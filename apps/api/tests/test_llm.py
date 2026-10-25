import httpx
import pytest

from app.clients import llm
from app.config import Settings
from app.models.schemas import KRTResult

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

KRT = {
    "keep": KRTResult(
        keepResult=151.14, refinanceResult=151.14, tradeResult=484.36,
        repair_ratio=0.6122, pr_runway=2.17, remaining_life=0.26,
    ),
    "trade": KRTResult(
        keepResult=612.4, refinanceResult=612.4, tradeResult=430.0,
        repair_ratio=1.25, pr_runway=-0.4, remaining_life=0.05,
    ),
    "refinance": KRTResult(
        keepResult=382.52, refinanceResult=155.69, tradeResult=588.17,
        repair_ratio=0.042, pr_runway=1.0, remaining_life=0.44,
    ),
}

CROSSOVER = {"keep": 10, "trade": 7, "refinance": None}


def ctx(rec: str) -> dict:
    return {
        "recommendation": rec,
        "krt": KRT[rec],
        "repair_cost": 3000.0,
        "crossover_month": CROSSOVER[rec],
        "affordability": AFFORD,
        "horizon_months": 36,
        "curve": [{"month": 1, "keep_cost": 2000.0, "replace_cost": 3000.0}],
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
    assert text == llm._template(llm._build_facts(ctx("trade")))
    assert llm.DISCLAIMER in text


@pytest.mark.parametrize("rec", ["keep", "trade", "refinance"])
def test_template_restates_given_numbers_only(monkeypatch, rec):
    use_settings(monkeypatch, use_fixtures=True)
    c = ctx(rec)
    text = llm.explain(c)
    assert text.startswith(llm.HEADLINES[rec])
    assert "$3,000" in text and "$1,100" in text
    assert llm._invented_numbers(text, llm._build_facts(c)) == []
    assert text.endswith(llm.DISCLAIMER)


def test_template_keep_details(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    text = llm.explain(ctx("keep"))
    assert "keeping $151, trading $484." in text  # no refinance: equals keep (no loan)
    assert "61% of what the car is worth" in text
    assert "2.2 months of spending" in text
    assert "26% of its expected life left" in text
    assert "month 10" not in text  # crossover only mentioned for trade


def test_template_trade_details(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    text = llm.explain(ctx("trade"))
    assert "125% of what the car is worth" in text
    assert "costs more than your current savings" in text
    assert "around month 7" in text


def test_template_refinance_details(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    text = llm.explain(ctx("refinance"))
    assert "keeping $383, trading $588, refinancing $156" in text
    assert "about 1 month of spending" in text


def test_template_no_payment_room(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    c = ctx("keep")
    c["affordability"] = {**AFFORD, "monthly_surplus": 50.0, "max_comfortable_payment": 0.0}
    text = llm.explain(c)
    assert "no room for a new car payment" in text
    assert "$0" not in text


def test_template_optional_score_and_factors(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    factors = [
        {"name": "repair cost vs. car value", "weight": 0.35},
        {"name": "monthly surplus", "weight": 0.15},
        {"name": "mileage", "weight": 0.25},
        {"name": "keep horizon", "weight": 0.05},
    ]
    text = llm.explain({"recommendation": "keep", "krt_score": 22, "factors": factors})
    assert "22 out of 100" in text
    assert "repair cost vs. car value, mileage, monthly surplus" in text
    assert "keep horizon" not in text


@pytest.mark.parametrize(
    "old,new",
    [("repair", "keep"), ("replace_now", "trade"), ("replace_later", "keep"),
     ("repair_then_trade", "keep"), ("refinance", "refinance"), ("KEEP", "keep")],
)
def test_older_recommendation_names(monkeypatch, old, new):
    use_settings(monkeypatch, use_fixtures=True)
    assert llm.normalize_recommendation(old) == new
    assert llm.explain({"recommendation": old}).startswith(llm.HEADLINES[new])


def test_template_handles_empty_context(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    assert llm.explain({}).endswith(llm.DISCLAIMER)


def test_krt_display_values():
    facts = llm._build_facts(ctx("keep"))
    assert facts["krt"] == {
        "keepResult": 151.14,
        "tradeResult": 484.36,
        "refinanceResult": 151.14,
        "repair_pct_of_car_value": 61,
        "savings_months_after_repair": 2.2,
        "remaining_life_pct": 26,
    }
    assert "curve" not in facts


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


LLM_REPLIES = {
    "keep": "Keeping your car is the better move: about $151 a month versus $484 to trade.",
    "trade": "Trading in makes sense: $430 a month versus $612.40 to keep, and the repair "
    "is 125% of the car's value. Trading gets cheaper around month 7.",
    "refinance": "Refinancing brings your monthly cost to $155.69, down from $382.52.",
}


@pytest.mark.parametrize("rec", ["keep", "trade", "refinance"])
def test_explain_uses_llm_reply(monkeypatch, rec):
    use_settings(monkeypatch)
    calls: list = []
    monkeypatch.setattr(llm.httpx, "post", fake_post(LLM_REPLIES[rec], calls))

    text = llm.explain(ctx(rec))

    assert text.startswith(LLM_REPLIES[rec])
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
    assert '"repair_pct_of_car_value"' in user_msg
    assert "repair_ratio" not in user_msg  # raw ratio replaced by display value
    assert "curve" not in user_msg  # raw curve is not sent


def test_explain_maps_older_rec_before_sending(monkeypatch):
    use_settings(monkeypatch)
    calls: list = []
    monkeypatch.setattr(llm.httpx, "post", fake_post("Trade in now.", calls))
    llm.explain({"recommendation": "replace_now"})
    assert '"recommendation": "trade"' in calls[0]["json"]["messages"][1]["content"]


@pytest.mark.parametrize("rec", ["keep", "trade", "refinance"])
def test_invented_number_falls_back_to_template(monkeypatch, rec):
    use_settings(monkeypatch)
    monkeypatch.setattr(
        llm.httpx, "post", fake_post("You would save $4,321 by month 99.", [])
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
    assert llm.explain(ctx("keep")) == llm._template(llm._build_facts(ctx("keep")))


def test_empty_reply_falls_back(monkeypatch):
    use_settings(monkeypatch)
    monkeypatch.setattr(llm.httpx, "post", fake_post("   ", []))
    assert llm.explain(ctx("keep")) == llm._template(llm._build_facts(ctx("keep")))


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
