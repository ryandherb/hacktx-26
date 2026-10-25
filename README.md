# Next Move: Keep, Repair, or Trade?

HackTX 26 project. A Toyota customer with an older car has a new repair need. Next Move
helps them decide whether to repair it and keep driving, or trade it in for a newer
Toyota, based on the repair cost, what the car is worth, and what they can actually afford.

- **Toyota:** synthetic customer profiles (vehicle, mileage, loan, service history, open issue)
- **Capital One Nessie:** mock accounts, deposits, and purchases -> affordability; writes a "Car Fund" savings account
- **Market data:** used-car value, new/CPO Toyota prices, and local shops come from fixtures (`app/fixtures/market.json`)
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
   year, with nearby shops from fixtures. If the issue can't be
   classified with confidence, or the customer already has a shop quote, the UI asks for
   **manual input**. Output: `repair_cost_low`, `repair_cost_high`, `source`
   (`table` | `manual`).
   - The lookup table is the source of truth for the estimate.

3. **Personal Finance Onboarding (PFO) Agent: front layer of KRT.** A short, bounded
   conversation (about 4–6 questions) covering things Nessie can't show: how long they want
   to keep the car, upcoming large expenses, how much they could put down, rough credit band
   (sets the APR assumption), and how much they rely on the car. The LLM maps each answer
   onto a **fixed schema** of numeric/enum factors via `llm.extract()`. With
   `LLM_PROVIDER=none` the same questions render as a plain form.
   - Conversation state lives in the client. Each turn sends the full transcript, so the
     backend stays stateless.

4. **KRT Engine: back layer.** Deterministic Python in `apps/api/app/engine/`. It combines:
   - repair cost (step 2) and current vehicle value / trade-in (market fixtures)
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
      clients/      Nessie, LLM wrappers
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
| POST | `/pre-quote-survey` | exists | fills repair, model, year, location from the profile; asks for what's missing |
| POST | `/quote` | exists | Cost Agent: classify the issue and return a repair estimate + car value, or `needs_manual: true` |
| POST | `/onboarding` | exists | PFO Agent: one question per turn (or all answers at once), returns `PFOFactors` |
| POST | `/analyze` | exists | KRT engine + Explanation Agent: recommendation, monthly costs, suggested Toyotas, explanation |
| POST | `/car-fund` | exists | creates a Nessie "Car Fund" savings account |

`/analyze` takes the complete `/quote` result as `quote` and the `/onboarding` factors as
`pfo_factors`, calls `build_handoff()`, and passes `repair_cost`, `car_value` (trade-in), and
`pfo_factors` to `krt.score()`. Without a `quote` it prices the profile's `open_issue` with the
same Cost Agent; without `pfo_factors` it uses the defaults. Feature notes: `docs/cost-agent.md`,
`docs/pre-quote-survey.md`.

The frontend calls these in order. When no backend is reachable (the Vercel demo), it falls back
to `apps/web/lib/demo/offline-snapshot.json`, a saved run of the real backend. Regenerate it after
engine or template changes: `cd apps/api && .venv/bin/python -m scripts.export_demo_snapshot`.

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

1. Add keys to `apps/api/.env` (`NESSIE_API_KEY`, `LLM_PROVIDER`,
   `LLM_API_KEY`, `LLM_MODEL`).
2. Seed Nessie: `python -m app.seeds.nessie_seed`. It prints one Nessie customer ID per
   profile. Paste these into `apps/api/app/seeds/toyota_profiles.json` as `nessie_customer_id`.
   - The seed script only creates customers and accounts so far. Deposits and purchases
     still need to be seeded from `fixtures/nessie.json`. Until they are, live affordability
     will be empty.
3. Set `USE_FIXTURES=false`. Profiles without a `nessie_customer_id` keep using fixtures.

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
| LLM | `apps/api/app/clients/llm.py` | template fallback; wire a provider in `_complete` |
| Dashboard | `apps/web/app/page.tsx` | persona picker + cost chart; needs quote, PFO, and score screens |

## Notes

- All customer data is synthetic. Prices and recommendations are estimates, not financial advice.
- Keep the math deterministic in `engine/`. The LLM extracts and explains. It never computes
  the repair cost, the score, or the recommendation.
- All hackathon code must be written during the hacking period.
