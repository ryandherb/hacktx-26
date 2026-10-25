"""LLM layer. The LLM parses messy text and explains results. It never computes them.

`_complete` is the one LLM client for the whole backend: the Cost Agent and PFO Agent
(via app/clients/muse.py) and the Explanation Agent all use it. It talks to any
OpenAI-compatible chat completions API (Meta Muse, OpenAI, Groq, OpenRouter, Gemini's compat
endpoint, ...). Configure it with LLM_PROVIDER, LLM_API_KEY and optionally LLM_MODEL,
LLM_BASE_URL, LLM_REASONING_EFFORT and LLM_MAX_TOKENS.

`explain` falls back to a deterministic template when USE_FIXTURES=true, LLM_PROVIDER=none,
LLM_API_KEY is empty, the request fails, or the reply contains a number it wasn't given.
"""

import json
import logging
from dataclasses import dataclass
import math
import re
from typing import Any

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

DISCLAIMER = (
    "Prices and recommendations are estimates built on synthetic data, not financial advice."
)
SHORT_DISCLAIMER = "Estimates, not financial advice."

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

# Provider defaults used when LLM_MODEL / LLM_REASONING_EFFORT are empty.
DEFAULT_MODELS = {"meta": "muse-spark-1.3", "muse": "muse-spark-1.3"}
# Muse Spark reasons before answering; "minimal" keeps those tokens from eating max_tokens.
DEFAULT_REASONING_EFFORT = {"meta": "minimal", "muse": "minimal"}
# Models tried after the main one when LLM_FALLBACK_MODELS is empty. muse-spark-1.3
# intermittently answers 404 model_not_found for a model it just served.
DEFAULT_FALLBACK_MODELS = {"meta": ["muse-spark-1.2"], "muse": ["muse-spark-1.2"]}
# Retried once on the same model, then the next model is tried. Timeouts skip the retry.
TRANSIENT_STATUS = {404, 408, 409, 429, 500, 502, 503, 504}
ATTEMPTS_PER_MODEL = 2

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
Reply with ONLY a JSON object with two string fields:
- "summary": 1 or 2 short, friendly sentences a busy customer can read at a glance. Say the \
recommendation and the single most important reason, with at most two numbers. End with \
"{SHORT_DISCLAIMER}"
- "details": 4 to 7 plain-language sentences (no markdown, no lists) for customers who want \
the full picture: compare the monthly costs, explain the repair cost and savings, and \
describe the suggested Toyota models (name, price, payment, and their reason). End with \
"{DISCLAIMER}"

What the fields mean:
- recommendation: "keep" (repair and keep the car), "trade" (trade it in now), or \
"refinance" (keep the car and refinance the loan).
- krt.keepResult, krt.tradeResult, krt.refinanceResult: estimated all-in monthly cost in \
dollars of each option. Lower is better.
- krt.new_payment: monthly loan payment for the best replacement car. krt.refi_payment: \
monthly loan payment after refinancing. krt.trade_affordable: whether any replacement fits \
the customer's comfortable payment.
- krt.suggested_models: up to 3 Toyota models, best first, with price, down_payment, \
new_payment (loan), insurance_delta and fuel_delta (monthly change; negative means \
savings), monthly_cost (all-in) and a reason.
- krt.repair_pct_of_car_value: the repair cost as a percent of what the car is worth.
- krt.savings_months_after_repair: months of spending the customer's savings would cover \
after paying for the repair. Negative means the repair costs more than their savings.
- krt.remaining_life_pct: percent of the car's expected life left.
- repair_cost: estimated repair cost in dollars. vehicle: the customer's current car.
- affordability: the customer's monthly income, spending, savings, surplus, and the largest \
monthly payment that looks comfortable.

Strict rules:
- Never compute, estimate, round differently, add up, subtract, or invent any number. Only \
restate numbers exactly as they appear in the JSON. If a number is not in the JSON, do not \
mention it. Do not state differences or savings between options unless that number is given.
- Do not change the recommendation. Explain the one you were given.
- If the recommendation is not "trade", you may mention the best suggested model as an \
option for later.
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


