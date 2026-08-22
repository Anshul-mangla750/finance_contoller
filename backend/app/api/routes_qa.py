from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.rag.qa_agent import QAAgent


router = APIRouter(prefix="/api/qa", tags=["qa"])
agent = QAAgent()


class AskRequest(BaseModel):
    question: str


@router.post("/ask")
def ask_agent(payload: AskRequest) -> dict:
    return agent.ask(payload.question).model_dump()

