# Issue #2: Cost Agent Backend

> **Integrated.** This feature now lives in the main backend: code under `apps/api/app/`, tests in
> `apps/api/tests/`, types in `apps/web/lib/api.ts`, LLM settings in `apps/api/.env` (shared client:
> `app/clients/llm.py`). Folder layouts, standalone servers, and "unpack" steps below are historical.

Implements [GitHub issue #2](https://github.com/ryandherb/hacktx-26/issues/2). It decides
whether a repair is quotable and estimates its cost at the high end, or accepts a manual shop
quote. It also estimates the car's value and runs the PFO (Personal Finance Onboarding)
questions. Everything lives in `issue_2_cost_agent/`. No shared API, frontend, root docs,
`.env.example`, or dependency files are modified.

It consumes issue #1's output (`PreQuoteInput`) and reuses its profile dependency
(`survey_profile_records`), so one integration override covers both features.

## Layout (mirrors the root README)

`app/` mirrors `apps/api/app/`, `web/` mirrors `apps/web/`, and `tests/` mirrors
`apps/api/tests/`. Every file name is unique against the shared tree and issue #1, and the
`__init__.py` files are empty like the shared ones. Unpacking only adds files.

```
issue_2_cost_agent/
  app/
    engine/cost_tables.py         synthetic catalog, symptoms, model/age/labor tables
    engine/repair_costs.py        deterministic repair range + location -> state (README's planned file)
    engine/vehicle_value.py       deterministic private-sale and trade-in value
    clients/muse.py               Meta Model API call + SQLite reply cache (classify/extract only)
    models/cost_schemas.py        request/response models + CostAgentHandoff for issue #3
    fixtures/cost_repair_shops.json  demo shops per profile
    repair_classifier.py          Cost Agent step 1: quotable? (Muse, keyword fallback)
    cost_agent.py                 /quote orchestration: classify -> estimate/manual -> value
    pfo_agent.py                  PFO Agent: 5 questions, rules first, then Muse, then retry
    cost_config.py                LLM settings from cost_agent.env
    cost_routes.py                mountable POST /quote and POST /onboarding router
  web/lib/cost_api.ts             TypeScript types for the frontend
  tests/test_cost_agent.py        offline tests (Muse paths use fakes)
  cost_api.py                     standalone review server: survey + cost agent (not unpacked)
  cost_muse_smoke_check.py        live Muse key check (not unpacked)
  cost_agent.env.example, cost_pytest.ini, cost_requirements.txt, COST_AGENT_README.md
```

Imports inside `app/` are relative. The two lines that import issue #1 are absolute and
marked `# UNPACK:` with their replacement.

## Rules followed (CLAUDE.md)

- **The LLM never computes numbers.** Muse only picks a repair category from a closed list
  and extracts PFO answers into fixed schemas. Prices, values, and unit conversion
  (years -> months) are deterministic code.
- **Fixtures first.** Everything works with `LLM_PROVIDER=none` and no network. Every Muse
  call has a deterministic fallback: a keyword classifier for repairs, and a rule parser plus
  a plain form for PFO.
- **Stateless.** The client sends the survey output, mileage, manual quote, and PFO answers every turn.
- **Synthetic data.** Every quote response carries the "not financial advice" disclaimer.

## Muse API key

Put the key in `issue_2_cost_agent/cost_agent.env`. Copy `cost_agent.env.example` if the
file is missing:

```
LLM_PROVIDER=meta
LLM_API_KEY=<your key>
LLM_MODEL=muse-spark-1.3
```

The root `*.env` rule ignores this file, so it is never committed. It stays out of
`apps/api/.env` until integration: the shared `app/clients/llm.py` raises whenever
`LLM_PROVIDER` is set, because no provider is wired there yet, and that would break
`/analyze`.

Muse Spark reasons before it answers, and those tokens count against `max_tokens`. The
client sends `reasoning_effort: "minimal"` (`LLM_REASONING_EFFORT`) with `max_tokens: 1000`.
Without that, a 400-token cap was used up entirely by reasoning and replies came back empty.
A classify call is about 400 input and 170 output tokens, roughly $0.001.

Live check. It costs a few cents the first time, then nothing, because replies are cached in
`cost_llm_cache.sqlite3`, which is gitignored:

```powershell
apps/api/.venv/Scripts/python.exe -m issue_2_cost_agent.cost_muse_smoke_check
```

## Run and test

From the repository root:

```powershell
apps/api/.venv/Scripts/python.exe -m pytest -q -c issue_2_cost_agent/cost_pytest.ini issue_2_cost_agent/tests
apps/api/.venv/Scripts/python.exe -m pytest -q -c apps/api/pytest.ini apps/api/tests issue_1_pre_quote_survey/tests issue_2_cost_agent/tests
apps/api/.venv/Scripts/python.exe -m uvicorn issue_2_cost_agent.cost_api:app --host 127.0.0.1 --port 8000
```

The tests never touch the network or spend credits. The standalone server exposes
`/pre-quote-survey`, `/quote`, and `/onboarding` at `http://127.0.0.1:8000/docs`.

## Flow

```
POST /pre-quote-survey  (issue #1, until complete)  -> quote_input
POST /quote             {profile_id?, quote_input, mileage?, manual_quote?}
   questions[] may ask for: manual_quote (not quotable) and/or mileage (no profile mileage)
   -> repair (table | manual), vehicle (private sale + trade-in), nearby_shops
POST /onboarding        {answers, reply?}  one question per turn, 6 total -> factors (PFOFactors)
build_handoff(quote, factors) -> CostAgentHandoff
krt.score(profile, afford=..., market=..., snapshot=..., **handoff.krt_arguments())   (issue #3)
```

### 1. Quotable? (`app/repair_classifier.py`)
Muse gets the repair text plus the catalog ids and returns `{category, confidence,
multiple_repairs}`. The repair is quotable only when Muse returns a catalog repair with
confidence >= 0.7. These return `needs_manual: true`:
- symptoms, such as "engine not starting", "electricity out", or a bare "check engine light"
- descriptions that name more than one repair
- text that matches nothing

If Muse's reply is bad or missing, keyword matching takes over. A named part beats a symptom
("check engine light, oxygen sensor" -> `o2_sensor`).

### 2. Repair cost (`app/engine/repair_costs.py`)
`range = base parts+labor x model multiplier x age multiplier x state labor multiplier`,
rounded to $10.
- `repair_cost_estimate` is the high end, per the issue.
- The state comes from a ZIP prefix, "City, ST", or a state name. Unknown locations use 1.0.
- A `manual_quote` always overrides the table (`source: "manual"`).

### 3. Vehicle value (`app/engine/vehicle_value.py`)
`private sale = MSRP x (1 - annual depreciation)^age x mileage adjustment`
- The mileage adjustment is +/-5% per 10k miles against 12k miles a year, clamped to 0.7-1.2. The value never drops below $500.
- Trade-in is 80% of private sale.
- Both come with +/-10% ranges, for issue #3's trade-in vs private-sale options.
- The rates are calibrated so the three demo profiles land inside the
  `apps/api/app/fixtures/market.json` value ranges.

### 4. PFO (`app/pfo_agent.py`)
The factors match issue #3's `PFOFactors` (`apps/api/app/models/schemas.py` on `main`) field
for field. There are six questions:

| Question (`answers` field) | Becomes in `PFOFactors` |
|---|---|
| `down_payment` ($) | `down_payment` |
| `credit_band` (excellent/good/fair/poor/unknown) | `apr` (5.5% / 7% / 11% / 16% / None, so krt falls back to its `CREDIT_CONFIDENCE_APR`) and `credit_confidence` (high/high/medium/low/low) |
| `other_debt_load` (none/light/heavy) | `other_debt_load` |
| `upcoming_major_expense` (yes/no) | `upcoming_major_expense` |
| `income_stability` (growing/steady/at_risk/unsure) | `income_outlook` + `job_stability` |
| `car_usage` (low/medium/high) | `car_usage` |

The survey doesn't ask about `windfall_expected` (False), `payment_risk_tolerance` (medium), or
`household_members` (1), so they keep the defaults shown. The mapping tables are in
`engine/cost_tables.py`; the LLM never picks an APR.
- Structured values go in `answers`. The frontend renders a plain form when `accepts_free_text` is false.
- Free text goes in `reply`. Rules parse it first ("$3,500", "3k", "720", "none", "yes"), and only text the rules can't parse goes to Muse.
- An invalid reply sets `retry: true` and repeats the question.

### 5. Handoff to KRT (`app/cost_agent.py::build_handoff`)
`krt.score()` takes `repair_cost`, `car_value`, and `pfo_factors` from the Cost Agent:
- `repair_cost` is `repair.repair_cost_estimate`, the high end.
- `car_value` is `vehicle.trade_in_estimate`, because KRT uses it for equity when the car is
  traded in. The private-sale estimate is still in `vehicle` if Ryan wants it.
- `pfo_factors` is the `PFOFactors` object itself (`krt.score()` reads its attributes).

`handoff.krt_arguments()` returns exactly those three keyword arguments. The route supplies
`profile`, `afford`, `market`, and `snapshot`.

## Unpack after all branches merge

1. Copy `app/*` into `apps/api/app/`, `web/*` into `apps/web/`, and `tests/*` into
   `apps/api/tests/`. Do the same for issue #1, which `/quote` depends on.
2. Apply the two `# UNPACK:` import edits in `app/models/cost_schemas.py` and
   `app/cost_routes.py`.
3. Mount the router in `apps/api/app/main.py`: `from app.cost_routes import router as cost_router`,
   then `app.include_router(cost_router)`.
4. In `tests/test_cost_agent.py`, replace `issue_2_cost_agent.app` and `issue_1_pre_quote_survey.app`
   with `app`, and both standalone app imports (`...cost_api`, `...pre_quote_api`) with `app.main`.
5. LLM: move `clients/muse.py`'s `chat()` into `app/clients/llm.py::_complete` so the
   Explanation Agent (#4) shares it. Move the `cost_config.py` fields into `app/config.py` and
   the `LLM_*` lines into `apps/api/.env`.
6. Schemas: fold `cost_schemas.py` into `models/schemas.py` and `web/lib/cost_api.ts` into
   `lib/api.ts` together when the team syncs schemas (CLAUDE.md rule).
7. Shops: `cost_agent.nearby_shops()` stays fixture-backed (no live shop search).
8. `/analyze` (#3) takes the quote and PFO results, calls `build_handoff()`, and passes
   `**handoff.krt_arguments()` to `krt.score()`. Then retire `valuation.estimated_repair_cost`.
   Swap `cost_schemas.PFOFactors` for the shared `app.models.schemas.PFOFactors`. Both have the
   same fields, and `test_matches_ryans_pfo_schema_once_merged` checks that.
9. Run `pytest` from `apps/api`.

Steps 1-4 were rehearsed on a scratch copy of the repo: no files collided, and all 118 tests
(shared backend, issue #1, and issue #2) passed from `apps/api`.
