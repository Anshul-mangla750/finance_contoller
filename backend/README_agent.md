# Finance Agent Upgrade

This project now exposes the chatbot through a lightweight LangChain-compatible finance agent layer.

## What it does

- `finance_qa_tool`: answers general finance questions
- `document_retriever_tool`: grounds answers in the existing local vector store
- `sql_query_tool`: performs read-only SQLite lookups over finance tables

## Wiring

- The frontend still calls `POST /api/qa/ask`
- `backend/app/api/routes_qa.py` still uses `QAAgent`
- `QAAgent` now delegates to `app.agent.finance_agent.FinanceAgent`

## Data sources

- Document retrieval uses the existing local vector index in `backend/generated/rag_index.json`
- SQLite lookups use the existing database at `backend/app.db`

## Environment

Set the Gemini key in `.env`:

```env
GOOGLE_API_KEY=your_key_here
```

The code also reads the existing `GEMINI_API_KEY` setting for compatibility with the current app.

## Adding a tool

1. Create a new callable in `backend/app/agent/tools/`
2. Return `app.llm.schemas.QAResponse`
3. Register it in `backend/app/agent/finance_agent.py`
4. Add a routing rule or extend the router prompt

## Notes

- The agent keeps a small conversation memory so follow-up questions have context.
- If Gemini is not available, the code falls back to deterministic local behavior.

