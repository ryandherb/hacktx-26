"""Tests run on fixtures with no network (CLAUDE.md), even when apps/api/.env has a live LLM key.

Environment variables beat .env files in app.config (the one settings object every agent uses),
and this runs before it is first built. Tests that need an LLM configured (test_llm.py,
test_cost_agent.py) still patch settings themselves.
"""

import os

os.environ["LLM_PROVIDER"] = "none"
os.environ["LLM_API_KEY"] = ""
