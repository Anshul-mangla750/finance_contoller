# AI Finance Controller

AI Finance Controller is a full-stack reconciliation demo built around a deterministic synthetic dataset, layered matching, measured scoring, exception handling, and a grounded RAG assistant.

## What’s included

- FastAPI backend with SQLite persistence and SQLModel tables
- Synthetic data generator with hidden ground truth
- Layered reconciliation engine: exact, fuzzy, composite split-payment, and Gemini fallback
- Accuracy scorer with precision, recall, F1, calibration buckets, and reconciliation checksum
- Exception list with human-readable explanations and suggested actions
- RAG Q&A endpoint over records, matches, and exceptions
- React + TypeScript + Tailwind dashboard with Recharts calibration chart

## Backend

Install dependencies:

```bash
cd backend
python -m pip install -e .[dev]
```

Run the data generator only:

```bash
cd backend
python -c "from app.data_gen.generator import generate_and_save; generate_and_save()"
```

Run a full reconciliation batch:

```bash
cd backend
python -c "from app.services.reconciliation_service import run_full_reconciliation; run_full_reconciliation()"
```

Start the API:

```bash
cd backend
uvicorn app.main:app --reload
```

### Prompt-compliant settlement workflow

The project now also includes a three-file settlement reconciliation flow that matches the build prompt more closely:

- `settlement_report.csv`
- `bank_statement.csv`
- `order_ledger.csv`
- optional `ground_truth.csv`

Generate the synthetic demo batch:

```bash
cd backend
reconcile --generate-sample
```

Run reconciliation on any three files in any order:

```bash
cd backend
reconcile settlement_report.csv bank_statement.csv order_ledger.csv --tolerance-days 3 --output reconciliation_report.html
```

The CLI auto-detects the source role from the headers, writes a static HTML report, and includes evidence for both matches and exceptions.

### Gemini

Copy `.env.example` to `.env` in the repo root, then set `GEMINI_API_KEY` there.

The backend uses Google Gemini structured output when `GEMINI_API_KEY` is set. If the key is absent, the code falls back to a deterministic offline structured-response path so the demo and tests still run locally.

## Upload your own data

You can POST your own JSON or CSV files directly to the upload endpoint, or drop them into a local `input/` folder and rerun from there:

- `POST /api/reconcile/upload`
- Required multipart fields: `bank_statement`, `general_ledger`, `invoices`, `bills`
- Optional multipart field: `ground_truth`
- Files may be `.json` or `.csv`

There is also a folder mode endpoint:

- `POST /api/reconcile/run-folder`
- Default folder: `input/`
- Optional JSON body: `{ "input_dir": "/absolute/or/relative/path" }`

Example:

```bash
curl.exe -X POST http://127.0.0.1:8000/api/reconcile/upload ^
  -F "bank_statement=@bank_statement.json;type=application/json" ^
  -F "general_ledger=@general_ledger.json;type=application/json" ^
  -F "invoices=@invoices.json;type=application/json" ^
  -F "bills=@bills.json;type=application/json" ^
  -F "ground_truth=@ground_truth.json;type=application/json"
```

If you omit `ground_truth`, the system will still reconcile your records, but precision/recall/F1 will be marked unavailable because there is no truth set to score against.

If you prefer the folder mode, put `bank_statement.json` or `bank_statement.csv`, `general_ledger.json` or `general_ledger.csv`, `invoices.json` or `invoices.csv`, and `bills.json` or `bills.csv` into `input/`, then call:

```bash
curl.exe -X POST http://127.0.0.1:8000/api/reconcile/run-folder
```

## Frontend

Install and build:

```bash
cd frontend
npm install
npm run build
```

Run the dev server:

```bash
cd frontend
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8000`.

If you serve the frontend separately from the backend, set `VITE_API_BASE_URL` to the backend origin before building or running the UI.

## Sample accuracy report

This sample comes from a real live reconciliation run against the generated 60-record-per-source batch:

```json
{
  "overall_match_rate": 0.625,
  "precision": 1.0,
  "recall": 1.0,
  "f1": 1.0,
  "total_records": 240,
  "matched_count": 150,
  "exception_count": 90,
  "checksum": {
    "bank": { "total": 60, "matched": 52, "exceptions": 8, "ok": true },
    "ledger": { "total": 60, "matched": 49, "exceptions": 11, "ok": true },
    "invoice": { "total": 60, "matched": 25, "exceptions": 35, "ok": true },
    "bill": { "total": 60, "matched": 24, "exceptions": 36, "ok": true },
    "ok": true
  },
  "calibration_table": [
    { "confidence_bucket": "0.95-1.0", "predictions": 95, "actual_accuracy": 1.0 },
    { "confidence_bucket": "0.85-0.95", "predictions": 6, "actual_accuracy": 1.0 }
  ]
}
```

## Notes

- The hidden truth file lives in `backend/generated/ground_truth.json` after generation and is only used by the scorer.
- Every reconciliation run is full-batch and idempotent.
- Every record ends up either matched or in the exception list, and the source-level checksum must stay green.
