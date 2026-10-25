# Next Move: Keep, Repair, or Trade?

HackTX 26 project. A Toyota customer with an older car has a new repair need. Next Move
helps them decide whether to repair it and keep driving, or trade it in for a newer
Toyota, based on the repair cost, what the car is worth, and what they can actually afford.

- **Toyota:** synthetic customer profiles (vehicle, mileage, loan, service history, open issue)
- **Capital One Nessie:** mock accounts, deposits, and purchases -> affordability; writes a "Car Fund" savings account
- **SerpApi:** used-car comps (trade-in value), new/CPO Toyota prices, local repair shops
- **LLM:** turns free-text input into structured fields and writes the plain-language explanation. It never computes numbers.
- **Optional:** Snowflake as the warehouse for service history and simulation runs

## Flow

```
repair issue ──> 1. Cost Agent ──> 2. PFO Agent ──> 3. KRT Engine ──> 4. Explanation Agent ──> UI
                 (quote or         (finance Q&A ->   (deterministic     (plain-language
                  manual input)     structured        score + factors)   summary + Toyota picks)
                                    factors)
```

1. **Intake.** The customer picks a profile (synthetic Toyota customer) and describes the
   repair issue (pre-filled from `open_issue`).

2. **Cost Agent: quote the repair.** The LLM classifies the issue into a known repair
   category (e.g. `transmission`, `ac_compressor`, `o2_sensor`, `brakes`). Known categories
   are priced from a lookup table of typical parts + labor ranges, adjusted for model and
   year, with SerpApi (`google_maps`) supplying nearby shops. If the issue can't be
   classified with confidence, or the customer already has a shop quote, the UI asks for
   **manual input**. Output: `repair_cost_low`, `repair_cost_high`, `source`
   (`table` | `manual`).
   - SerpApi returns shop listings, not prices, so the table is the source of truth for the
     estimate. Scraped prices from search snippets are too noisy to rely on.

3. **Personal Finance Onboarding (PFO) Agent: front layer of KRT.** A short, bounded
   conversation (about 4–6 questions) covering things Nessie can't show: how long they want
   to keep the car, upcoming large expenses, how much they could put down, rough credit band
   (sets the APR assumption), and how much they rely on the car. The LLM maps each answer
   onto a **fixed schema** of numeric/enum factors via `llm.extract()`. With
   `LLM_PROVIDER=none` the same questions render as a plain form.
   - Conversation state lives in the client. Each turn sends the full transcript, so the
     backend stays stateless.

4. **KRT Engine: back layer.** Deterministic Python in `apps/api/app/engine/`. It combines:
   - repair cost (step 2) and current vehicle value / trade-in (SerpApi comps)
   - PFO factors (step 3)
   - Nessie affordability: monthly income (from deposits), spend (from purchases), savings
     balance, monthly surplus, runway months, max comfortable payment
   - a keep-vs-trade cost curve over the horizon (repair + projected maintenance vs. down
     payment + loan payments)

   It outputs a **KRT score** (0–100, low = repair, high = trade), the recommendation, and the
   weighted factors behind it, so the result is explainable and reproducible.

5. **Explanation Agent.** The LLM gets the score, the factors, and the recommendation, and
   writes a short plain-language summary. It only restates numbers it was given. A
   deterministic template is used when no LLM is configured.

6. **Results.** The UI shows the score, the recommendation, the top factors, the cost curve,
   and 2–3 **suggested Toyota models** (new/CPO/used from the market data), filtered to
   those whose estimated monthly payment fits `max_comfortable_payment`. If the
   recommendation is to repair now and trade later, the user can open a **Car Fund** in Nessie.

### Recommendations

| Value | Meaning |
|---|---|
| `keep` | Repair it and keep the car; it's the cheapest option per month |
| `trade` | Trade in now; it's cheapest per month and the payment is affordable |
| `refinance` | Keep the car and refinance the loan to lower the monthly cost |

