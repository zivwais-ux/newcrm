"""Calculations and tools over a tiny in-memory snapshot (never written anywhere)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from business_brain.snapshot import Snapshot  # noqa: E402
from business_brain.tools import build_tools  # noqa: E402

STAGES = [
    {"key": "new", "label": "חדש", "kind": "open", "position": 0},
    {"key": "won", "label": "נסגר", "kind": "won", "position": 1},
    {"key": "lost", "label": "לא נסגר", "kind": "lost", "position": 2},
]


def snap(**over):
    base = {
        "org": {"name": "עסק", "currency": "ILS", "terms": {"customer": "מטופל"}},
        "today": "2026-11-01",
        "stages": STAGES,
        "customers": [
            {"id": "c1", "name": "דנה", "status": "active", "has_phone": True, "created_at": "2026-01-01"},
            {"id": "c2", "name": "יוסי", "status": "active", "has_phone": False, "created_at": "2026-10-20"},
            {"id": "c3", "name": "רונית", "status": "lead", "has_phone": True, "created_at": "2026-02-01"},
        ],
        "deals": [
            {"id": "d1", "name": "פרויקט א", "stage": "new", "value": 5000, "customer_id": "c1", "last_activity_at": "2026-10-01T10:00:00Z"},
            {"id": "d2", "name": "פרויקט ב", "stage": "new", "value": 1000, "customer_id": None, "last_activity_at": "2026-10-30T10:00:00Z"},
            {"id": "d3", "name": "פרויקט ג", "stage": "won", "value": 2000},
            {"id": "d4", "name": "פרויקט ד", "stage": "lost", "value": 700},
        ],
        "transactions": [
            {"id": "t1", "customer_id": "c1", "amount": 100, "date": "2026-06-01", "service": "תספורת"},
            {"id": "t2", "customer_id": "c1", "amount": 100, "date": "2026-07-01", "service": "תספורת"},
            {"id": "t3", "customer_id": "c2", "amount": 300, "date": "2026-10-25", "service": "צבע"},
            {"id": "t4", "customer_id": "c2", "amount": 50, "date": "2026-10-26", "status": "pending"},
        ],
    }
    base.update(over)
    return Snapshot.from_dict(base)


def test_revenue_counts_only_paid_sales_in_period():
    r = snap().revenue_summary(30)
    assert r["revenue"] == 300 and r["sales"] == 1 and r["previous_period_revenue"] == 0 and r["change_percent"] is None


def test_customers_at_risk_uses_their_own_rhythm():
    risk = snap().customers_at_risk()
    assert [r["customer_id"] for r in risk] == ["c1"]
    assert risk[0]["usual_gap_days"] == 30 and risk[0]["days_since_last_purchase"] == 123


def test_pipeline_and_stuck_deals_follow_business_stages():
    s = snap()
    p = s.pipeline_summary()
    assert p["open_deals"] == 2 and p["open_value"] == 6000 and p["win_rate_percent"] == 50.0
    stuck = s.stuck_deals(14)
    assert stuck["count"] == 1 and stuck["top"][0]["deal_id"] == "d1" and stuck["top"][0]["idle_days"] == 31


def test_customers_without_activity():
    assert snap().customers_without_activity()["count"] == 1  # רונית


def test_never_bought():
    nb = snap().never_bought()
    assert nb["count"] == 1 and nb["examples"][0]["customer_id"] == "c3" and nb["with_phone"] == 1


def test_known_ids_and_lookup():
    s = snap()
    assert {"c1", "d1"} <= s.known_ids()
    assert s.search_records("דנ")[0]["id"] == "c1"
    assert s.search_records("לקוחה רונית")[0]["id"] == "c3"
    assert s.search_records("פרויקט א")[0]["id"] == "d1"
    assert s.customer_360("c1")["revenue"] == 200
    assert s.customer_360("nope") is None


def test_email_tools_say_when_not_connected():
    tools = build_tools(snap())
    assert json.loads(tools["search_emails"].run(text="x"))["connected"] is False


def test_unanswered_emails():
    s = snap(emails=[{"id": "e1", "from": "a@b.c", "subject": "הצעת מחיר", "date": "2026-10-28", "awaiting_reply": True},
                     {"id": "e2", "from": "x@y.z", "subject": "תודה", "date": "2026-10-31", "awaiting_reply": False}])
    assert [e["email_id"] for e in s.unanswered_emails()] == ["e1"]
    assert s.search_emails("מחיר")[0]["email_id"] == "e1"
