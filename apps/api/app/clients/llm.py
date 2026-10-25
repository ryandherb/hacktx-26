"""LLM layer. The LLM parses messy text and explains results. It never computes them.

`_complete` talks to any OpenAI-compatible chat completions API (OpenAI, Meta, Groq,
OpenRouter, Gemini's compat endpoint, ...). Configure it with LLM_PROVIDER, LLM_API_KEY,
LLM_MODEL and optionally LLM_BASE_URL.

`explain` falls back to a deterministic template when USE_FIXTURES=true, LLM_PROVIDER=none,
LLM_API_KEY is empty, the request fails, or the reply contains a number it wasn't given.
"""

import json
import logging
import math
import re
from typing import Any

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

DISCLAIMER = (
    "Prices and recommendations are estimates built on synthetic data, not financial advice."
)

# Default base URLs per provider. Anything else needs LLM_BASE_URL.
DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "meta": "https://api.meta.ai/v1",
    "muse": "https://api.meta.ai/v1",
    "llama": "https://api.llama.com/compat/v1",
    "groq": "https://api.groq.com/openai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
}

# Recommendation values: "keep" | "trade" | "refinance".
# Older names from the scaffold and earlier plans map onto them.
LEGACY_RECOMMENDATIONS = {
    "repair": "keep",
    "replace_now": "trade",
    "replace_later": "keep",
    "repair_then_trade": "keep",
}

EXPLAIN_SYSTEM_PROMPT = f"""You are the Explanation Agent for Next Move, a tool that helps a \
Toyota owner with a repair need decide whether to keep (repair) their car, trade it in for a \
newer Toyota, or keep it and refinance the loan.

You receive a JSON object with results that were already computed by deterministic code.
Write a short, friendly, plain-language summary (3 to 5 sentences, no markdown, no lists).

What the fields mean:
- recommendation: "keep" (repair and keep the car), "trade" (trade it in now), or \
"refinance" (keep the car and refinance the loan at a lower payment).
- krt.keepResult, krt.tradeResult, krt.refinanceResult: estimated monthly cost in dollars \
of each option. Lower is better.
- krt.repair_pct_of_car_value: the repair cost as a percent of what the car is worth.
- krt.savings_months_after_repair: months of spending the customer's savings would cover \
after paying for the repair. Negative means the repair costs more than their savings.
- krt.remaining_life_pct: percent of the car's expected life left.
- repair_cost: estimated repair cost in dollars.
- affordability: the customer's monthly income, spending, savings, surplus, and the largest \
monthly payment that looks comfortable.

Strict rules:
- Never compute, estimate, round differently, add up, or invent any number. Only restate \
numbers exactly as they appear in the JSON. If a number is not in the JSON, do not mention it.
- Do not change the recommendation. Explain the one you were given.
- Lead with the recommendation, then compare the monthly costs, then mention one or two \
other facts that support it.
- Only mention crossover_month if the recommendation is "trade".
- End with this exact sentence: "{DISCLAIMER}"
"""


class LLMError(RuntimeError):
    """Raised when the LLM provider is not configured or the request fails."""


# ---------------------------------------------------------------------------
# Provider call
# ---------------------------------------------------------------------------


def llm_configured() -> bool:
    """True when a provider and key are set. Says nothing about USE_FIXTURES."""
    s = get_settings()
    return s.llm_provider.strip().lower() not in ("", "none") and bool(s.llm_api_key.strip())


def _chat_url() -> str:
    s = get_settings()
    base = s.llm_base_url.strip() or DEFAULT_BASE_URLS.get(s.llm_provider.strip().lower(), "")
    if not base:
        raise LLMError(
            f"No base URL for LLM provider '{s.llm_provider}'. Set LLM_BASE_URL."
        )
    base = base.rstrip("/")
    return base if base.endswith("/chat/completions") else base + "/chat/completions"


def _content_from_response(data: dict) -> str:
    """Pull the reply text from an OpenAI-style (or Llama API-style) response."""
    if data.get("choices"):
        content = (data["choices"][0].get("message") or {}).get("content")
    else:  # Llama API native shape: {"completion_message": {"content": {"text": ...}}}
        content = (data.get("completion_message") or {}).get("content")
    if isinstance(content, dict):
        content = content.get("text")
    if isinstance(content, list):  # content parts
        content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
    if not isinstance(content, str) or not content.strip():
        raise LLMError("LLM response had no text content")
    return content.strip()


def _complete(prompt: str, system: str | None = None, temperature: float = 0.2) -> str:
    """Send one chat completion request and return the reply text. Raises LLMError."""
    s = get_settings()
    if not llm_configured():
        raise LLMError(f"LLM provider '{s.llm_provider}' is not configured")
    if not s.llm_model.strip():
        raise LLMError("LLM_MODEL is not set")

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        r = httpx.post(
            _chat_url(),
            headers={
                "Authorization": f"Bearer {s.llm_api_key.strip()}",
                "Content-Type": "application/json",
            },
            json={"model": s.llm_model.strip(), "messages": messages, "temperature": temperature},
            timeout=s.llm_timeout_seconds,
        )
        r.raise_for_status()
        return _content_from_response(r.json())
    except LLMError:
        raise
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as e:
        raise LLMError(f"LLM request failed: {e}") from e


