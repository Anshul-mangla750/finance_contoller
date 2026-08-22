# Input Folder Mode

Drop your reconciliation files in this folder and rerun without uploading multipart files.

Expected filenames:

- `bank_statement.json` or `bank_statement.csv`
- `general_ledger.json` or `general_ledger.csv`
- `invoices.json` or `invoices.csv`
- `bills.json` or `bills.csv`
- optional `ground_truth.json`

You can run the backend folder mode endpoint with the default `input/` folder, or point it at another local directory when needed.
