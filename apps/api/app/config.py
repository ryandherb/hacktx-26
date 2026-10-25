from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    use_fixtures: bool = True

    nessie_api_key: str = ""
    nessie_base_url: str = "http://api.nessieisreal.com"

    # LLM (OpenAI-compatible chat completions). LLM_PROVIDER=none uses templates only.
    # LLM_BASE_URL overrides the provider's default URL (see app/clients/llm.py).
    llm_provider: str = "none"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_base_url: str = ""
    # Comma-separated models tried after LLM_MODEL on transient failures. Empty uses the
    # provider default from app/clients/llm.py (muse-spark-1.2 for muse/meta).
    llm_fallback_models: str = ""
    llm_timeout_seconds: float = 20.0

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
