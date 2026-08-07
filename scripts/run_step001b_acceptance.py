from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP001B_ACCEPTANCE_REPORT.txt"
ALLOWED_VERSIONS = {"0.1.2-step001b", "0.1.3-step001c", "0.1.4-step001d", "0.2.0-step002", "0.2.1-step002a", "0.2.2-step002b", "0.3.0-step003", "0.6.1-step006a"}


def run(command: list[str]) -> tuple[bool, str]:
    return run_utf8(command, cwd=ROOT)


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: object, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    check("root-version", package.get("version") in ALLOWED_VERSIONS, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1", str(package.get("packageManager")))
    check(
        "step001b-script",
        package.get("scripts", {}).get("acceptance:step001b") == "python scripts/run_step001b_acceptance.py",
    )

    workspace = (ROOT / "pnpm-workspace.yaml").read_text(encoding="utf-8")
    lock = (ROOT / "pnpm-lock.yaml").read_text(encoding="utf-8")
    check(
        "workspace-auto-install-peers-true-once",
        len(re.findall(r"(?m)^autoInstallPeers: true$", workspace)) == 1,
    )
    check("workspace-auto-install-peers-false-zero", "autoInstallPeers: false" not in workspace)
    check(
        "lock-auto-install-peers-true-once",
        len(re.findall(r"(?m)^  autoInstallPeers: true$", lock)) == 1,
    )
    check("lock-auto-install-peers-false-zero", "  autoInstallPeers: false" not in lock)
    check("protocol-null-importer-zero", "  packages/protocol:\n" not in lock)
    check("protocol-empty-object", re.search(r"(?m)^  packages/protocol: \{\}$", lock) is not None)

    versions: dict[str, str | None] = {}
    for manifest in sorted(ROOT.rglob("package.json")):
        if "node_modules" in manifest.parts:
            continue
        data = json.loads(manifest.read_text(encoding="utf-8"))
        versions[manifest.relative_to(ROOT).as_posix()] = data.get("version")
    check("manifest-count", len(versions) == 25, str(len(versions)))
    current_version = package.get("version")
    mismatched = {path: version for path, version in versions.items() if version != current_version}
    check("all-manifest-versions", not mismatched, json.dumps(mismatched, sort_keys=True))

    plan = ROOT / "docs/plans/STEP001B_PNPM_LOCKFILE_SETTINGS_ALIGNMENT.md"
    check("step001b-plan", plan.is_file())
    if plan.is_file():
        text = plan.read_text(encoding="utf-8")
        for heading in (
            "## 목적",
            "## Reference Evidence",
            "## 실패 증거",
            "## 원인",
            "## 구현 범위",
            "## 공개 계약",
            "## 상태 전이",
            "## 실패 및 복구",
            "## Acceptance",
            "## 패키징 산출물",
            "## 제외",
        ):
            check(f"step001b-heading:{heading}", heading in text)

    ok, output = run([sys.executable, "scripts/run_step001_acceptance.py"])
    check("step001-regression", ok and "state=PASSED" in output, output[-3000:])
    ok, output = run([sys.executable, "scripts/run_step001a_acceptance.py"])
    check("step001a-regression", ok and "state=PASSED" in output, output[-3000:])

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines: list[str] = []
    for name, ok, detail in checks:
        line = f"[{'PASS' if ok else 'FAIL'}] {name}"
        if detail:
            line += f" :: {detail}"
        lines.append(line)
    lines.append(
        f"STEP001B_PNPM_LOCKFILE_SETTINGS_ALIGNMENT checks={passed}/{len(checks)} state={state} "
        "auto_install_peers=TRUE package_manager=pnpm@11.15.1"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
