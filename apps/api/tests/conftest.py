"""Tests run on fixtures with no network (CLAUDE.md), even when apps/api/.env has a live LLM key.

Environment variables beat .env files for both app.config and the Cost Agent's cost_config, and
this runs before either settings object is first built. Tests that need an LLM configured
(test_llm.py) still patch settings themselves.
"""

import os

os.environ["LLM_PROVIDER"] = "none"
os.environ["LLM_API_KEY"] = ""
