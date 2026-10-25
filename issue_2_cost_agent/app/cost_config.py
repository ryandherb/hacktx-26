"""Cost Agent settings, read from issue_2_cost_agent/cost_agent.env (gitignored by *.env).

At integration these fields move into app/config.py and the lines into apps/api/.env.

Variable names match the shared apps/api/.env (LLM_PROVIDER, LLM_API_KEY, LLM_MODEL) so the
lines can be copied over unchanged at integration. Process environment variables win.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[1]  # issue_2_cost_agent/ (apps/api/ after unpacking)
ENV_FILE = ROOT_DIR / "cost_agent.env"
SHARED_ENV_FILE = ROOT_DIR.parent / "apps" / "api" / ".env"  # shared backend settings
LLM_PROVIDERS = {"meta", "muse"}


class CostAgentSettings(BaseSettings):
    # Later files win, so cost_agent.env can still override the shared apps/api/.env.
    model_config = SettingsConfigDict(env_file=(SHARED_ENV_FILE, ENV_FILE), extra="ignore")

    llm_provider: str = "none"
    llm_api_key: str = ""
    llm_model: str = "muse-spark-1.3"
    llm_base_url: str = "https://api.meta.ai/v1"
    llm_timeout_seconds: float = 15.0
    # Muse Spark reasons before answering and those tokens count against max_tokens.
    # "minimal" keeps classify/extract calls at about 50-70 output tokens.
    llm_reasoning_effort: str = "minimal"
    llm_max_tokens: int = 1000
    llm_cache_path: str = str(ROOT_DIR / "cost_llm_cache.sqlite3")

    @field_validator("llm_model", "llm_base_url", mode="before")
    @classmethod
    def _blank_uses_default(cls, value, info):
        # The shared .env.example ships "LLM_MODEL=" empty; don't let that erase the default.
        if isinstance(value, str) and not value.strip():
            return cls.model_fields[info.field_name].default
        return value

    @property
    def llm_enabled(self) -> bool:
        return self.llm_provider.strip().lower() in LLM_PROVIDERS and bool(self.llm_api_key.strip())


@lru_cache
def get_cost_settings() -> CostAgentSettings:
    return CostAgentSettings()