def _complete(
    prompt: str,
    system: str | None = None,
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> str:
    """Send one chat completion request and return the reply text. Raises LLMError."""
    s = get_settings()
    if not llm_configured():
        raise LLMError(f"LLM provider '{s.llm_provider}' is not configured")
    provider = s.llm_provider.strip().lower()
    model = s.llm_model.strip() or DEFAULT_MODELS.get(provider, "")
    if not model:
        raise LLMError("LLM_MODEL is not set")

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    body: dict[str, Any] = {
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens or s.llm_max_tokens,
    }
    effort = s.llm_reasoning_effort.strip() or DEFAULT_REASONING_EFFORT.get(provider, "")
    if effort:
        body["reasoning_effort"] = effort

    url = _chat_url()
    last_error: Exception | None = None
    for candidate in _models(model):
        for _ in range(ATTEMPTS_PER_MODEL):
            try:
                r = httpx.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {s.llm_api_key.strip()}",
                        "Content-Type": "application/json",
                    },
                    json={"model": candidate, **body},
                    timeout=s.llm_timeout_seconds,
                )
                r.raise_for_status()
                return _content_from_response(r.json())
            except httpx.HTTPStatusError as e:
                if e.response.status_code not in TRANSIENT_STATUS:
                    raise LLMError(f"LLM request failed: {e}") from e
                last_error = e
            except httpx.TimeoutException as e:
                last_error = e
                break
            except httpx.TransportError as e:
                last_error = e
            except (ValueError, KeyError, IndexError, TypeError) as e:
                raise LLMError(f"LLM request failed: {e}") from e
            log.info("LLM %s attempt failed (%s), retrying", candidate, last_error)
    raise LLMError(f"LLM request failed: {last_error}") from last_error


def _models(model: str) -> list[str]:
    """The main model first, then the fallbacks, without duplicates."""
    s = get_settings()
    fallbacks = [m.strip() for m in s.llm_fallback_models.split(",") if m.strip()]
    if not fallbacks:
        fallbacks = DEFAULT_FALLBACK_MODELS.get(s.llm_provider.strip().lower(), [])
    return list(dict.fromkeys([model, *fallbacks]))


# ---------------------------------------------------------------------------
# Explanation Agent
# ---------------------------------------------------------------------------


@dataclass
class Explanation:
    summary: str  # 1-2 sentences for the main results card
    details: str  # full explanation with the numbers, for the "more details" drop-down


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
    # The full monthly curve is long and invites the LLM to do math; drop it.
    ctx.pop("curve", None)
    if isinstance(ctx.get("krt"), dict):
        ctx["krt"] = _krt_display(ctx["krt"])
    return ctx


SUGGESTED_FIELDS = (
    "name", "kind", "price", "seats", "mpg", "down_payment", "new_payment",
    "insurance_delta", "fuel_delta", "monthly_cost", "reason",
)


def _krt_display(krt: dict) -> dict:
    """KRTResult with ratios turned into ready-to-say values, so the LLM never has to."""
    keys = ("keepResult", "tradeResult", "refinanceResult", "new_payment", "refi_payment",
            "trade_affordable")
    out = {k: krt[k] for k in keys if k in krt}
    if _num(krt.get("repair_ratio")):
        out["repair_pct_of_car_value"] = round(krt["repair_ratio"] * 100)
    if _num(krt.get("pr_runway")):
        out["savings_months_after_repair"] = round(krt["pr_runway"], 1)
    if _num(krt.get("remaining_life")):
        out["remaining_life_pct"] = round(krt["remaining_life"] * 100)
    if isinstance(krt.get("suggested_models"), list):
        out["suggested_models"] = [
            {k: m[k] for k in SUGGESTED_FIELDS if k in m}
            for m in krt["suggested_models"][:3]
            if isinstance(m, dict)
        ]
    return out


