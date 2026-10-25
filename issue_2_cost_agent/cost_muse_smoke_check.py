"""Live check of the Muse key: lists models, then runs the real classify/extract paths.

Run from the repo root:
    apps/api/.venv/Scripts/python.exe -m issue_2_cost_agent.cost_muse_smoke_check

Costs a few cents at most; repeat runs hit the SQLite cache and cost nothing.
"""

import sys

import httpx

from .app import cost_config
from .app.repair_classifier import SYSTEM_PROMPT, _user_prompt, classify_with_llm
from .app.clients.muse import chat
from .app.pfo_agent import parse_with_llm

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
    s = cost_config.get_cost_settings()
    key = s.llm_api_key.strip()
    print(f"env file: {cost_config.ENV_FILE} (exists: {cost_config.ENV_FILE.exists()})")
    print(f"provider={s.llm_provider} model={s.llm_model} base={s.llm_base_url} key={'set' if key else 'MISSING'}")
    if not s.llm_enabled:
        print("LLM is disabled. Set LLM_PROVIDER=meta and LLM_API_KEY in cost_agent.env.")
        return 1

    try:
        r = httpx.get(f"{s.llm_base_url.rstrip('/')}/models",
                      headers={"Authorization": f"Bearer {key}"}, timeout=s.llm_timeout_seconds)
        r.raise_for_status()
        ids = [m.get("id") for m in r.json().get("data", [])]
        print(f"models available to this key: {ids}")
        if ids and s.llm_model not in ids:
            print(f"WARNING: LLM_MODEL={s.llm_model} is not in that list.")
    except (httpx.HTTPError, ValueError) as exc:
        print(f"could not list models: {exc}")

    print("\n-- one uncached call (shows token usage) --")
    try:
        text, usage = chat(SYSTEM_PROMPT, _user_prompt("transmission slipping"))
        print(f"reply: {text!r}\nusage: {usage}")
    except httpx.HTTPStatusError as exc:
        print(f"HTTP {exc.response.status_code}: {exc.response.text[:500]}")
        return 1
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        print(f"call failed: {exc!r}")
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

    print(f"\n{failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
