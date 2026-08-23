from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.agent.prompts import finance_qa_prompt
from app.llm.schemas import QAResponse

logger = logging.getLogger(__name__)


@dataclass
class FinanceQATool:
    def answer(self, question: str, history: str = "") -> QAResponse:
        prompt_template = finance_qa_prompt()
        prompt_text = prompt_template.format(question=question, history=history) if hasattr(prompt_template, "format") else str(prompt_template)
        answer = self._generate_answer(prompt_template, prompt_text, question)
        confidence = "high" if len(question.split()) <= 10 else "medium"
        return QAResponse(answer=answer, cited_record_ids=[], confidence=confidence)

    def _generate_answer(self, prompt_template: Any, prompt_text: str, question: str) -> str:
        try:
            from app.config import get_settings
            from google import genai

            settings = get_settings()
            if settings.gemini_api_key:
                try:
                    from langchain_core.output_parsers import StrOutputParser
                    from langchain_core.prompts import PromptTemplate
                    from langchain_google_genai import ChatGoogleGenerativeAI

                    template_source = getattr(prompt_template, "template", None) or str(prompt_template)
                    chain = (
                        PromptTemplate.from_template(template_source)
                        | ChatGoogleGenerativeAI(
                            model=settings.llm_model,
                            google_api_key=settings.gemini_api_key,
                            temperature=0.2,
                        )
                        | StrOutputParser()
                    )
                    text = chain.invoke({"question": question, "history": ""})
                    if isinstance(text, str) and text.strip():
                        return text.strip()
                except Exception as exc:
                    logger.warning("LangChain Gemini finance QA failed, trying raw client: %s", exc)

                try:
                    client = genai.Client(api_key=settings.gemini_api_key)
                    response = client.models.generate_content(model=settings.llm_model, contents=prompt_text)
                    text = getattr(response, "text", "") or ""
                    if text.strip():
                        return text.strip()
                except Exception as exc:
                    logger.warning("Raw Gemini finance QA failed, using offline fallback: %s", exc)
        except Exception as exc:
            logger.warning("Finance QA Gemini setup failed, using offline fallback: %s", exc)

        return self._offline_answer(question)

    def _offline_answer(self, question: str) -> str:
        lowered = question.lower().strip()

        if "finance" in lowered and "definition" in lowered:
            return self._format_structured_answer(
                concept="Finance",
                definition="Finance is the management of money, assets, liabilities, and cash flows.",
                details=[
                    "It includes budgeting, investing, borrowing, reporting, and risk management.",
                    "Good finance decisions balance liquidity, growth, and risk.",
                ],
                example="Example: a company may borrow to expand, then track whether the return on that investment exceeds the borrowing cost.",
                takeaway="Finance is about deciding how to raise, use, and protect money over time.",
            )

        if any(term in lowered for term in ["cash flow", "cashflow", "cashflows", "cash flow statement"]):
            return self._format_structured_answer(
                concept="Cash flow",
                definition="Cash flow is the movement of money in and out of a business.",
                details=[
                    "Operating cash flow comes from core business activity like collecting customer payments and paying suppliers.",
                    "Investing cash flow comes from buying or selling assets such as equipment or investments.",
                    "Financing cash flow comes from loans, repayments, dividends, and capital contributions.",
                    "Positive operating cash flow usually means the business is generating enough cash from its day-to-day work.",
                ],
                example="Example: if invoices are profitable but customers pay late, profit can look strong while cash flow stays tight.",
                takeaway="Cash flow shows liquidity. Profit is not the same thing as cash in the bank.",
            )

        if any(term in lowered for term in ["reconcil", "reconcile", "reconciliation"]):
            return self._format_structured_answer(
                concept="Reconciliation",
                definition="Reconciliation is the process of matching records from different sources so they agree.",
                details=[
                    "A common example is comparing a bank statement with the general ledger.",
                    "Differences can come from timing gaps, missing entries, duplicates, or data errors.",
                    "The goal is to explain every mismatch and clear valid exceptions.",
                ],
                example="Example: a bank deposit appears one day later in the ledger because the settlement was delayed.",
                takeaway="Reconciliation helps confirm that financial records are accurate and complete.",
            )

        if "working capital" in lowered:
            return self._format_structured_answer(
                concept="Working capital",
                definition="Working capital is current assets minus current liabilities.",
                details=[
                    "It measures short-term liquidity and the ability to meet near-term obligations.",
                    "Positive working capital usually means the business can pay its bills on time.",
                    "Very high working capital can also mean cash is sitting idle instead of being used efficiently.",
                ],
                example="Example: if current assets are 500,000 and current liabilities are 320,000, working capital is 180,000.",
                takeaway="Working capital tells you how much short-term financial cushion the business has.",
            )

        if any(term in lowered for term in ["apr", "interest rate", "interest"]):
            return self._format_structured_answer(
                concept="APR",
                definition="APR is the annual percentage rate.",
                details=[
                    "It combines the interest rate and many loan costs into a yearly percentage.",
                    "APR makes borrowing costs easier to compare across loans.",
                ],
                example="Example: two loans with the same interest rate can have different APRs if one has higher fees.",
                takeaway="APR is often more useful than the raw interest rate when comparing borrowing options.",
            )

        if any(term in lowered for term in ["asset", "liability", "equity"]):
            return self._format_structured_answer(
                concept="Assets, liabilities, and equity",
                definition="Assets are things a business owns, liabilities are obligations it owes, and equity is the residual value left for owners.",
                details=[
                    "Assets can be cash, inventory, equipment, or receivables.",
                    "Liabilities can include loans, taxes payable, and unpaid supplier bills.",
                    "Equity represents the owners' claim after liabilities are paid.",
                ],
                example="Example: if a company owns 1,000,000 in assets and owes 600,000 in liabilities, equity is 400,000.",
                takeaway="This is the core accounting equation: Assets = Liabilities + Equity.",
            )

        if any(term in lowered for term in ["profit", "margin", "revenue"]):
            return self._format_structured_answer(
                concept="Revenue, profit, and margin",
                definition="Revenue is the money earned from operations, profit is what remains after expenses, and margin shows how much of revenue turns into profit.",
                details=[
                    "Revenue is the top line.",
                    "Profit is the bottom line after costs and expenses.",
                    "Margin helps compare efficiency across businesses or time periods.",
                ],
                example="Example: if revenue is 100 and profit is 15, the profit margin is 15%.",
                takeaway="Revenue tells you how much came in; profit and margin tell you what was kept.",
            )

        if "ratio" in lowered:
            return self._format_structured_answer(
                concept="Financial ratio",
                definition="A financial ratio compares two figures to show performance, efficiency, liquidity, or risk.",
                details=[
                    "Examples include debt-to-equity, current ratio, and gross margin.",
                    "Ratios are most useful when compared with history, peers, or targets.",
                ],
                example="Example: current assets divided by current liabilities gives the current ratio.",
                takeaway="Ratios turn raw numbers into signals that are easier to interpret.",
            )

        if "invoice" in lowered:
            return self._format_structured_answer(
                concept="Invoice",
                definition="An invoice is a bill issued to a customer that requests payment for goods or services provided.",
                details=[
                    "It usually includes an invoice number, issue date, due date, line items, and total amount.",
                    "Invoices are recorded in accounts receivable until they are paid.",
                ],
                example="Example: a consulting firm sends an invoice after completing a project so the client can pay later.",
                takeaway="Invoices document what is owed, when it is due, and why the payment is being requested.",
            )

        if any(term in lowered for term in ["accounts payable", "ap "]):
            return self._format_structured_answer(
                concept="Accounts payable",
                definition="Accounts payable is the money a business owes to suppliers for goods or services already received.",
                details=[
                    "It is a current liability.",
                    "Managing AP well helps preserve cash while still paying on time.",
                ],
                example="Example: a vendor delivers office supplies today and the company pays the bill next month.",
                takeaway="Accounts payable tracks unpaid supplier obligations.",
            )

        if any(term in lowered for term in ["accounts receivable", "ar "]):
            return self._format_structured_answer(
                concept="Accounts receivable",
                definition="Accounts receivable is the money customers owe a business for invoices that have been issued but not yet paid.",
                details=[
                    "It is a current asset.",
                    "Collecting AR faster improves cash flow.",
                ],
                example="Example: a customer receives an invoice on August 1 and pays on August 20, so the amount is AR until payment arrives.",
                takeaway="Accounts receivable measures expected incoming cash from customers.",
            )

        return self._format_structured_answer(
            concept="General finance help",
            definition="I can explain common finance topics in a simple, structured way.",
            details=[
                "Examples include cash flow, working capital, reconciliation, assets and liabilities, revenue and profit, ratios, invoices, AP, and AR.",
                "Ask me a specific finance term or concept and I’ll answer directly.",
            ],
            example="Example: ask 'explain cash flow in detail' or 'what is working capital?'",
            takeaway="If you want, I can also format answers as definition, key points, example, and takeaway.",
        )

    @staticmethod
    def _format_structured_answer(concept: str, definition: str, details: list[str], example: str, takeaway: str) -> str:
        lines = [
            f"Concept: {concept}",
            f"Definition: {definition}",
            "Key points:",
            *[f"- {item}" for item in details],
            f"Example: {example}",
            f"Takeaway: {takeaway}",
            "Note: This is general finance guidance only, not legal, tax, or investment advice.",
        ]
        return "\n".join(lines)


def create_finance_qa_tool(tool: FinanceQATool | None = None):
    tool = tool or FinanceQATool()

    def _run(question: str, history: str = "") -> dict[str, Any]:
        response = tool.answer(question, history=history)
        return response.model_dump()

    return _run
