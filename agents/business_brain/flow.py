"""The team run (a CrewAI Flow) and the Brain question answering."""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from crewai.flow.flow import Flow, listen, start
from pydantic import BaseModel, Field

from .agents import brain, chief, specialists
from .models import AgentReport, BrainAnswer
from .snapshot import Snapshot
from .tools import build_tools

# Estimated price per million tokens (input, output) for the default model. Only used for reporting.
PRICE_PER_M = {"gpt-4.1-mini": (0.40, 1.60)}

TASKS = {
    "revenue": "בדוק את מצב ההכנסות של העסק (revenue_summary ל-30 ול-90 יום, לפי חודש, לפי שירות, לקוחות מובילים, חזרתיות) "
    "והחזר עד 3 תובנות חדות. כשיש לקוח מוביל או לקוח שקנה פעם אחת — הצע פעולה עליו בשמו.",
    "customers": "בדוק את מצב הלקוחות והחזר עד 3 תובנות חדות. שים לב במיוחד ל: לקוחות בסיכון, לקוחות שקנו פעם אחת ולא חזרו, "
    "ולקוחות שמעולם לא קנו (הזדמנות להמרה). לכל תובנה הצע פעולה על לקוחות ספציפיים מהכלים (customer_id), לא משימה כללית.",
    "sales": "בדוק את מצב העסקאות: pipeline_summary ואז stuck_deals עם days=14. החזר עד 3 תובנות חדות. "
    "לעסקאות התקועות הגדולות הצע צעד הבא על עסקה ספציפית (deal_id), ובמקרה של הרבה עסקאות תקועות הצע open_view stuck_deals או create_flow stuck_deal.",
}


def facts(s: Snapshot, key: str) -> dict[str, Any]:
    """The main numbers of each area, computed in code and handed to the agent up front, so it cannot miss them."""
    if key == "revenue":
        return {"overview": s.overview(), "last_30_days": s.revenue_summary(30), "last_90_days": s.revenue_summary(90),
                "by_month": s.revenue_by_month(6), "by_service": s.revenue_by_service(90), "repeat": s.repeat_stats(),
                "top_customers": s.top_customers(5)}
    if key == "customers":
        return {"overview": s.overview(), "stats": s.customer_stats(), "at_risk": s.customers_at_risk(5),
                "bought_once": s.lapsed_customers(45, 5), "never_bought_examples": s.never_bought(5),
                "no_activity_at_all": s.customers_without_activity(5)}
    return {"overview": s.overview(), "pipeline": s.pipeline_summary(), "stuck_14_days": s.stuck_deals(14, 5)}


def useful(report: AgentReport) -> AgentReport:
    """Drops "nothing to see here" insights: no actions and nothing to act on."""
    report.insights = [i for i in report.insights if i.actions or i.severity != "info"]
    return report


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0

    def add(self, metrics: Any) -> None:
        m = metrics if isinstance(metrics, dict) else (metrics.model_dump() if hasattr(metrics, "model_dump") else {})
        self.prompt_tokens += int(m.get("prompt_tokens") or 0)
        self.completion_tokens += int(m.get("completion_tokens") or 0)

    def cost(self, model: str) -> float:
        i, o = PRICE_PER_M.get(model, (0.0, 0.0))
        return round(self.prompt_tokens / 1e6 * i + self.completion_tokens / 1e6 * o, 5)


class TeamState(BaseModel):
    snapshot: dict[str, Any] = Field(default_factory=dict)
    reports: dict[str, Any] = Field(default_factory=dict)
    brief: dict[str, Any] = Field(default_factory=dict)
    errors: dict[str, str] = Field(default_factory=dict)
    usage: Usage = Field(default_factory=Usage)


class TeamFlow(Flow[TeamState]):
    """gather → three specialists in parallel → chief of staff."""

    @start()
    def gather(self) -> Snapshot:
        return Snapshot.from_dict(self.state.snapshot)

    @listen(gather)
    async def specialists_step(self, s: Snapshot) -> Snapshot:
        tools = build_tools(s)
        team = specialists(s, tools)

        async def run(key: str):
            try:
                prompt = f"{TASKS[key]}\n\nהעובדות המרכזיות (מחושבות מהנתונים, אפשר לצטט):\n{json.dumps(facts(s, key), ensure_ascii=False, default=str)}"
                out = await team[key].kickoff_async(prompt, response_format=AgentReport)
                self.state.usage.add(out.usage_metrics or {})
                report = out.pydantic if isinstance(out.pydantic, AgentReport) else AgentReport.model_validate_json(out.raw)
                self.state.reports[key] = useful(report).model_dump()
            except Exception as e:  # one failing agent must not sink the others
                self.state.errors[key] = str(e)[:300]

        await asyncio.gather(*(run(k) for k in team))
        return s

    @listen(specialists_step)
    async def chief_step(self, s: Snapshot) -> dict[str, Any]:
        if not self.state.reports:
            return {}
        prompt = (
            "אלה הממצאים של הסוכנים (JSON). בחר את 3 הדברים החשובים ביותר לעשות היום, בלי כפילויות, "
            "והחזר אותם כתובנות עם הפעולות המקוריות (אל תשנה ids ואל תמציא חדשים):\n"
            + json.dumps(self.state.reports, ensure_ascii=False)
        )
        try:
            out = await chief(s).kickoff_async(prompt, response_format=AgentReport)
            self.state.usage.add(out.usage_metrics or {})
            brief = out.pydantic if isinstance(out.pydantic, AgentReport) else AgentReport.model_validate_json(out.raw)
            self.state.brief = brief.model_dump()
        except Exception as e:
            self.state.errors["chief"] = str(e)[:300]
        return self.state.brief


async def run_team(snapshot: dict[str, Any], model: str = "gpt-4.1-mini") -> dict[str, Any]:
    t0 = time.monotonic()
    flow = TeamFlow()
    await flow.kickoff_async(inputs={"snapshot": snapshot})
    st = flow.state
    return {
        "reports": {**st.reports, **({"chief": st.brief} if st.brief else {})},
        "errors": st.errors,
        "usage": {**st.usage.model_dump(), "cost_usd": st.usage.cost(model)},
        "duration_ms": int((time.monotonic() - t0) * 1000),
    }


async def ask(snapshot: dict[str, Any], question: str, history: list[dict[str, str]] | None = None,
              model: str = "gpt-4.1-mini") -> dict[str, Any]:
    t0 = time.monotonic()
    s = Snapshot.from_dict(snapshot)
    agent = brain(s, build_tools(s))
    convo = "".join(f"{'בעל העסק' if h.get('role') == 'user' else 'אתה'}: {h.get('content', '')[:800]}\n" for h in (history or [])[-6:])
    prompt = (f"שיחה עד עכשיו:\n{convo}\n" if convo else "") + f"השאלה של בעל העסק: {question}\nהשתמש בכלים, ואז ענה."
    usage = Usage()
    out = await agent.kickoff_async(prompt, response_format=BrainAnswer)
    usage.add(out.usage_metrics or {})
    answer = out.pydantic if isinstance(out.pydantic, BrainAnswer) else BrainAnswer.model_validate_json(out.raw)
    return {
        "answer": answer.model_dump(),
        "usage": {**usage.model_dump(), "cost_usd": usage.cost(model)},
        "duration_ms": int((time.monotonic() - t0) * 1000),
    }
