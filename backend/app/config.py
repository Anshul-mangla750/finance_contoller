from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", REPO_ROOT / "backend" / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AI Finance Controller"
    gemini_api_key: str | None = Field(default=None, validation_alias=AliasChoices("GEMINI_API_KEY", "GOOGLE_API_KEY"))
    database_path: Path = Field(default_factory=lambda: REPO_ROOT / "backend" / "app.db")
    generated_dir: Path = Field(default_factory=lambda: REPO_ROOT / "backend" / "generated")
    input_dir: Path = Field(default_factory=lambda: REPO_ROOT / "input")
    seed: int = 20260822
    llm_model: str = "gemini-2.5-flash"
    llm_escalation_model: str = "gemini-2.5-pro"
    llm_confidence_threshold: float = 0.75
    embedding_model: str = "text-embedding-004"
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.database_path.as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
