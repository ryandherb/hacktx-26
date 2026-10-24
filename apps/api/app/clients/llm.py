"""LLM layer. The LLM parses messy text and explains results. It never computes them.

Provider-agnostic stub: wire your provider in `_complete`. With LLM_PROVIDER=none the
functions fall back to deterministic templates so the app runs without any key.
"""

import json

from app.config import get_settings


def _complete(prompt: str) -> str:
    s = get_settings()
    # TODO: call your provider here (s.llm_provider, s.llm_api_key, s.llm_model)
    raise NotImplementedError(f"LLM provider '{s.llm_provider}' not wired up")


def explain(context: dict) -> str:
    """Plain-language explanation of an analysis result."""
    if get_settings().llm_provider == "none":
        crossover = context.get("crossover_month")
        rec = context.get("recommendation")
        if rec == "keep":
            return "Keeping and repairing the current car looks cheaper over the horizon."
        if crossover is None:
            return "Replacing does not pay off within the horizon."
        return (
            f"Replacing starts to cost less than keeping around month {crossover}. "
            "Figures are estimates built on synthetic data, not financial advice."
        )
    return _complete(
        "Explain this keep-vs-replace analysis in plain language. State assumptions and "
        "uncertainty. Do not do any math beyond what is given.\n" + json.dumps(context)
    )


def extract(schema_hint: str, raw_text: str) -> dict:
    """Parse messy search text into structured JSON matching schema_hint."""
    if get_settings().llm_provider == "none":
        raise NotImplementedError("extract() needs a configured LLM provider")
    return json.loads(
        _complete(f"Return only JSON matching: {schema_hint}\n\nText:\n{raw_text}")
    )
