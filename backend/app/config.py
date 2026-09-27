from datetime import date
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # Hindsight
    hindsight_base_url: str = "https://api.hindsight.vectorize.io"
    hindsight_api_key: str = ""
    hindsight_bank_id: str = "precedent-ap"
    hindsight_timeout: float = 120.0

    # LLM providers (OpenAI-compatible endpoints)
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-flash-lite"
    gemini_vision_model: str = "gemini-3.1-flash-lite"
    nvidia_api_key: str = ""
    nvidia_model: str = "nvidia/nemotron-3-super-120b-a12b"
    llm_order: str = "groq,gemini,nvidia"

    # Web push
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:ap@example.com"

    # App
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'precedent.db').as_posix()}"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"
    seed: int = 20260302
    sim_start: date = date(2026, 3, 2)
    sim_days: int = 182
    approval_threshold: float = 500_000.0
    autonomy_required_streak: int = 3
    autonomy_min_confidence: float = 0.75

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
