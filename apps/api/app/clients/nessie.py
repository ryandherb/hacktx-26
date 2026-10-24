"""Capital One Nessie client.

Docs: http://api.nessieisreal.com  (verify endpoints and field names against the docs
before relying on live mode; fixtures mode needs nothing).
"""

import httpx

from app.config import get_settings
from app.models.schemas import CarFundRequest, CarFundResult, Profile
from app.seeds.loader import load_fixture


def _get(path: str):
    s = get_settings()
    r = httpx.get(
        f"{s.nessie_base_url}{path}", params={"key": s.nessie_api_key}, timeout=15
    )
    r.raise_for_status()
    return r.json()


def _post(path: str, body: dict):
    s = get_settings()
    r = httpx.post(
        f"{s.nessie_base_url}{path}",
        params={"key": s.nessie_api_key},
        json=body,
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def get_snapshot(profile: Profile) -> dict:
    """Return {accounts, deposits, purchases} for a profile.

    Fixtures mode reads app/fixtures/nessie.json. Live mode reads from Nessie using
    profile.nessie_customer_id (set by app.seeds.nessie_seed).
    """
    if get_settings().use_fixtures or not profile.nessie_customer_id:
        return load_fixture("nessie")[profile.id]

    accounts = _get(f"/customers/{profile.nessie_customer_id}/accounts")
    deposits, purchases = [], []
    for acc in accounts:
        deposits += _get(f"/accounts/{acc['_id']}/deposits")
        purchases += _get(f"/accounts/{acc['_id']}/purchases")
    return {"accounts": accounts, "deposits": deposits, "purchases": purchases}


def create_car_fund(profile: Profile, req: CarFundRequest) -> CarFundResult:
    """Create a 'Car Fund' savings account and a scheduled transfer (write path)."""
    if get_settings().use_fixtures or not profile.nessie_customer_id:
        return CarFundResult(
            account_id=f"sim-carfund-{profile.id}",
            monthly_amount=req.monthly_amount,
            target_amount=req.target_amount,
            simulated=True,
        )

    account = _post(
        f"/customers/{profile.nessie_customer_id}/accounts",
        {
            "type": "Savings",
            "nickname": "Car Fund",
            "rewards": 0,
            "balance": 0,
        },
    )
    # TODO: create a transfer from checking -> car fund (POST /accounts/{id}/transfers)
    account_id = account.get("objectCreated", {}).get("_id", "unknown")
    return CarFundResult(
        account_id=account_id,
        monthly_amount=req.monthly_amount,
        target_amount=req.target_amount,
        simulated=False,
    )
