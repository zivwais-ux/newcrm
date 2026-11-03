"""Local run: python agents/run.py team <snapshot.json> <out.json>  |  python agents/run.py ask <snapshot.json> "<question>" """

import asyncio
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")
os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")
os.environ.setdefault("OTEL_SDK_DISABLED", "true")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from business_brain.flow import ask, run_team  # noqa: E402


def main() -> None:
    mode, snap_path = sys.argv[1], sys.argv[2]
    snapshot = json.loads(Path(snap_path).read_text(encoding="utf-8"))
    if mode == "team":
        result = asyncio.run(run_team(snapshot))
        Path(sys.argv[3]).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"errors": result["errors"], "usage": result["usage"], "duration_ms": result["duration_ms"]}, ensure_ascii=False))
    else:
        print(json.dumps(asyncio.run(ask(snapshot, sys.argv[3])), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
