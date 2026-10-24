# Next Move: Keep, Repair, or Trade?

HackTX 26 project. A Toyota customer with an older car sees when it makes sense to
keep repairing it versus replacing it, and whether they can afford to.

- **Toyota:** synthetic customer profiles (vehicle, mileage, loan, service history)
- **Capital One Nessie:** accounts, deposits, purchases, bills -> affordability; writes a "Car Fund" account
- **SerpApi:** market comps, new/CPO prices, local repair quotes
- **LLM:** parses messy results and writes the plain-language explanation
- **Optional:** Snowflake as the warehouse for service history and simulation runs

## Layout

```
apps/
  api/   FastAPI backend (Python)
  web/   Next.js dashboard (TypeScript)
```

## Quick start

Everything runs on fixtures with no API keys (`USE_FIXTURES=true`).

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

## Going live

1. Add keys to `apps/api/.env` (`NESSIE_API_KEY`, `SERPAPI_API_KEY`, LLM key).
2. Set `USE_FIXTURES=false`.
3. Seed Nessie: `python -m app.seeds.nessie_seed`.

## Where to start

| Area | File | State |
|---|---|---|
| Simulation | `apps/api/app/engine/simulate.py` | placeholder math, replace |
| Affordability | `apps/api/app/engine/affordability.py` | placeholder rules |
| Valuation | `apps/api/app/engine/valuation.py` | placeholder |
| Nessie | `apps/api/app/clients/nessie.py` | reads + car-fund write, verify endpoints against docs |
| SerpApi | `apps/api/app/clients/serpapi.py` | search wrapper + cache, verify engines |
| LLM | `apps/api/app/clients/llm.py` | template fallback, wire a provider |
| Dashboard | `apps/web/app/page.tsx` | persona picker + cost chart |

## Notes

- All customer data is synthetic. Prices and recommendations are estimates, not financial advice.
- Keep the math deterministic in `engine/`. The LLM explains results and never computes them.
- All hackathon code must be written during the hacking period.
