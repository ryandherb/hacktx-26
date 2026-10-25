"""Meta Muse (Meta Model API) wrapper for classification and extraction only.

The LLM never produces prices, values, or scores. Callers validate every reply against a
closed schema and fall back to deterministic rules when this returns None (no key, network
error, timeout, or unparseable reply). Successful replies are cached in SQLite so repeated
demo runs spend no credits.
"""

import hashlib
import json
import logging
import sqlite3

import httpx

from .. import cost_config

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


def _message_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):  # some providers return content parts
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""


def parse_json_object(text: str) -> dict:
    """Pull the first JSON object out of a reply, tolerating code fences or stray prose."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("No JSON object in LLM reply")
    data = json.loads(text[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("LLM reply is not a JSON object")
    return data


def chat(system: str, user: str) -> tuple[str, dict]:
    """One uncached chat completion. Returns (reply text, usage). Raises on any failure."""
    s = cost_config.get_cost_settings()
    response = httpx.post(
        f"{s.llm_base_url.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {s.llm_api_key.strip()}"},
        json={
            "model": s.llm_model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0,
            "max_tokens": s.llm_max_tokens,
            "reasoning_effort": s.llm_reasoning_effort,
        },
        timeout=s.llm_timeout_seconds,
    )
    response.raise_for_status()
    body = response.json()
    return _message_text(body["choices"][0]["message"]["content"]), body.get("usage") or {}


def complete_json(system: str, user: str) -> dict | None:
    """Cached JSON completion, or None when the LLM is disabled or the call fails."""
    s = cost_config.get_cost_settings()
    if not s.llm_enabled:
        return None
    key = hashlib.sha256(json.dumps([s.llm_model, system, user]).encode()).hexdigest()
    try:
        cached = _cache_get(s.llm_cache_path, key)
    except sqlite3.Error:
        cached = None
    if cached is not None:
        return cached
    try:
        text, usage = chat(system, user)
        data = parse_json_object(text)
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        logger.warning("Muse call failed, using deterministic fallback: %s", exc)
        return None
    logger.info("Muse usage: %s", usage)
    try:
        _cache_set(s.llm_cache_path, key, data)
    except sqlite3.Error as exc:
        logger.warning("Could not cache Muse reply: %s", exc)
    return data
