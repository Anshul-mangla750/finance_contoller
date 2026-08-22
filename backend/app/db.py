from __future__ import annotations

from pathlib import Path

from sqlmodel import SQLModel, Session, create_engine

from app.config import get_settings


settings = get_settings()
settings.database_path.parent.mkdir(parents=True, exist_ok=True)
engine = create_engine(settings.database_url, echo=False, connect_args={"check_same_thread": False})


def init_db() -> None:
    from app.models import schemas  # noqa: F401
    from sqlalchemy import inspect
    
    inspector = inspect(engine)
    if inspector.has_table("matchrecord"):
        columns = [c["name"] for c in inspector.get_columns("matchrecord")]
        if "evidence_json" not in columns:
            SQLModel.metadata.drop_all(engine)

    SQLModel.metadata.create_all(engine)


def get_session() -> Session:
    return Session(engine)
