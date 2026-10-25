import json

import httpx
import pytest

from app.clients import llm
from app.config import Settings
from app.models.schemas import KRTResult, SuggestedModel

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

CAMRY = SuggestedModel(
    name="2021 Camry LE (CPO)", price=24500, kind="cpo", seats=5, mpg=32, body="sedan",
    down_payment=4900, new_payment=291.1, insurance_delta=57.17, fuel_delta=-16.2,
    monthly_cost=430.0, reason="lowest monthly cost of the cars that fit",
)
COROLLA = SuggestedModel(
    name="2019 Corolla LE (used)", price=16900, kind="used", seats=5, mpg=35, body="sedan",
    down_payment=3380, new_payment=214.0, insurance_delta=41.0, fuel_delta=8.0,
    monthly_cost=520.0, reason="lowest monthly cost, but over your comfortable payment",
)


def krt(**kw) -> KRTResult:
    base = dict(
        keepResult=151.14, refinanceResult=151.14, tradeResult=484.36,
        repair_ratio=0.6122, pr_runway=2.17, remaining_life=0.26,
        new_payment=291.1, refi_payment=0.0, suggested_models=[CAMRY, COROLLA],
        trade_affordable=True,
    )
    return KRTResult(**{**base, **kw})


KRT = {
    "keep": krt(),
    "trade": krt(keepResult=612.4, refinanceResult=612.4, tradeResult=430.0,
                 repair_ratio=1.25, pr_runway=-0.4, remaining_life=0.05),
    "refinance": krt(keepResult=382.52, refinanceResult=155.69, tradeResult=588.17,
                     repair_ratio=0.042, pr_runway=1.0, remaining_life=0.44, refi_payment=83.2),
}


def ctx(rec: str) -> dict:
    return {
        "recommendation": rec,
        "krt": KRT[rec],
        "vehicle": "2012 Camry",
        "repair_cost": 3000.0,
        "affordability": AFFORD,
        "horizon_months": 36,
        "curve": [{"month": 1, "keep_cost": 2000.0, "replace_cost": 3000.0}],
    }


def template(c: dict) -> llm.Explanation:
    return llm._template(llm._build_facts(c))


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
    assert llm.explain(ctx("trade")) == template(ctx("trade"))


@pytest.mark.parametrize("rec", ["keep", "trade", "refinance"])
def test_template_restates_given_numbers_only(monkeypatch, rec):
    use_settings(monkeypatch, use_fixtures=True)
    c = ctx(rec)
    e = llm.explain(c)
    facts = llm._build_facts(c)
    for text in (e.summary, e.details):
        assert llm._invented_numbers(text, facts) == []
    assert e.summary.endswith(llm.SHORT_DISCLAIMER)
    assert e.details.startswith(llm.HEADLINES[rec])
    assert e.details.endswith(llm.DISCLAIMER)
    assert len(e.summary) < len(e.details)


