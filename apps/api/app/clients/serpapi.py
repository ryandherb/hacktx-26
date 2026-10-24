"""SerpApi client with SQLite caching.

Docs: https://serpapi.com/search-api  (test queries in the SerpApi playground first;
result shapes differ per engine).
"""

import hashlib
import json

import httpx

from app.config import get_settings
from app.db import cache_get, cache_set
from app.models.schemas import MarketData, Profile
from app.seeds.loader import load_fixture

BASE = "https://serpapi.com/search.json"


def search(engine: str, **params) -> dict:
    """Cached SerpApi call. Raises if live mode is used without a key."""
    s = get_settings()
    key = hashlib.sha256(json.dumps([engine, params], sort_keys=True).encode()).hexdigest()
    cached = cache_get(key)
    if cached is not None:
        return cached
    if not s.serpapi_api_key:
        raise RuntimeError("SERPAPI_API_KEY not set (or set USE_FIXTURES=true)")
    r = httpx.get(
        BASE,
        params={"engine": engine, "api_key": s.serpapi_api_key, **params},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    cache_set(key, data)
    return data


def get_market_data(profile: Profile) -> MarketData:
    if get_settings().use_fixtures:
        return MarketData(**load_fixture("market")[profile.id])

    # TODO live mode, roughly:
    #   1. comps:       search("google", q=f"{profile.vehicle_year} Toyota {profile.vehicle_model} for sale near {profile.zip_code}")
    #   2. new/CPO:     search("google_shopping", q=f"Toyota {profile.vehicle_model}") or dealer pages
    #   3. repairs:     search("google_maps", q=f"{profile.open_issue} repair near {profile.zip_code}")
    #   4. parse messy results into the MarketData schema via app.clients.llm.extract(...)
    raise NotImplementedError("Live market data not implemented yet")
