"""Seed Nessie with one customer + accounts per synthetic profile.

Usage (needs NESSIE_API_KEY in apps/api/.env):
    python -m app.seeds.nessie_seed

Prints the Nessie customer IDs. Paste them into toyota_profiles.json as
"nessie_customer_id" and set USE_FIXTURES=false.

TODO: also create deposits/purchases from app/fixtures/nessie.json so live data
matches the fixtures. Verify field names against the Nessie docs.
"""

import httpx

from app.config import get_settings
from app.seeds.loader import load_fixture, load_profiles


def main() -> None:
    s = get_settings()
    if not s.nessie_api_key:
        raise SystemExit("Set NESSIE_API_KEY in apps/api/.env first")
    params = {"key": s.nessie_api_key}
    fixtures = load_fixture("nessie")

    for p in load_profiles():
        first = p.name.split(" ")[0]
        cust = httpx.post(
            f"{s.nessie_base_url}/customers",
            params=params,
            json={
                "first_name": first,
                "last_name": "Demo",
                "address": {
                    "street_number": "1",
                    "street_name": "Demo St",
                    "city": "Austin",
                    "state": "TX",
                    "zip": p.zip_code,
                },
            },
            timeout=15,
        ).json()
        cust_id = cust["objectCreated"]["_id"]
        for acc in fixtures[p.id]["accounts"]:
            httpx.post(
                f"{s.nessie_base_url}/customers/{cust_id}/accounts",
                params=params,
                json={
                    "type": acc["type"],
                    "nickname": acc["nickname"],
                    "rewards": 0,
                    "balance": acc["balance"],
                },
                timeout=15,
            )
        print(f"{p.id}: {cust_id}")


if __name__ == "__main__":
    main()