# ---------------------------------------------------------------------------
# Explanation Agent
# ---------------------------------------------------------------------------


def normalize_recommendation(rec: str | None) -> str | None:
    """Map older names (repair, replace_now, replace_later, ...) to keep/trade/refinance."""
    if rec is None:
        return None
    rec = str(rec).strip().lower()
    return LEGACY_RECOMMENDATIONS.get(rec, rec)


def _to_plain(value: Any) -> Any:
    """Turn Pydantic models (and lists/dicts of them) into plain JSON-able data."""
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if isinstance(value, dict):
        return {k: _to_plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_plain(v) for v in value]
    return value


def _build_facts(context: dict) -> dict:
    """The exact facts the LLM (or template) is allowed to use."""
    ctx = _to_plain(dict(context))
    ctx["recommendation"] = normalize_recommendation(ctx.get("recommendation"))
    # The full monthly curve is long and invites the LLM to do math. Pass the
    # simulation's own summary fields instead; drop the raw points.
    ctx.pop("curve", None)
    if isinstance(ctx.get("krt"), dict):
        ctx["krt"] = _krt_display(ctx["krt"])
    return ctx


def _krt_display(krt: dict) -> dict:
    """KRTResult with ratios turned into ready-to-say values, so the LLM never has to."""
    out = {k: krt[k] for k in ("keepResult", "tradeResult", "refinanceResult") if k in krt}
    if isinstance(krt.get("repair_ratio"), (int, float)):
        out["repair_pct_of_car_value"] = round(krt["repair_ratio"] * 100)
    if isinstance(krt.get("pr_runway"), (int, float)):
        out["savings_months_after_repair"] = round(krt["pr_runway"], 1)
    if isinstance(krt.get("remaining_life"), (int, float)):
        out["remaining_life_pct"] = round(krt["remaining_life"] * 100)
    return out


def _money(v: Any) -> str:
    return f"${float(v):,.0f}"


def _factor_name(f: Any) -> str | None:
    if isinstance(f, str):
        return f
    if isinstance(f, dict):
        return f.get("label") or f.get("name") or f.get("factor")
    return None


def _top_factors(factors: Any, n: int = 3) -> list[dict | str]:
    """Factors sorted by absolute weight (largest first), if weights are given."""
    if isinstance(factors, dict):  # {"name": weight}
        factors = [{"name": k, "weight": v} for k, v in factors.items()]
    if not isinstance(factors, list):
        return []

    def weight(f: Any) -> float:
        w = f.get("weight", f.get("contribution")) if isinstance(f, dict) else None
        return abs(float(w)) if isinstance(w, (int, float)) else 0.0

    return sorted(factors, key=weight, reverse=True)[:n]


HEADLINES = {
    "keep": "Repairing and keeping your current car looks like the best move.",
    "trade": "Trading in now looks like the best move, and a replacement fits your budget.",
    "refinance": "Keeping your car and refinancing the loan looks like the best move.",
}


def _num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _template(facts: dict) -> str:
    """Deterministic explanation. Only formats numbers from `facts`; computes nothing."""
    rec = facts.get("recommendation")
    parts: list[str] = []
    if rec in HEADLINES:
        parts.append(HEADLINES[rec])

    score = facts.get("krt_score")
    if _num(score):
        parts.append(f"Your KRT score is {score:g} out of 100 (0 leans repair, 100 leans trade).")

    krt = facts.get("krt") if isinstance(facts.get("krt"), dict) else {}
    keep, trade, refi = krt.get("keepResult"), krt.get("tradeResult"), krt.get("refinanceResult")
    if _num(keep) and _num(trade):
        costs = f"Estimated monthly cost: keeping {_money(keep)}, trading {_money(trade)}"
        if _num(refi) and refi != keep:  # equal when there's no loan to refinance
            costs += f", refinancing {_money(refi)}"
        parts.append(costs + ".")

    lo, hi = facts.get("repair_cost_low"), facts.get("repair_cost_high")
    if _num(lo) and _num(hi):
        parts.append(f"The repair is estimated at {_money(lo)} to {_money(hi)}.")
    elif _num(facts.get("repair_cost")):
        parts.append(f"The repair is estimated at about {_money(facts['repair_cost'])}.")

    pct, runway = krt.get("repair_pct_of_car_value"), krt.get("savings_months_after_repair")
    if _num(pct):
        said_cost = parts and parts[-1].startswith("The repair is estimated")
        lead = "That's" if said_cost else "The repair is"
        sentence = f"{lead} about {pct:g}% of what the car is worth"
        if _num(runway):
            sentence += (
                ", and it costs more than your current savings"
                if runway < 0
                else f", and after paying for it your savings would cover about {runway:g} "
                f"month{'' if runway == 1 else 's'} of spending"
            )
        parts.append(sentence + ".")
    life = krt.get("remaining_life_pct")
    if _num(life):
        parts.append(f"The car has about {life:g}% of its expected life left.")

    crossover = facts.get("crossover_month")
    if rec == "trade" and crossover is not None:
        parts.append(f"Trading starts to cost less than keeping around month {crossover}.")

    names = [n for n in (_factor_name(f) for f in _top_factors(facts.get("factors"))) if n]
    if names:
        parts.append("The biggest factors were " + ", ".join(names) + ".")

    afford = facts.get("affordability")
    if isinstance(afford, dict):
        surplus = afford.get("monthly_surplus")
        max_pay = afford.get("max_comfortable_payment")
        if _num(surplus) and _num(max_pay) and max_pay <= 0:
            parts.append(
                f"You have about {_money(surplus)} left over each month, so there's no room "
                "for a new car payment right now."
            )
        elif _num(surplus) and _num(max_pay):
            parts.append(
                f"You have about {_money(surplus)} left over each month, and a payment up to "
                f"{_money(max_pay)} looks comfortable."
            )

    if not parts:
        parts.append("Here is a summary of your keep, trade, or refinance analysis.")
    parts.append(DISCLAIMER)
    return " ".join(parts)


