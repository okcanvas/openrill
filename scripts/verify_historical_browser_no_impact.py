from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = ROOT / "reference/validation/STEP012BR1_BROWSER_SURFACE_BASELINE.json"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalize_live_script(source: str) -> str:
    source = source.replace(
        'import { OPENRILL_STATE_SCHEMA_VERSION } from "../packages/state/dist/index.js";\n',
        "",
    )
    source = source.replace(
        "identity.schemaVersion !== OPENRILL_STATE_SCHEMA_VERSION",
        "identity.schemaVersion !== 8",
    )
    source = source.replace(
        "process.stdout.write(`OPENRILL_STEP011_LIVE_PASS schema=${OPENRILL_STATE_SCHEMA_VERSION} framework=VUE_3 ui=VERTICAL_SLICE approval=ALLOW_ONCE artifact=OPENED reconnect=CURSOR_RESUME mobile=PASS modelCalls=3 toolCalls=2 secret=POINT_OF_USE\\n`);",
        'process.stdout.write("OPENRILL_STEP011_LIVE_PASS schema=8 framework=VUE_3 ui=VERTICAL_SLICE approval=ALLOW_ONCE artifact=OPENED reconnect=CURSOR_RESUME mobile=PASS modelCalls=3 toolCalls=2 secret=POINT_OF_USE\\n");',
    )
    return source


def main() -> int:
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    failures: list[str] = []
    for relative, expected in baseline["browserSurfaceSha256"].items():
        path = ROOT / relative
        actual = sha256_bytes(path.read_bytes()) if path.is_file() else "MISSING"
        if actual != expected:
            failures.append(f"browser_surface:{relative}:expected={expected}:actual={actual}")

    live_path = ROOT / "scripts/run-step011-live.mjs"
    live_source = live_path.read_text(encoding="utf-8")
    normalized_hash = sha256_bytes(normalize_live_script(live_source).encode("utf-8"))
    if normalized_hash != baseline["normalizedLiveScriptSha256"]:
        failures.append(
            "live_script:normalized_hash:"
            f"expected={baseline['normalizedLiveScriptSha256']}:actual={normalized_hash}"
        )
    if re.search(r"\bautomation\b", live_source, re.IGNORECASE):
        failures.append("live_script:automation_reference_present")
    if "OPENRILL_STATE_SCHEMA_VERSION" not in live_source:
        failures.append("live_script:state_schema_owner_missing")

    if failures:
        print(
            "OPENRILL_HISTORICAL_BROWSER_NO_IMPACT_FAIL "
            f"accepted_sha256={baseline['acceptedZipSha256']} failures={len(failures)}"
        )
        for failure in failures[:20]:
            print(failure)
        return 1
    print(
        "OPENRILL_HISTORICAL_BROWSER_NO_IMPACT_PASS "
        f"accepted_step={baseline['acceptedStep']} "
        f"accepted_sha256={baseline['acceptedZipSha256']} "
        f"browser_files={len(baseline['browserSurfaceSha256'])} "
        "live_delta=SCHEMA_OWNER_ONLY"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
