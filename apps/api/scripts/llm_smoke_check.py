"""Live check of the LLM key (Meta Muse by default): lists models, runs the real Cost Agent
classify and PFO extract paths, and one Explanation Agent call. All go through the shared
client, app/clients/llm.py::_complete. Reads LLM_* from apps/api/.env.

Run from apps/api:
    .venv/bin/python -m scripts.llm_smoke_check

Costs a few cents at most; repeat classify/extract runs hit the SQLite cache and cost nothing.
"""

import sys

import httpx

from app.clients import llm
from app.config import get_settings
from app.pfo_agent import parse_with_llm
from app.repair_classifier import SYSTEM_PROMPT, _user_prompt, classify_with_llm

CLASSIFY_CASES = {
    "transmission slipping": "transmission",
    "A/C compressor failing": "ac_compressor",
    "check engine light, oxygen sensor": "o2_sensor",
    "my brakes squeal and grind when I stop": "brakes",
    "engine not starting": None,  # not quotable
    "electricity out": None,
}
EXTRACT_CASES = [
    ("down_payment", "I could do maybe two grand", 2000.0),
    ("credit_band", "pretty good I think, around 700", "good"),
    ("other_debt_load", "just a small balance on one credit card", "light"),
    ("upcoming_major_expense", "my daughter starts college in the fall", True),
    ("income_stability", "I just got promoted and my job is solid", "growing"),
    ("car_usage", "I do DoorDash with it most nights", "high"),
]


def main() -> int:
    s = get_settings()
    key = s.llm_api_key.strip()
    provider = s.llm_provider.strip().lower()
    model = s.llm_model.strip() or llm.DEFAULT_MODELS.get(provider, "")
    print(f"provider={s.llm_provider} model={model} key={'set' if key else 'MISSING'}")
    if not llm.llm_configured():
        print("LLM is disabled. Set LLM_PROVIDER=meta and LLM_API_KEY in apps/api/.env.")
        return 1
    base = llm._chat_url().removesuffix("/chat/completions")
    print(f"base={base}")

    try:
        r = httpx.get(f"{base}/models",
                      headers={"Authorization": f"Bearer {key}"}, timeout=s.llm_timeout_seconds)
        r.raise_for_status()
        ids = [m.get("id") for m in r.json().get("data", [])]
        print(f"models available to this key: {ids}")
        if ids and model not in ids:
            print(f"WARNING: model {model} is not in that list.")
    except (httpx.HTTPError, ValueError) as exc:
        print(f"could not list models: {exc}")

    print("\n-- one uncached call --")
    try:
        text = llm._complete(_user_prompt("transmission slipping"), system=SYSTEM_PROMPT, temperature=0)
        print(f"reply: {text!r}")
    except llm.LLMError as exc:
        print(f"call failed: {exc}")
        return 1

    failures = 0
    print("\n-- classify (cached after first run) --")
    for text, expected in CLASSIFY_CASES.items():
        result = classify_with_llm(text)
        got = result.category if result and result.quotable else None
        ok = result is not None and got == expected
        failures += not ok
        detail = f"{result.kind}/{result.category} conf={result.confidence}" if result else "NO REPLY (fallback would be used)"
        print(f"[{'ok' if ok else 'FAIL'}] {text!r} -> {detail}")

    print("\n-- PFO extract --")
    for field, text, expected in EXTRACT_CASES:
        got = parse_with_llm(field, text)
        ok = got == expected
        failures += not ok
        print(f"[{'ok' if ok else 'FAIL'}] {field}: {text!r} -> {got!r} (expected {expected!r})")

    print("\n-- Explanation Agent --")
    facts = {"recommendation": "keep", "vehicle": "2012 Camry", "repair_cost": 4950,
             "krt": {"keepResult": 226.0, "tradeResult": 377.0, "refinanceResult": 226.0}}
    e = llm.explain(facts)
    template = llm._template(llm._build_facts(facts))
    print(f"summary ({'TEMPLATE fallback' if e.summary == template.summary else 'llm'}): {e.summary}")
    print(f"details ({'TEMPLATE fallback' if e.details == template.details else 'llm'}): {e.details}")

    print(f"\n{failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
