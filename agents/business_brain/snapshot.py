"""Deterministic numbers over a read-only snapshot of one business.

Every figure an agent may quote is computed here, in code. The model only interprets.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from statistics import mean
from typing import Any


def _day(value: Any) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date() if "T" in str(value) else date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _money(n: float) -> float:
    return round(float(n or 0), 2)


@dataclass
class Snapshot:
    org: dict[str, Any]
    today: date
    stages: list[dict[str, Any]]
    customers: list[dict[str, Any]]
    deals: list[dict[str, Any]]
    transactions: list[dict[str, Any]]
    tasks: list[dict[str, Any]] = field(default_factory=list)
    activities: list[dict[str, Any]] = field(default_factory=list)
    leads: list[dict[str, Any]] = field(default_factory=list)
    emails: list[dict[str, Any]] = field(default_factory=list)
    insights: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Snapshot":
        return cls(
            org=d.get("org") or {},
            today=_day(d.get("today")) or date.today(),
            stages=d.get("stages") or [],
            customers=d.get("customers") or [],
            deals=d.get("deals") or [],
            transactions=d.get("transactions") or [],
            tasks=d.get("tasks") or [],
            activities=d.get("activities") or [],
            leads=d.get("leads") or [],
            emails=d.get("emails") or [],
            insights=d.get("insights") or [],
        )

    # ------------------------------------------------------------------ helpers
    @property
    def currency(self) -> str:
        return self.org.get("currency") or "ILS"

    def terms(self) -> dict[str, str]:
        return self.org.get("terms") or {}

    def known_ids(self) -> set[str]:
        ids = {c["id"] for c in self.customers} | {d["id"] for d in self.deals}
        return ids | {e["id"] for e in self.emails if e.get("id")}

    def _paid_sales(self) -> list[dict[str, Any]]:
        return [t for t in self.transactions if (t.get("type") or "sale") == "sale" and (t.get("status") or "paid") == "paid"]

    def _stage(self, key: str) -> dict[str, Any]:
        return next((s for s in self.stages if s.get("key") == key), {"key": key, "label": key, "kind": "open"})

    def _customer_name(self, cid: str | None) -> str | None:
        if not cid:
            return None
        return next((c.get("name") for c in self.customers if c["id"] == cid), None)

    def _purchases_by_customer(self) -> dict[str, list[date]]:
        out: dict[str, list[date]] = defaultdict(list)
        for t in self._paid_sales():
            d = _day(t.get("date"))
            if t.get("customer_id") and d:
                out[t["customer_id"]].append(d)
        for v in out.values():
            v.sort()
        return out

    # ------------------------------------------------------------------ overview
    def overview(self) -> dict[str, Any]:
        open_deals = [d for d in self.deals if self._stage(d.get("stage", "")).get("kind") == "open"]
        return {
            "business": self.org.get("name"),
            "today": self.today.isoformat(),
            "currency": self.currency,
            "customers": len(self.customers),
            "deals_total": len(self.deals),
            "deals_open": len(open_deals),
            "sales_paid": len(self._paid_sales()),
            "open_tasks": len([t for t in self.tasks if (t.get("status") or "open") != "done"]),
            "leads": len(self.leads),
            "appointments_recorded": len([a for a in self.activities if a.get("type") in ("appointment", "meeting", "visit")]),
            "emails_in_view": len(self.emails),
        }

    # ------------------------------------------------------------------ revenue
    def revenue_summary(self, days: int = 30) -> dict[str, Any]:
        days = max(1, min(days, 365))
        start = self.today - timedelta(days=days - 1)
        prev_start = start - timedelta(days=days)
        cur = [t for t in self._paid_sales() if (d := _day(t.get("date"))) and start <= d <= self.today]
        prev = [t for t in self._paid_sales() if (d := _day(t.get("date"))) and prev_start <= d < start]
        total = sum(float(t.get("amount") or 0) for t in cur)
        prev_total = sum(float(t.get("amount") or 0) for t in prev)
        change = None if prev_total == 0 else round((total - prev_total) / prev_total * 100, 1)
        return {
            "period_days": days,
            "revenue": _money(total),
            "sales": len(cur),
            "average_sale": _money(total / len(cur)) if cur else 0,
            "previous_period_revenue": _money(prev_total),
            "change_percent": change,
            "currency": self.currency,
        }

    def revenue_by_month(self, months: int = 6) -> list[dict[str, Any]]:
        months = max(1, min(months, 24))
        buckets: dict[str, float] = defaultdict(float)
        counts: dict[str, int] = defaultdict(int)
        for t in self._paid_sales():
            d = _day(t.get("date"))
            if d:
                k = f"{d.year:04d}-{d.month:02d}"
                buckets[k] += float(t.get("amount") or 0)
                counts[k] += 1
        out = []
        y, m = self.today.year, self.today.month
        for _ in range(months):
            k = f"{y:04d}-{m:02d}"
            out.append({"month": k, "revenue": _money(buckets.get(k, 0)), "sales": counts.get(k, 0)})
            m -= 1
            if m == 0:
                y, m = y - 1, 12
        return list(reversed(out))

    def revenue_by_service(self, days: int = 90) -> list[dict[str, Any]]:
        start = self.today - timedelta(days=max(1, min(days, 365)) - 1)
        agg: dict[str, list[float]] = defaultdict(list)
        for t in self._paid_sales():
            d = _day(t.get("date"))
            if d and d >= start:
                agg[(t.get("service") or "ללא שירות").strip() or "ללא שירות"].append(float(t.get("amount") or 0))
        rows = [{"service": k, "revenue": _money(sum(v)), "sales": len(v)} for k, v in agg.items()]
        return sorted(rows, key=lambda r: r["revenue"], reverse=True)[:10]

    def top_customers(self, limit: int = 5) -> list[dict[str, Any]]:
        agg: dict[str, float] = defaultdict(float)
        for t in self._paid_sales():
            if t.get("customer_id"):
                agg[t["customer_id"]] += float(t.get("amount") or 0)
        rows = [{"customer_id": k, "name": self._customer_name(k), "revenue": _money(v)} for k, v in agg.items()]
        return sorted(rows, key=lambda r: r["revenue"], reverse=True)[: max(1, min(limit, 20))]

    def repeat_stats(self) -> dict[str, Any]:
        p = self._purchases_by_customer()
        buyers = len(p)
        repeat = len([1 for v in p.values() if len(set(v)) >= 2])
        return {
            "buyers": buyers,
            "repeat_buyers": repeat,
            "repeat_rate_percent": round(repeat / buyers * 100, 1) if buyers else None,
        }

    # ------------------------------------------------------------------ customers
    def customer_stats(self) -> dict[str, Any]:
        by_status: dict[str, int] = defaultdict(int)
        for c in self.customers:
            by_status[c.get("status") or "active"] += 1
        p = self._purchases_by_customer()
        active_90 = len([1 for v in p.values() if (self.today - v[-1]).days <= 90])
        new_30 = len([c for c in self.customers if (d := _day(c.get("created_at"))) and (self.today - d).days <= 30])
        return {
            "customers": len(self.customers),
            "by_status": dict(by_status),
            "bought_in_last_90_days": active_90,
            "never_bought": len(self.customers) - len(p),
            "new_last_30_days": new_30,
            "with_phone": len([c for c in self.customers if c.get("has_phone")]),
        }

    def customers_at_risk(self, limit: int = 10) -> list[dict[str, Any]]:
        """Returning customers who are late versus their own rhythm (1.5x their average gap)."""
        out = []
        for cid, dates in self._purchases_by_customer().items():
            uniq = sorted(set(dates))
            if len(uniq) < 2:
                continue
            gap = mean((b - a).days for a, b in zip(uniq, uniq[1:]))
            since = (self.today - uniq[-1]).days
            if gap > 0 and since > gap * 1.5:
                out.append({"customer_id": cid, "name": self._customer_name(cid), "days_since_last_purchase": since,
                            "usual_gap_days": round(gap), "purchases": len(uniq)})
        return sorted(out, key=lambda r: r["days_since_last_purchase"] / max(r["usual_gap_days"], 1), reverse=True)[:limit]

    def lapsed_customers(self, min_days: int = 45, limit: int = 10) -> list[dict[str, Any]]:
        """Customers who bought once and did not come back."""
        out = []
        for cid, dates in self._purchases_by_customer().items():
            uniq = sorted(set(dates))
            since = (self.today - uniq[-1]).days
            if len(uniq) == 1 and since >= min_days:
                out.append({"customer_id": cid, "name": self._customer_name(cid), "days_since_purchase": since})
        return sorted(out, key=lambda r: r["days_since_purchase"])[:limit]

    def never_bought(self, limit: int = 10) -> dict[str, Any]:
        """Customers with no paid purchase yet — a conversion opportunity."""
        buyers = set(self._purchases_by_customer())
        rows = [c for c in self.customers if c["id"] not in buyers]
        return {"count": len(rows), "with_phone": len([c for c in rows if c.get("has_phone")]),
                "examples": [{"customer_id": c["id"], "name": c.get("name"), "has_phone": bool(c.get("has_phone"))} for c in rows[:limit]]}

    def customers_without_activity(self, limit: int = 10) -> dict[str, Any]:
        """Customers with no purchase, deal or activity at all — often imported lists nobody followed up."""
        touched = {t.get("customer_id") for t in self.transactions} | {d.get("customer_id") for d in self.deals}
        touched |= {a.get("customer_id") for a in self.activities}
        idle = [c for c in self.customers if c["id"] not in touched]
        return {"count": len(idle), "examples": [{"customer_id": c["id"], "name": c.get("name")} for c in idle[:limit]]}

    # ------------------------------------------------------------------ deals
    def _deal_idle_days(self, d: dict[str, Any]) -> int | None:
        last = _day(d.get("last_activity_at")) or _day(d.get("created_at"))
        return (self.today - last).days if last else None

    def pipeline_summary(self) -> dict[str, Any]:
        rows = []
        for s in sorted(self.stages, key=lambda s: s.get("position", 0)):
            ds = [d for d in self.deals if d.get("stage") == s["key"]]
            rows.append({"stage": s.get("label"), "kind": s.get("kind"), "deals": len(ds),
                         "value": _money(sum(float(d.get("value") or 0) for d in ds))})
        won = len([d for d in self.deals if self._stage(d.get("stage", "")).get("kind") == "won"])
        lost = len([d for d in self.deals if self._stage(d.get("stage", "")).get("kind") == "lost"])
        open_ = [d for d in self.deals if self._stage(d.get("stage", "")).get("kind") == "open"]
        return {
            "stages": rows,
            "open_deals": len(open_),
            "open_value": _money(sum(float(d.get("value") or 0) for d in open_)),
            "won": won,
            "lost": lost,
            "win_rate_percent": round(won / (won + lost) * 100, 1) if won + lost else None,
            "currency": self.currency,
        }

    def stuck_deals(self, days: int = 14, limit: int = 10) -> dict[str, Any]:
        days = max(1, min(days, 365))
        rows = []
        for d in self.deals:
            if self._stage(d.get("stage", "")).get("kind") != "open":
                continue
            idle = self._deal_idle_days(d)
            if idle is not None and idle >= days:
                rows.append({"deal_id": d["id"], "name": d.get("name"), "stage": self._stage(d.get("stage", "")).get("label"),
                             "value": _money(d.get("value") or 0), "idle_days": idle,
                             "customer_id": d.get("customer_id"), "customer": self._customer_name(d.get("customer_id"))})
        rows.sort(key=lambda r: (r["value"], r["idle_days"]), reverse=True)
        idle = sorted(r["idle_days"] for r in rows)
        return {"count": len(rows), "total_value": _money(sum(r["value"] for r in rows)),
                "average_idle_days": round(mean(idle)) if idle else None,
                "longest_idle_days": idle[-1] if idle else None, "top": rows[:limit]}

    # ------------------------------------------------------------------ lookup
    def search_records(self, text: str, limit: int = 8) -> list[dict[str, Any]]:
        q = (text or "").strip().lower()
        if not q:
            return []
        # Whole phrase first, then any meaningful word ("לקוח 103" also finds "103").
        stop = {"לקוח", "לקוחה", "לקוחות", "עסקה", "עסקאות", "של", "את"}
        words = [w for w in q.split() if len(w) >= 2 and w not in stop]

        def score(name: str) -> int:
            n = (name or "").lower()
            return 2 if q in n else (1 if words and any(w in n for w in words) else 0)

        out = [(score(c.get("name") or "") or score(c.get("company") or ""),
                {"type": "customer", "id": c["id"], "name": c.get("name"), "status": c.get("status")}) for c in self.customers]
        out += [(score(d.get("name") or ""),
                 {"type": "deal", "id": d["id"], "name": d.get("name"), "stage": self._stage(d.get("stage", "")).get("label")})
                for d in self.deals]
        return [r for sc, r in sorted(out, key=lambda x: -x[0]) if sc > 0][:limit]

    def customer_360(self, customer_id: str) -> dict[str, Any] | None:
        c = next((c for c in self.customers if c["id"] == customer_id), None)
        if not c:
            return None
        sales = [t for t in self._paid_sales() if t.get("customer_id") == customer_id]
        deals = [d for d in self.deals if d.get("customer_id") == customer_id]
        emails = [e for e in self.emails if e.get("customer_id") == customer_id]
        return {
            "id": c["id"], "name": c.get("name"), "status": c.get("status"), "company": c.get("company"),
            "has_phone": bool(c.get("has_phone")), "customer_since": str(c.get("created_at") or "")[:10],
            "own_fields": c.get("custom_fields") or {},
            "purchases": len(sales), "revenue": _money(sum(float(t.get("amount") or 0) for t in sales)),
            "last_purchase": max((str(t.get("date")) for t in sales), default=None),
            "deals": [{"deal_id": d["id"], "name": d.get("name"), "stage": self._stage(d.get("stage", "")).get("label"),
                       "value": _money(d.get("value") or 0), "idle_days": self._deal_idle_days(d)} for d in deals[:10]],
            "emails": [{"email_id": e["id"], "subject": e.get("subject"), "date": e.get("date")} for e in emails[:10]],
        }

    def deal_detail(self, deal_id: str) -> dict[str, Any] | None:
        d = next((d for d in self.deals if d["id"] == deal_id), None)
        if not d:
            return None
        return {"deal_id": d["id"], "name": d.get("name"), "stage": self._stage(d.get("stage", "")).get("label"),
                "value": _money(d.get("value") or 0), "idle_days": self._deal_idle_days(d),
                "expected_close": d.get("expected_close"), "customer_id": d.get("customer_id"),
                "customer": self._customer_name(d.get("customer_id"))}

    # ------------------------------------------------------------------ email
    def search_emails(self, text: str = "", days: int = 30, limit: int = 10) -> list[dict[str, Any]]:
        q = (text or "").strip().lower()
        since = self.today - timedelta(days=max(1, min(days, 365)))
        rows = []
        for e in self.emails:
            d = _day(e.get("date"))
            if d and d < since:
                continue
            hay = " ".join(str(e.get(k) or "") for k in ("subject", "from", "snippet")).lower()
            if not q or q in hay:
                rows.append({"email_id": e["id"], "from": e.get("from"), "subject": e.get("subject"), "date": e.get("date"),
                             "snippet": (e.get("snippet") or "")[:240], "customer_id": e.get("customer_id"),
                             "awaiting_reply": bool(e.get("awaiting_reply"))})
        rows.sort(key=lambda r: str(r.get("date") or ""), reverse=True)
        return rows[: max(1, min(limit, 25))]

    def unanswered_emails(self, min_days: int = 2, limit: int = 10) -> list[dict[str, Any]]:
        rows = []
        for e in self.emails:
            d = _day(e.get("date"))
            if e.get("awaiting_reply") and d and (self.today - d).days >= min_days:
                rows.append({"email_id": e["id"], "from": e.get("from"), "subject": e.get("subject"),
                             "days_waiting": (self.today - d).days, "customer_id": e.get("customer_id")})
        return sorted(rows, key=lambda r: r["days_waiting"], reverse=True)[:limit]

    def email_thread(self, email_id: str) -> dict[str, Any] | None:
        e = next((e for e in self.emails if e.get("id") == email_id), None)
        if not e:
            return None
        return {"email_id": e["id"], "from": e.get("from"), "subject": e.get("subject"), "date": e.get("date"),
                "messages": e.get("messages") or [{"from": e.get("from"), "text": e.get("snippet")}]}