def _money(v: Any) -> str:
    return f"${float(v):,.0f}"


def _num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


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
        return abs(float(w)) if _num(w) else 0.0

    return sorted(factors, key=weight, reverse=True)[:n]


def _car_name(facts: dict) -> str:
    v = facts.get("vehicle")
    return f"your {v}" if isinstance(v, str) and v.strip() else "your car"


def _best_pick(krt: dict) -> dict | None:
    picks = krt.get("suggested_models")
    return picks[0] if isinstance(picks, list) and picks and isinstance(picks[0], dict) else None


def _pick_line(m: dict) -> str:
    """'2021 Camry LE (CPO) at $24,500: about $291/mo loan payment with $4,900 down'"""
    line = m.get("name", "a newer Toyota")
    if _num(m.get("price")):
        line += f" at {_money(m['price'])}"
    if _num(m.get("new_payment")):
        line += f": about {_money(m['new_payment'])} a month loan payment"
        if _num(m.get("down_payment")):
            line += f" with {_money(m['down_payment'])} down"
    if m.get("reason"):
        line += f" ({m['reason']})"
    return line


# --- short summary -----------------------------------------------------------

SHORT_HEADLINES = {
    "keep": "Repairing {car} is your best move",
    "trade": "Trading in {car} is your best move",
    "refinance": "Keeping {car} and refinancing the loan is your best move",
}


def _summary_template(facts: dict) -> str:
    """1-2 plain sentences plus a short disclaimer. Formats given numbers only."""
    rec = facts.get("recommendation")
    krt = facts.get("krt") if isinstance(facts.get("krt"), dict) else {}
    keep, trade, refi = krt.get("keepResult"), krt.get("tradeResult"), krt.get("refinanceResult")
    best = _best_pick(krt)
    car = _car_name(facts)

    if rec not in SHORT_HEADLINES:
        return f"Here's a summary of your options. {SHORT_DISCLAIMER}"
    first = SHORT_HEADLINES[rec].format(car=car)
    if rec == "keep" and _num(keep) and _num(trade):
        first += f": about {_money(keep)} a month, compared with {_money(trade)} to trade in."
    elif rec == "refinance" and _num(refi) and _num(keep):
        first += f": about {_money(refi)} a month, compared with {_money(keep)} on your current loan."
    elif rec == "trade" and best and _num(best.get("monthly_cost")) and _num(keep):
        first += (
            f": a {best.get('name', 'newer Toyota')} would run about "
            f"{_money(best['monthly_cost'])} a month, compared with {_money(keep)} to keep "
            "your current car."
        )
    else:
        first += "."
    parts = [first[0].upper() + first[1:]]

    pct = krt.get("repair_pct_of_car_value")
    if rec == "keep" and krt.get("trade_affordable") is False:
        parts.append("A new car payment doesn't fit your budget right now.")
    elif rec == "trade" and _num(pct):
        parts.append(f"The repair would cost about {pct:g}% of what your car is worth.")
    elif rec == "refinance" and _num(krt.get("refi_payment")):
        parts.append(f"Your new loan payment would be about {_money(krt['refi_payment'])} a month.")
    elif rec == "keep" and _num(pct) and pct >= 100:
        parts.append(
            f"The repair costs about {pct:g}% of what your car is worth, but keeping it is "
            "still cheaper each month than trading in."
        )
    elif rec == "keep" and _num(pct):
        parts.append(f"The repair is about {pct:g}% of what your car is worth, so fixing it pays off.")

    parts.append(SHORT_DISCLAIMER)
    return " ".join(parts)


# --- detailed explanation ----------------------------------------------------

HEADLINES = {
    "keep": "Repairing and keeping your current car looks like the best move.",
    "trade": "Trading in now looks like the best move, and a replacement fits your budget.",
    "refinance": "Keeping your car and refinancing the loan looks like the best move.",
}


