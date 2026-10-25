"""Save real backend output for the demo profiles, for the frontend's offline mode.

The Vercel demo has no backend, so the frontend falls back to this snapshot when the API is
unreachable. Rerun after changing the engine, the Cost Agent, or the explanation templates:

    cd apps/api && USE_FIXTURES=true LLM_PROVIDER=none .venv/bin/python -m scripts.export_demo_snapshot

Inputs mirror the frontend's demo presets (apps/web/lib/demo/answers.ts) and its
toPfoAnswers() mapping (apps/web/lib/advisor/situation.ts). Keep them in sync.
"""

import json
import os
from pathlib import Path

os.environ.setdefault("USE_FIXTURES", "true")
os.environ.setdefault("LLM_PROVIDER", "none")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

OUT = Path(__file__).resolve().parents[3] / "apps/web/lib/demo/offline-snapshot.json"

DEMO = {
    "maria": {
        # DEMO_ANSWERS.maria.repair_description / DEMO_SHOP_QUOTES.maria
        "repair_description": "Transmission slips when shifting from 2nd to 3rd, and the RPMs jump on the highway.",
        "shop_quote": {"amount": 1850, "shop": "Central TX Auto Care"},
        # toPfoAnswers(DEMO_SITUATION.maria): new job, 740+, $6,000 down, daily commute
        "pfo_answers": {"down_payment": 6000, "credit_band": "excellent", "other_debt_load": "none",
                        "upcoming_major_expense": False, "income_stability": "growing", "car_usage": "high"},
    },
    "dev": {
        "repair_description": "A/C blows warm air, and there's a grinding noise when it kicks on.",
        "shop_quote": {"amount": 1450, "shop": "South Austin Auto A/C"},
        # toPfoAnswers(DEMO_SITUATION.dev): graduating + internship, 580-669, $500 down, daily commute
        "pfo_answers": {"down_payment": 500, "credit_band": "fair", "other_debt_load": "none",
                        "upcoming_major_expense": False, "income_stability": "at_risk", "car_usage": "high"},
    },
}


def main() -> None:
    client = TestClient(app)

    def post(path: str, body: dict) -> dict:
        r = client.post(path, json=body)
        r.raise_for_status()
        return r.json()

    snapshot = {}
    for pid, demo in DEMO.items():
        survey = post("/pre-quote-survey", {"profile_id": pid, "answers": {"repair_type": demo["repair_description"]}})
        quote = post("/quote", {"profile_id": pid, "quote_input": survey["quote_input"]})
        # A symptom the table can't price needs a shop quote; the demo uses the sample one.
        scored_quote = quote if quote["complete"] else post(
            "/quote", {"profile_id": pid, "quote_input": survey["quote_input"], "manual_quote": demo["shop_quote"]}
        )
        pfo = post("/onboarding", {"answers": demo["pfo_answers"]})
        analysis = post("/analyze", {"profile_id": pid, "quote": scored_quote, "pfo_factors": pfo["factors"]})
        snapshot[pid] = {"survey": survey, "quote": quote, "analysis": analysis}
        print(f"{pid}: quote complete={quote['complete']}, recommendation={analysis['recommendation']}")

    OUT.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
