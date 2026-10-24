"""Tiny SQLite cache so live API results are reusable and demos never depend on the network."""

import json
import sqlite3

from app.config import get_settings


def _conn() -> sqlite3.Connection:
    path = get_settings().database_url.replace("sqlite:///", "")
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    return conn


def cache_get(key: str):
    with _conn() as conn:
        row = conn.execute("SELECT value FROM cache WHERE key = ?", (key,)).fetchone()
    return json.loads(row[0]) if row else None


def cache_set(key: str, value) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO cache (key, value) VALUES (?, ?)",
            (key, json.dumps(value)),
        )