def _details_template(facts: dict) -> str:
    """Full explanation with the numbers. Only formats numbers from `facts`; computes nothing."""
    rec = facts.get("recommendation")
    krt = facts.get("krt") if isinstance(facts.get("krt"), dict) else {}
    parts: list[str] = []
    if rec in HEADLINES:
        parts.append(HEADLINES[rec])

    score = facts.get("krt_score")
    if _num(score):
        parts.append(f"Your KRT score is {score:g} out of 100 (0 leans repair, 100 leans trade).")

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

    if rec == "refinance" and _num(krt.get("refi_payment")):
        parts.append(f"Refinancing would set your loan payment at about {_money(krt['refi_payment'])} a month.")

    best = _best_pick(krt)
    picks = krt.get("suggested_models") or []
    if rec == "trade" and picks:
        parts.append("Top picks for you: " + "; ".join(_pick_line(m) for m in picks) + ".")
    elif best:
        lead = "If you'd rather trade in, the best fit is "
        over = krt.get("trade_affordable") is False and "comfortable" not in str(best.get("reason", ""))
        tail = ", though that's over your comfortable payment" if over else ""
        parts.append(lead + _pick_line(best) + tail + ".")
    if best:
        extras = []
        if _num(best.get("insurance_delta")) and best["insurance_delta"] > 0:
            extras.append(f"insurance would go up about {_money(best['insurance_delta'])} a month")
        if _num(best.get("fuel_delta")) and best["fuel_delta"] < 0:
            extras.append(f"you'd save about {_money(-best['fuel_delta'])} a month on gas")
        elif _num(best.get("fuel_delta")) and best["fuel_delta"] > 0:
            extras.append(f"gas would cost about {_money(best['fuel_delta'])} more a month")
        if extras:
            sentence = "With that car, " + " and ".join(extras) + "."
            parts.append(sentence)

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


def _template(facts: dict) -> Explanation:
    return Explanation(summary=_summary_template(facts), details=_details_template(facts))


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


def _checked(text: Any, facts: dict, fallback: str, disclaimer: str, label: str) -> str:
    """Use the LLM's text unless it's missing or has invented numbers."""
    if not isinstance(text, str) or not text.strip():
        log.warning("explain: LLM %s missing; using template", label)
        return fallback
    text = text.strip()
    invented = _invented_numbers(text, facts)
    if invented:
        log.warning("explain: LLM %s used numbers not in the facts %s; using template", label, invented)
        return fallback
    if "not financial advice" not in text.lower():
        text = f"{text} {disclaimer}"
    return text


def explain(context: dict) -> Explanation:
    """Short summary + detailed explanation of a KRT result.

    Expected keys (all optional): `recommendation` (keep | trade | refinance; older names
    are mapped), `krt` (KRTResult or dict, including `suggested_models`), `vehicle`
    (e.g. "2012 Camry"), `repair_cost` (or `repair_cost_low` and `repair_cost_high`),
    `affordability` (AffordabilityResult or dict), `horizon_months`, `krt_score` (0-100)
    and `factors`. A raw `curve` is dropped.
    """
    facts = _build_facts(context)
    fallback = _template(facts)
    if not _llm_enabled_for_explain():
        return fallback

    try:
        reply = _complete(
            "Explain this result. Facts (JSON):\n" + json.dumps(facts, default=str),
            system=EXPLAIN_SYSTEM_PROMPT,
            max_tokens=max(get_settings().llm_max_tokens, 1500),
        )
        data = json.loads(_strip_code_fence(reply))
        if not isinstance(data, dict):
            raise ValueError("reply is not a JSON object")
    except (LLMError, ValueError) as e:
        log.warning("explain: falling back to template (%s)", e)
        return fallback

    return Explanation(
        summary=_checked(data.get("summary"), facts, fallback.summary, SHORT_DISCLAIMER, "summary"),
        details=_checked(data.get("details"), facts, fallback.details, DISCLAIMER, "details"),
    )


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