# --- guardrail: the LLM may only restate numbers it was given ----------------

_NUMBER_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _numbers_in(value: Any) -> list[float]:
    """Every number in a fact value, including digits inside strings."""
    if isinstance(value, bool) or value is None:
        return []
    if isinstance(value, (int, float)):
        return [float(value)] if math.isfinite(value) else []
    if isinstance(value, str):
        return [float(m.replace(",", "")) for m in _NUMBER_RE.findall(value)]
    if isinstance(value, dict):
        return [n for k, v in value.items() for n in _numbers_in(k) + _numbers_in(v)]
    if isinstance(value, (list, tuple)):
        return [n for v in value for n in _numbers_in(v)]
    return []


def _allowed_numbers(facts: dict) -> set[float]:
    allowed = {0.0, 100.0}  # score scale
    for n in _numbers_in(facts):
        n = abs(n)
        allowed.add(n)
        if n <= 1:  # weights like 0.25 may be said as 25%
            allowed.add(n * 100)
    return allowed


def _invented_numbers(text: str, facts: dict) -> list[str]:
    """Numbers in `text` that don't match any fact (allowing display rounding)."""
    allowed = _allowed_numbers(facts)
    bad = []
    for raw in _NUMBER_RE.findall(text):
        token = raw.rstrip(".,")
        n = float(token.replace(",", ""))
        decimals = len(token.split(".")[1]) if "." in token else 0
        tol = 10 ** -decimals  # "$1,235" may stand for 1234.56
        if not any(abs(n - a) < tol for a in allowed):
            bad.append(token)
    return bad


def _llm_enabled_for_explain() -> bool:
    return llm_configured() and not get_settings().use_fixtures


def explain(context: dict) -> str:
    """Plain-language explanation of a KRT result.

    Expected keys (all optional): `recommendation` (keep | trade | refinance; older names
    are mapped), `krt` (KRTResult or dict), `repair_cost` (or `repair_cost_low` and
    `repair_cost_high`), `crossover_month`, `horizon_months`, `affordability`
    (AffordabilityResult or dict), `krt_score` (0-100) and `factors` (list of
    {name/label, weight, detail} or {name: weight}). A raw `curve` is dropped.
    """
    facts = _build_facts(context)
    if not _llm_enabled_for_explain():
        return _template(facts)

    try:
        text = _complete(
            "Explain this result. Facts (JSON):\n" + json.dumps(facts, default=str),
            system=EXPLAIN_SYSTEM_PROMPT,
        )
    except LLMError as e:
        log.warning("explain: falling back to template (%s)", e)
        return _template(facts)

    invented = _invented_numbers(text, facts)
    if invented:
        log.warning("explain: LLM used numbers not in the facts %s; using template", invented)
        return _template(facts)
    if DISCLAIMER not in text:
        text = f"{text} {DISCLAIMER}"
    return text


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


def _strip_code_fence(text: str) -> str:
    m = re.match(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", text, re.DOTALL)
    return m.group(1) if m else text


def extract(schema_hint: str, raw_text: str) -> dict:
    """Parse messy text into structured JSON matching schema_hint.

    Raises NotImplementedError when no provider is configured (callers show a form instead),
    and LLMError if the request fails.
    """
    if not llm_configured():
        raise NotImplementedError("extract() needs a configured LLM provider")
    reply = _complete(
        f"Return only JSON matching: {schema_hint}\n\nText:\n{raw_text}", temperature=0
    )
    try:
        return json.loads(_strip_code_fence(reply))
    except ValueError as e:
        raise LLMError(f"LLM did not return valid JSON: {e}") from e
