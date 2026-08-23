from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_dashboard import router as dashboard_router
from app.api.routes_qa import router as qa_router
from app.api.routes_reconcile import router as reconcile_router
from app.api.routes_settlement import router as settlement_router
from app.config import get_settings
from app.db import init_db


settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reconcile_router)
app.include_router(settlement_router)
app.include_router(dashboard_router)
app.include_router(qa_router)