`krt.recommend()` picks the option with the lowest monthly cost from `krt.score()`, only
allowing `trade` when the customer can afford a payment. Ties go to `keep`.

## Layout

```
apps/
  api/   FastAPI backend (Python)
    app/
      routes.py     HTTP endpoints
      engine/       deterministic math (affordability, valuation, simulation, KRT)
      clients/      Nessie, SerpApi, LLM wrappers
      models/       Pydantic schemas
      seeds/        synthetic Toyota profiles + Nessie seeding
      fixtures/     offline Nessie + market data per profile
  web/   Next.js dashboard (TypeScript, Tailwind, Recharts)
```

## API

| Method | Path | Status | Purpose |
|---|---|---|---|
| GET | `/health` | exists | liveness |
| GET | `/profiles` | exists | synthetic Toyota customers |
| GET | `/market/{profile_id}` | exists | vehicle value, replacement options, repair shops |
| POST | `/analyze` | exists | runs the full pipeline and returns curve, recommendation, affordability, explanation |
| POST | `/car-fund` | exists | creates a Nessie "Car Fund" savings account |
| POST | `/quote` | planned | Cost Agent: classify the issue and return a repair estimate, or `needs_manual: true` |
| POST | `/onboarding` | planned | PFO Agent: takes the transcript, returns the next question or the final factors |

`/analyze` will accept `repair_cost` and `pfo_factors` in the request body once those
steps exist.

## Quick start

Everything runs on fixtures with no API keys (`USE_FIXTURES=true`, `LLM_PROVIDER=none`).

```bash
cp .env.example apps/api/.env

# backend
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# frontend (new terminal)
cd apps/web
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. API docs at http://localhost:8000/docs.

Tests: `cd apps/api && pytest`.

## Going live

1. Add keys to `apps/api/.env` (`NESSIE_API_KEY`, `SERPAPI_API_KEY`, `LLM_PROVIDER`,
   `LLM_API_KEY`, `LLM_MODEL`).
2. Seed Nessie: `python -m app.seeds.nessie_seed`. It prints one Nessie customer ID per
   profile. Paste these into `apps/api/app/seeds/toyota_profiles.json` as `nessie_customer_id`.
   - The seed script only creates customers and accounts so far. Deposits and purchases
     still need to be seeded from `fixtures/nessie.json`. Until they are, live affordability
     will be empty.
3. Set `USE_FIXTURES=false`. Profiles without a `nessie_customer_id` keep using fixtures.

SerpApi responses are cached in SQLite (`cache.sqlite3`), so repeated demo runs don't use up
search credits.

## Where to start

| Area | File | State |
|---|---|---|
| Cost Agent | `apps/api/app/engine/repair_costs.py` | to create: category table + lookup |
| PFO Agent | `apps/api/app/clients/llm.py` (`extract`) + new `/onboarding` route | to create |
| KRT score | `apps/api/app/engine/krt.py` | to create: weighted factors -> 0–100 score |
| Simulation | `apps/api/app/engine/simulate.py` | placeholder math, replace (real loan amortization) |
| Affordability | `apps/api/app/engine/affordability.py` | placeholder rules |
| Valuation | `apps/api/app/engine/valuation.py` | placeholder |
| Nessie | `apps/api/app/clients/nessie.py` | reads + car-fund write; transfer is TODO; verify endpoints against docs |
| SerpApi | `apps/api/app/clients/serpapi.py` | search wrapper + cache; live `get_market_data` not implemented |
| LLM | `apps/api/app/clients/llm.py` | template fallback; wire a provider in `_complete` |
| Dashboard | `apps/web/app/page.tsx` | persona picker + cost chart; needs quote, PFO, and score screens |

## Notes

- All customer data is synthetic. Prices and recommendations are estimates, not financial advice.
- Keep the math deterministic in `engine/`. The LLM extracts and explains. It never computes
  the repair cost, the score, or the recommendation.
- All hackathon code must be written during the hacking period.
