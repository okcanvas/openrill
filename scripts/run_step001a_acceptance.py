from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP001A_ACCEPTANCE_REPORT.txt"


def run(command: list[str]) -> tuple[bool, str]:
    return run_utf8(command, cwd=ROOT)


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: object, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    check("root-version", package.get("version") in {"0.1.1-step001a", "0.1.2-step001b", "0.1.3-step001c", "0.1.4-step001d", "0.2.0-step002", "0.2.1-step002a", "0.2.2-step002b", "0.3.0-step003", "0.6.1-step006a"}, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1", str(package.get("packageManager")))
    check(
        "step001a-script",
        package.get("scripts", {}).get("acceptance:step001a") == "python scripts/run_step001a_acceptance.py",
    )

    lock = (ROOT / "pnpm-lock.yaml").read_text(encoding="utf-8")
    check("lockfile-version", "lockfileVersion: '9.0'" in lock)
    check("protocol-importer-empty-object", re.search(r"(?m)^  packages/protocol: \{\}$", lock) is not None)
    check("protocol-importer-not-null", "  packages/protocol:\n" not in lock)
    check("snapshots-present", re.search(r"(?m)^snapshots:$", lock) is not None)
    for token in (
        "  '@types/node@22.20.1':",
        "  typescript@6.0.3: {}",
        "  undici-types@6.21.0: {}",
    ):
        check(f"snapshot:{token.strip()}", token in lock)

    plan = ROOT / "docs/plans/STEP001A_PNPM_LOCKFILE_REPAIR.md"
    check("step001a-plan", plan.is_file())
    if plan.is_file():
        text = plan.read_text(encoding="utf-8")
        for heading in ("## 목적", "## 실패 증거", "## 원인", "## 구현 범위", "## Acceptance", "## 제외"):
            check(f"step001a-heading:{heading}", heading in text)

    ok, output = run([sys.executable, "scripts/run_step001_acceptance.py"])
    check("step001-regression", ok and "state=PASSED" in output, output[-2000:])

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines: list[str] = []
    for name, ok, detail in checks:
        line = f"[{'PASS' if ok else 'FAIL'}] {name}"
        if detail:
            line += f" :: {detail}"
        lines.append(line)
    lines.append(
        f"STEP001A_PNPM_LOCKFILE_REPAIR checks={passed}/{len(checks)} state={state} "
        "null_importers=0 package_manager=pnpm@11.15.1"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
