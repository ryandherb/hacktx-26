from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    use_fixtures: bool = True

    nessie_api_key: str = ""
    nessie_base_url: str = "http://api.nessieisreal.com"

    serpapi_api_key: str = ""

    # LLM (OpenAI-compatible chat completions). LLM_PROVIDER=none uses templates only.
    # LLM_BASE_URL overrides the provider's default URL (see app/clients/llm.py).
    llm_provider: str = "none"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_base_url: str = ""
    llm_timeout_seconds: float = 20.0

    database_url: str = "sqlite:///./cache.sqlite3"
    web_origin: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
