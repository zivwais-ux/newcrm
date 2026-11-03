"""Vercel Python function: runs the agent team or answers a Brain question.

POST /api/agents  {"mode": "run" | "ask", "run_id": "...", "org_id": "...", "snapshot": {...}, "question"?: "...", "history"?: [...]}
Authorization: Bearer <the signed-in user's Supabase access token>

The function holds no database secret. It checks, with the caller's own token (so RLS applies), that the
caller is signed in, belongs to the organization, and that the app opened this run moments ago (rate limits
live in the app). It never writes: the app validates and stores the result.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# CrewAI writes small local state; only /tmp is writable on Vercel. No telemetry leaves the function.
os.environ.setdefault("HOME", "/tmp")
os.environ.setdefault("CREWAI_STORAGE_DIR", "/tmp/crewai")
os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")
os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")
os.environ.setdefault("OTEL_SDK_DISABLED", "true")
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "agents"))

import httpx  # noqa: E402
from fastapi import FastAPI, Header, HTTPException  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

app = FastAPI()

SUPABASE_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL") or "").rstrip("/")
ANON_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_ANON_KEY") or ""


class Body(BaseModel):
    mode: str = Field(pattern="^(run|ask)$")
    run_id: str = Field(min_length=36, max_length=36)
    org_id: str = Field(min_length=36, max_length=36)
    snapshot: dict
    question: str | None = Field(default=None, max_length=1000)
    history: list[dict] | None = None


async def _authorize(token: str, body: Body) -> None:
    if not SUPABASE_URL or not ANON_KEY:
        raise HTTPException(503, "not configured")
    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=10) as http:
        user = await http.get(f"{SUPABASE_URL}/auth/v1/user", headers=headers)
        if user.status_code != 200:
            raise HTTPException(401, "not signed in")
        # RLS: the caller only sees runs of organizations they belong to.
        run = await http.get(
            f"{SUPABASE_URL}/rest/v1/agent_runs",
            headers=headers,
            params={"id": f"eq.{body.run_id}", "organization_id": f"eq.{body.org_id}", "status": "eq.running",
                    "kind": f"eq.{'team' if body.mode == 'run' else 'ask'}", "select": "id,created_at"},
        )
        if run.status_code != 200 or not run.json():
            raise HTTPException(403, "no open run")


@app.post("/api/agents")
async def agents(body: Body, authorization: str = Header(default="")) -> dict:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "not signed in")
    await _authorize(token, body)

    from business_brain.flow import ask, run_team  # heavy import only after the caller is known

    if body.mode == "run":
        return await run_team(body.snapshot)
    if not body.question or not body.question.strip():
        raise HTTPException(400, "empty question")
    return await ask(body.snapshot, body.question.strip(), body.history)
