# CLAUDE.md

Guidance for Claude Code in this repo. See `README.md` for the full product flow.

## Project

Next Move (HackTX 26): a Toyota customer with a repair need on an older car gets a
Keep/Repair/Trade (KRT) recommendation. Pipeline:

Cost Agent (repair quote or manual input) -> PFO Agent (finance Q&A -> structured factors)
-> KRT Engine (deterministic score 0–100 + factors) -> Explanation Agent (plain language)
-> UI (score, recommendation, cost curve, suggested Toyota models, optional Nessie Car Fund).

## Layout

- `apps/api/` FastAPI backend (Python 3, Pydantic v2, httpx)
  - `app/routes.py` endpoints; `app/main.py` app + CORS
  - `app/engine/` deterministic math: `krt.py`, `simulate.py`, `affordability.py`, `insurance.py`,
    `replacement.py`, `valuation.py`, `repair_costs.py` + `cost_tables.py`, `vehicle_value.py`
  - `app/pre_quote_*.py` survey (#1); `app/cost_agent.py`, `repair_classifier.py`, `pfo_agent.py`,
    `cost_routes.py` Cost + PFO Agents (#2)
  - `app/clients/` external wrappers: `nessie.py`, `llm.py` (the one
    LLM client), `muse.py` (cached JSON classify/extract on top of `llm._complete`)
  - `scripts/` `export_demo_snapshot.py` (frontend offline data), `llm_smoke_check.py` (live key check)
  - `app/models/schemas.py` all request/response models
  - `app/seeds/toyota_profiles.json` synthetic profiles; `app/fixtures/*.json` offline data keyed by profile id
  - `app/config.py` settings from `apps/api/.env`
- `apps/web/` Next.js 15 App Router, React 19, TypeScript, Tailwind, Recharts
  - `app/page.tsx` dashboard; `lib/api.ts` typed API client; `components/` UI pieces

## Commands

```bash
# backend (from apps/api, venv at apps/api/.venv)
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
pytest

# frontend (from apps/web)
npm run dev
npm run build
npm run lint
```

## Rules

- **The LLM never computes numbers.** Repair cost, KRT score, affordability, and the
  recommendation come from deterministic code in `app/engine/`. The LLM only classifies or
  extracts free text into fixed schemas (`llm.extract`) and explains results it was given
  (`llm.explain`).
- **Fixtures first.** Everything must work with `USE_FIXTURES=true` and `LLM_PROVIDER=none`
  (no keys, no network). Every LLM call needs a deterministic fallback (template or form).
  Every live client path must also have a fixture path.
- **Keep schemas in sync.** When you change a Pydantic model in `schemas.py`, update the
  matching TypeScript type in `apps/web/lib/api.ts`.
- Keep the `simulate.run()` signature stable unless you update `routes.py` and its callers.
- Backend stays stateless. PFO conversation state lives in the client and is sent each turn.
- Nessie endpoints and field names should be verified against http://api.nessieisreal.com
  docs before relying on live mode.
- All data is synthetic. Show the "estimates, not financial advice" disclaimer wherever
  recommendations appear.
- Add or update tests in `apps/api/tests/` for engine and route changes. Tests run on fixtures.

## Recommendation values

`keep` | `trade` | `refinance`, chosen by `simulate.set_recommendation()` from the monthly
costs in `KRTResult` (lowest affordable cost; keep wins ties). Exception, the "50% rule":
trade wins when the repair is at least 50% of the car's value, the car has 30% or less of its
life left, and a replacement is affordable. Keep `schemas.py`, `lib/api.ts`, and
the assertion in `tests/test_api.py` in sync if this changes.

## Hackathon

All code must be written during the HackTX hacking period. Prefer simple, demo-reliable
solutions over completeness.
