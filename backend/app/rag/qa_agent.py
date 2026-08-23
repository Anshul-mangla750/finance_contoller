from __future__ import annotations

from app.agent.finance_agent import FinanceAgent, create_default_finance_agent
from app.llm.schemas import QAResponse


class QAAgent:
    def __init__(self, agent: FinanceAgent | None = None):
        self.agent = agent or create_default_finance_agent()

    def ask(self, question: str) -> QAResponse:
        return self.agent.ask(question)

