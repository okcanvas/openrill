from __future__ import annotations
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "config/step022c-live-marker-contract.json"

def load_contract(path: Path = CONTRACT_PATH) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("fields"), dict):
        raise ValueError("OPENRILL_STEP022C_LIVE_MARKER_CONTRACT_INVALID")
    return value

def parse_marker_line(line: str) -> tuple[str, dict[str, str]]:
    tokens = line.strip().split()
    if not tokens:
        raise ValueError("empty marker")
    fields: dict[str, str] = {}
    for token in tokens[1:]:
        if "=" not in token:
            raise ValueError(f"invalid token:{token}")
        key, value = token.split("=", 1)
        if not key or key in fields:
            raise ValueError(f"duplicate-or-empty-key:{key}")
        fields[key] = value
    return tokens[0], fields

def validate_live_output(output: str, contract: dict | None = None) -> tuple[bool, str]:
    contract = contract or load_contract()
    lines = [line for line in output.splitlines() if line.startswith(contract["step"] + " ")]
    if len(lines) != 1:
        return False, f"marker-count={len(lines)}"
    try:
        step, actual = parse_marker_line(lines[0])
    except ValueError as exc:
        return False, f"marker-parse={exc}"
    expected = {
        "checks": str(contract["expectedChecks"]),
        "state": "PASSED",
        "version": str(contract["version"]),
        "schema": str(contract["schema"]),
        **{str(key): str(value) for key, value in contract["fields"].items()},
        "live_harness": str(contract["liveHarness"]),
    }
    missing = sorted(set(expected) - set(actual))
    extra = sorted(set(actual) - set(expected))
    changed = sorted(key for key in set(expected) & set(actual) if expected[key] != actual[key])
    ok = step == contract["step"] and not missing and not extra and not changed
    return ok, f"step={step} missing={missing} extra={extra} changed={[(key, expected[key], actual[key]) for key in changed]}"