def test_summary_is_short(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    for rec in ("keep", "trade", "refinance"):
        summary = llm.explain(ctx(rec)).summary
        assert summary.count(". ") <= 2  # at most 2 sentences + disclaimer


def test_keep_summary_and_details(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    e = llm.explain(ctx("keep"))
    assert e.summary.startswith(
        "Repairing your 2012 Camry is your best move: about $151 a month, compared with $484"
    )
    d = e.details
    assert "keeping $151, trading $484." in d  # no refinance: equals keep (no loan)
    assert "61% of what the car is worth" in d
    assert "2.2 months of spending" in d
    assert "If you'd rather trade in, the best fit is 2021 Camry LE (CPO) at $24,500" in d
    assert "insurance would go up about $57 a month" in d
    assert "save about $16 a month on gas" in d


def test_keep_when_trade_unaffordable(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    c = ctx("keep")
    c["krt"] = krt(trade_affordable=False, suggested_models=[COROLLA])
    c["affordability"] = {**AFFORD, "monthly_surplus": 50.0, "max_comfortable_payment": 0.0}
    e = llm.explain(c)
    assert "A new car payment doesn't fit your budget right now." in e.summary
    assert "no room for a new car payment" in e.details
    assert e.details.count("over your comfortable payment") == 1  # not repeated
    assert "gas would cost about $8 more a month" in e.details


def test_trade_summary_and_details(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    e = llm.explain(ctx("trade"))
    assert "a 2021 Camry LE (CPO) would run about $430 a month, compared with $612" in e.summary
    assert "125% of what your car is worth" in e.summary
    assert "Top picks for you: 2021 Camry LE (CPO) at $24,500" in e.details
    assert "2019 Corolla LE (used) at $16,900" in e.details
    assert "costs more than your current savings" in e.details


def test_refinance_summary_and_details(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    e = llm.explain(ctx("refinance"))
    assert "about $156 a month, compared with $383 on your current loan" in e.summary
    assert "new loan payment would be about $83" in e.summary
    assert "keeping $383, trading $588, refinancing $156" in e.details
    assert "about 1 month of spending" in e.details


def test_optional_score_and_factors(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    factors = [
        {"name": "repair cost vs. car value", "weight": 0.35},
        {"name": "monthly surplus", "weight": 0.15},
        {"name": "mileage", "weight": 0.25},
        {"name": "keep horizon", "weight": 0.05},
    ]
    d = llm.explain({"recommendation": "keep", "krt_score": 22, "factors": factors}).details
    assert "22 out of 100" in d
    assert "repair cost vs. car value, mileage, monthly surplus" in d
    assert "keep horizon" not in d


@pytest.mark.parametrize(
    "old,new",
    [("repair", "keep"), ("replace_now", "trade"), ("replace_later", "keep"),
     ("repair_then_trade", "keep"), ("refinance", "refinance"), ("KEEP", "keep")],
)
def test_older_recommendation_names(monkeypatch, old, new):
    use_settings(monkeypatch, use_fixtures=True)
    assert llm.normalize_recommendation(old) == new
    assert llm.explain({"recommendation": old}).details.startswith(llm.HEADLINES[new])


def test_empty_context(monkeypatch):
    use_settings(monkeypatch, use_fixtures=True)
    e = llm.explain({})
    assert e.summary.endswith(llm.SHORT_DISCLAIMER)
    assert e.details.endswith(llm.DISCLAIMER)


def test_krt_display_values():
    facts = llm._build_facts(ctx("keep"))
    k = facts["krt"]
    assert k["repair_pct_of_car_value"] == 61
    assert k["savings_months_after_repair"] == 2.2
    assert k["remaining_life_pct"] == 26
    assert "repair_ratio" not in k and "pr_runway" not in k
    assert [m["name"] for m in k["suggested_models"]] == [CAMRY.name, COROLLA.name]
    assert "body" not in k["suggested_models"][0]
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
    "keep": {
        "summary": "Fix your Camry: about $151 a month versus $484 to trade.",
        "details": "Keeping costs about $151 a month. Trading into a 2021 Camry LE (CPO) at "
        "$24,500 would cost $484. The repair is about 61% of the car's value.",
    },
    "trade": {
        "summary": "Trade in for a 2021 Camry LE (CPO) at about $430 a month.",
        "details": "Keeping would cost $612.40 a month and the repair is 125% of the car's "
        "value. The 2021 Camry LE (CPO) has a $291.10 loan payment with $4,900 down.",
    },
    "refinance": {
        "summary": "Refinance and keep your RAV4: $155.69 a month instead of $382.52.",
        "details": "Refinancing brings your loan payment to about $83 a month.",
    },
}


@pytest.mark.parametrize("rec", ["keep", "trade", "refinance"])
def test_explain_uses_llm_reply(monkeypatch, rec):
    use_settings(monkeypatch)
    calls: list = []
    reply = json.dumps(LLM_REPLIES[rec])
    monkeypatch.setattr(llm.httpx, "post", fake_post(reply, calls))

    e = llm.explain(ctx(rec))

    assert e.summary == f"{LLM_REPLIES[rec]['summary']} {llm.SHORT_DISCLAIMER}"
    assert e.details == f"{LLM_REPLIES[rec]['details']} {llm.DISCLAIMER}"
    assert len(calls) == 1  # one request for both versions
    call = calls[0]
    assert call["url"] == "https://api.meta.ai/v1/chat/completions"
    assert call["headers"]["Authorization"] == "Bearer test-key"
    body = call["json"]
    assert body["model"] == "test-model"
    system = body["messages"][0]["content"]
    assert "Never compute" in system and '"summary"' in system and '"details"' in system
    user_msg = body["messages"][1]["content"]
    assert f'"recommendation": "{rec}"' in user_msg
    assert '"suggested_models"' in user_msg and "2021 Camry LE (CPO)" in user_msg
    assert "repair_ratio" not in user_msg  # raw ratio replaced by display value
    assert "curve" not in user_msg


def test_llm_reply_in_code_fence(monkeypatch):
    use_settings(monkeypatch)
    reply = "```json\n" + json.dumps(LLM_REPLIES["keep"]) + "\n```"
    monkeypatch.setattr(llm.httpx, "post", fake_post(reply, []))
    assert llm.explain(ctx("keep")).summary.startswith("Fix your Camry")


def test_llm_disclaimer_not_duplicated(monkeypatch):
    use_settings(monkeypatch)
    reply = json.dumps({"summary": "Keep it. Estimates, not financial advice.",
                        "details": "Keep it. " + llm.DISCLAIMER})
    monkeypatch.setattr(llm.httpx, "post", fake_post(reply, []))
    e = llm.explain(ctx("keep"))
    assert e.summary == "Keep it. Estimates, not financial advice."
    assert e.details.count("not financial advice") == 1


def test_explain_maps_older_rec_before_sending(monkeypatch):
    use_settings(monkeypatch)
    calls: list = []
    monkeypatch.setattr(llm.httpx, "post", fake_post(json.dumps(LLM_REPLIES["trade"]), calls))
    llm.explain({"recommendation": "replace_now"})
    assert '"recommendation": "trade"' in calls[0]["json"]["messages"][1]["content"]


@pytest.mark.parametrize("rec", ["keep", "trade", "refinance"])
def test_invented_number_falls_back_per_part(monkeypatch, rec):
    use_settings(monkeypatch)
    reply = json.dumps({"summary": "You would save $4,321 by month 99.",
                        "details": LLM_REPLIES[rec]["details"]})
    monkeypatch.setattr(llm.httpx, "post", fake_post(reply, []))
    e = llm.explain(ctx(rec))
    assert e.summary == template(ctx(rec)).summary  # bad part replaced
    assert e.details.startswith(LLM_REPLIES[rec]["details"])  # good part kept


def test_missing_part_falls_back(monkeypatch):
    use_settings(monkeypatch)
    monkeypatch.setattr(llm.httpx, "post", fake_post(json.dumps({"summary": "Keep it."}), []))
    e = llm.explain(ctx("keep"))
    assert e.summary.startswith("Keep it.")
    assert e.details == template(ctx("keep")).details


@pytest.mark.parametrize("reply", ["Just keep it, it's cheaper.", "[1, 2]", "   "])
def test_non_json_reply_falls_back(monkeypatch, reply):
    use_settings(monkeypatch)
    monkeypatch.setattr(llm.httpx, "post", fake_post(reply, []))
    assert llm.explain(ctx("keep")) == template(ctx("keep"))


def test_rounded_numbers_are_allowed():
    facts = {"affordability": {"monthly_surplus": 1234.56}, "krt_score": 72.4}
    assert llm._invented_numbers("About $1,235 a month, score 72, or 72.4.", facts) == []
    assert llm._invented_numbers("About $1,240 a month.", facts) == ["1,240"]
    assert llm._invented_numbers("Weight was 35%.", {"factors": [{"weight": 0.35}]}) == []


@pytest.mark.parametrize("status", [401, 500])
def test_http_error_falls_back(monkeypatch, status):
    use_settings(monkeypatch)
    monkeypatch.setattr(llm.httpx, "post", fake_post("x", [], status=status))
    assert llm.explain(ctx("trade")) == template(ctx("trade"))


def test_network_error_falls_back(monkeypatch):
    use_settings(monkeypatch)

    def boom(*a, **k):
        raise httpx.ConnectError("no network")

    monkeypatch.setattr(llm.httpx, "post", boom)
    assert llm.explain(ctx("keep")) == template(ctx("keep"))


def test_flaky_404_retries_then_uses_fallback_model(monkeypatch):
    use_settings(monkeypatch, llm_model="muse-a", llm_fallback_models="muse-b")
    models = []

    def _post(url, headers=None, json=None, timeout=None):
        models.append(json["model"])
        status = 404 if json["model"] == "muse-a" else 200  # Muse's intermittent model_not_found
        return httpx.Response(
            status,
            json={"choices": [{"message": {"role": "assistant", "content": "hi"}}]},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(llm.httpx, "post", _post)
    assert llm._complete("hello") == "hi"
    assert models == ["muse-a", "muse-a", "muse-b"]


def test_auth_error_is_not_retried(monkeypatch):
    use_settings(monkeypatch)
    calls = []
    monkeypatch.setattr(llm.httpx, "post", fake_post("x", calls, status=401))
    with pytest.raises(llm.LLMError):
        llm._complete("hello")
    assert len(calls) == 1


def test_timeout_skips_to_next_model(monkeypatch):
    use_settings(monkeypatch, llm_model="muse-a", llm_fallback_models="muse-b")
    models = []

    def _post(url, headers=None, json=None, timeout=None):
        models.append(json["model"])
        raise httpx.ReadTimeout("slow")

    monkeypatch.setattr(llm.httpx, "post", _post)
    with pytest.raises(llm.LLMError):
        llm._complete("hello")
    assert models == ["muse-a", "muse-b"]


@pytest.mark.parametrize(
    "provider, model, fallbacks, expected",
    [
        ("muse", "muse-spark-1.3", "", ["muse-spark-1.3", "muse-spark-1.2"]),
        ("muse", "muse-spark-1.2", "", ["muse-spark-1.2"]),
        ("openai", "gpt-x", "", ["gpt-x"]),
        ("openai", "gpt-x", " gpt-y, gpt-x ", ["gpt-x", "gpt-y"]),
    ],
)
def test_model_order(monkeypatch, provider, model, fallbacks, expected):
    use_settings(monkeypatch, llm_provider=provider, llm_fallback_models=fallbacks)
    assert llm._models(model) == expected


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
