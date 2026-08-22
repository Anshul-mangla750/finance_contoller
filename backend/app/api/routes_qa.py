from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.rag.qa_agent import QAAgent


router = APIRouter(prefix="/api/qa", tags=["qa"])
agent = QAAgent()


class AskRequest(BaseModel):
    question: str


@router.post("/ask")
def ask_agent(payload: AskRequest) -> dict:
    """Ask a natural-language question about the reconciliation data."""
    if not payload.question.strip():
        raise HTTPException(status_code=422, detail="Question cannot be empty.")
    return agent.ask(payload.question).model_dump()
