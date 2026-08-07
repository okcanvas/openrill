from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "config/step020er3-live-marker-contract.json"


def load_contract(path: Path = CONTRACT_PATH) -> dict:
    contract = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(contract, dict) or not isinstance(contract.get("fields"), dict):
        raise ValueError("OPENRILL_STEP020ER3_LIVE_MARKER_CONTRACT_INVALID")
    return contract


def parse_marker_line(line: str) -> tuple[str, dict[str, str]]:
    tokens = line.strip().split()
    if not tokens:
        raise ValueError("empty marker")
    step = tokens[0]
    fields: dict[str, str] = {}
    for token in tokens[1:]:
        if "=" not in token:
            raise ValueError(f"invalid token:{token}")
        key, value = token.split("=", 1)
        if not key or key in fields:
            raise ValueError(f"duplicate-or-empty-key:{key}")
        fields[key] = value
    return step, fields


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
    detail = (
        f"step={step} missing={missing} extra={extra} "
        f"changed={[(key, expected[key], actual[key]) for key in changed]}"
    )
    return ok, detail


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate the STEP020ER3 Windows LIVE marker from stdin")
    parser.add_argument("--validate-stdin", action="store_true", help="Read complete Harness output from stdin")
    args = parser.parse_args(argv)
    if not args.validate_stdin:
        parser.error("--validate-stdin is required")
    ok, detail = validate_live_output(sys.stdin.read())
    print(("PASS " if ok else "FAIL ") + detail)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
