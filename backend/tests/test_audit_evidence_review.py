from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_audit_evidence_review_flow():
    # 1. Run reconciliation first to populate DB
    res = client.post("/api/reconcile/run")
    assert res.status_code == 200
    run_data = res.json()
    assert run_data["kpis"]["records_processed"] > 0
    assert len(run_data["exceptions"]) > 0

    exc_id = run_data["exceptions"][0]["record_id"]

    # 2. Test Get Evidence & Gemini Investigation API
    ev_res = client.get(f"/api/reconcile/evidence/{exc_id}")
    assert ev_res.status_code == 200
    ev_data = ev_res.json()
    assert ev_data["record_id"] == exc_id
    assert "structured_evidence" in ev_data
    assert "ai_explanation" in ev_data
    assert ev_data["ai_explanation"]["explanation"] != ""

    # 3. Test Human Review Decision API (Approve Match)
    rev_res = client.post(
        "/api/reconcile/review",
        json={
            "record_id": exc_id,
            "action": "APPROVE_MATCH",
            "notes": "Verified fee deduction with payment gateway receipt.",
            "reviewer_name": "Senior Auditor",
        },
    )
    assert rev_res.status_code == 200
    rev_data = rev_res.json()
    assert rev_data["success"] is True
    assert rev_data["record"]["status"] == "MATCHED_HUMAN_APPROVED"
    assert rev_data["record"]["review_status"] == "APPROVED"

    # 4. Test Audit Logs API
    audit_res = client.get("/api/dashboard/audit-logs")
    assert audit_res.status_code == 200
    audit_data = audit_res.json()
    assert audit_data["total"] >= 1
    assert any(log["record_id"] == exc_id for log in audit_data["items"])

    # 5. Test Cash Details API
    cash_res = client.get("/api/dashboard/cash-details")
    assert cash_res.status_code == 200
    cash_data = cash_res.json()
    assert "summary" in cash_data
    assert "traceability" in cash_data
    assert cash_data["summary"]["current_cash"] != 0.0

    # 6. Test Runs List API
    runs_res = client.get("/api/dashboard/runs")
    assert runs_res.status_code == 200
    runs_data = runs_res.json()
    assert runs_data["total"] >= 1
