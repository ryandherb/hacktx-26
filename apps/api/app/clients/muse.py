"""Cached JSON completions for the Cost Agent and PFO Agent (classification and extraction only).

The request itself goes through the shared client, `app.clients.llm._complete`, so every agent
uses the same provider settings. The LLM never produces prices, values, or scores. Callers
validate every reply against a closed schema and fall back to deterministic rules when this
returns None (no key, network error, timeout, or unparseable reply). Successful replies are
cached in SQLite so repeated demo runs spend no credits.
"""

import hashlib
import json
import logging
import sqlite3

from . import llm

logger = logging.getLogger(__name__)


def _cache_conn(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE IF NOT EXISTS llm_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    return conn


def _cache_get(path: str, key: str) -> dict | None:
    with _cache_conn(path) as conn:
        row = conn.execute("SELECT value FROM llm_cache WHERE key = ?", (key,)).fetchone()
    return json.loads(row[0]) if row else None


def _cache_set(path: str, key: str, value: dict) -> None:
    with _cache_conn(path) as conn:
        conn.execute("INSERT OR REPLACE INTO llm_cache (key, value) VALUES (?, ?)", (key, json.dumps(value)))


def parse_json_object(text: str) -> dict:
    """Pull the first JSON object out of a reply, tolerating code fences or stray prose."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("No JSON object in LLM reply")
    data = json.loads(text[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("LLM reply is not a JSON object")
    return data


def complete_json(system: str, user: str) -> dict | None:
    """Cached JSON completion, or None when the LLM is disabled or the call fails."""
    if not llm.llm_configured():
        return None
    s = llm.get_settings()
    model = s.llm_model.strip() or llm.DEFAULT_MODELS.get(s.llm_provider.strip().lower(), "")
    key = hashlib.sha256(json.dumps([model, system, user]).encode()).hexdigest()
    try:
        cached = _cache_get(s.llm_cache_path, key)
    except sqlite3.Error:
        cached = None
    if cached is not None:
        return cached
    try:
        data = parse_json_object(llm._complete(user, system=system, temperature=0))
    except (llm.LLMError, ValueError) as exc:
        logger.warning("LLM call failed, using deterministic fallback: %s", exc)
        return None
    try:
        _cache_set(s.llm_cache_path, key, data)
    except sqlite3.Error as exc:
        logger.warning("Could not cache LLM reply: %s", exc)
    return data
