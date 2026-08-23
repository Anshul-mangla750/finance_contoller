# Input Folder Mode

Drop the three settlement reconciliation files in this folder and point the CLI or API at the directory.

Expected filenames:

- `settlement_report.csv` or `settlement_report.xlsx`
- `bank_statement.csv` or `bank_statement.xlsx`
- `order_ledger.csv` or `order_ledger.xlsx`
- optional `ground_truth.csv`

The loader auto-detects the source role from the headers, so the column names can vary between providers as long as the underlying fields are present.
