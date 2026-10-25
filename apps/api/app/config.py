from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    use_fixtures: bool = True

    nessie_api_key: str = ""
    nessie_base_url: str = "http://api.nessieisreal.com"

    # LLM (OpenAI-compatible chat completions), shared by the Cost Agent, PFO Agent, and
    # Explanation Agent. LLM_PROVIDER=none uses deterministic fallbacks only.
    # Empty model / base URL / reasoning effort use the provider's defaults in app/clients/llm.py
    # (for meta/muse: muse-spark-1.3, https://api.meta.ai/v1, reasoning effort "minimal").
    llm_provider: str = "none"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_base_url: str = ""
    # Comma-separated models tried after the main one on transient failures. Empty uses the
    # provider default in app/clients/llm.py (muse-spark-1.2, then 1.1, for meta/muse).
    llm_fallback_models: str = ""
    llm_timeout_seconds: float = 20.0
    # Muse Spark reasons before answering, and those tokens count against max_tokens.
    llm_reasoning_effort: str = ""
    llm_max_tokens: int = 1000
    # Cost/PFO classify and extract replies are cached here so demo reruns spend no credits.
    llm_cache_path: str = "llm_cache.sqlite3"

    database_url: str = "sqlite:///./cache.sqlite3"
    # CORS. WEB_ORIGIN is comma-separated (e.g. the Vercel prod URL + localhost);
    # WEB_ORIGIN_REGEX also admits matching origins such as Vercel preview deploys.
    web_origin: str = "http://localhost:3000"
    web_origin_regex: str = r"https://.*\.vercel\.app"

    @property
    def web_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.web_origin.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
