from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts/step020er3_live_marker.py"
CONTRACT = json.loads((ROOT / "config/step020er3-live-marker-contract.json").read_text(encoding="utf-8"))


def marker() -> str:
    fields = {
        "checks": CONTRACT["expectedChecks"],
        "state": "PASSED",
        "version": CONTRACT["version"],
        "schema": str(CONTRACT["schema"]),
        **{str(k): str(v) for k, v in CONTRACT["fields"].items()},
        "live_harness": CONTRACT["liveHarness"],
    }
    return " ".join([CONTRACT["step"], *[f"{k}={v}" for k, v in reversed(list(fields.items()))]])


def run(payload: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(VALIDATOR), "--validate-stdin"],
        cwd=cwd,
        input=payload + "\n",
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="openrill step020er3 external cwd ") as directory:
        cwd = Path(directory)
        valid = run(marker(), cwd)
        if valid.returncode != 0 or "PASS " not in valid.stdout:
            print("OPENRILL_STEP020ER3_VALIDATOR_ENTRYPOINT_FAIL valid=" + (valid.stdout + valid.stderr).strip())
            return 1
        broken = marker().replace(" queue=SYSTEM_MESSAGE_WAKE_RUN", "").replace(
            " migration=TERMINAL_CHILD_SAFE_BACKFILL", ""
        )
        invalid = run(broken, cwd)
        combined = invalid.stdout + invalid.stderr
        if invalid.returncode == 0 or "queue" not in combined or "migration" not in combined:
            print("OPENRILL_STEP020ER3_VALIDATOR_ENTRYPOINT_FAIL invalid=" + combined.strip())
            return 1
    print(
        "OPENRILL_STEP020ER3_VALIDATOR_ENTRYPOINT_PASS "
        f"python={sys.executable} mode=ABSOLUTE_FILE_ENTRYPOINT cwd=EXTERNAL_NO_PYTHONPATH_ASSUMPTION"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
