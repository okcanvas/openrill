from __future__ import annotations

import json
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP003A_ACCEPTANCE_REPORT.txt"
VERSION = "0.6.1-step006a"
STEP = "STEP003A_DETERMINISTIC_NODE_TEST_REPORTER"


def clean_generated() -> None:
    for group in ("apps", "services", "packages", "connectors", "skills"):
        for path in (ROOT / group).glob("*/dist"):
            shutil.rmtree(path, ignore_errors=True)
    shutil.rmtree(ROOT / ".artifacts", ignore_errors=True)
    for path in ROOT.rglob("__pycache__"):
        shutil.rmtree(path, ignore_errors=True)
    for path in ROOT.rglob("*.py[co]"):
        path.unlink(missing_ok=True)


def manifests() -> list[Path]:
    result = [ROOT / "package.json"]
    for pattern in (
        "apps/*/package.json",
        "services/*/package.json",
        "packages/*/package.json",
        "connectors/*/package.json",
        "skills/*/package.json",
    ):
        result.extend(ROOT.glob(pattern))
    return result


def main() -> int:
    clean_generated()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: object, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1", str(package.get("packageManager")))
    check("step003a-script", package.get("scripts", {}).get("acceptance:step003a") == "python scripts/run_step003a_acceptance.py")
    check("step003a-package-script", "package_step003a.py" in package.get("scripts", {}).get("package:step003a", ""))

    required = [
        "scripts/run-step001-suite.mjs",
        "scripts/run_step003_acceptance.py",
        "scripts/run_step003a_acceptance.py",
        "scripts/sh_run_step003a_acceptance.cmd",
        "scripts/sh_run_step003a_acceptance.sh",
        "scripts/package_step003a.py",
        "docs/plans/STEP003A_DETERMINISTIC_NODE_TEST_REPORTER.md",
        "docs/adrs/ADR-0018-DETERMINISTIC_NODE_TEST_REPORTER.md",
        "reference/validation/STEP003_WINDOWS_DEFAULT_REPORTER_FAILURE.md",
    ]
    for rel in required:
        check(f"required:{rel}", (ROOT / rel).is_file())

    all_manifests = manifests()
    versions = {json.loads(path.read_text(encoding="utf-8")).get("version") for path in all_manifests}
    check("manifest-count", len(all_manifests) == 25, str(len(all_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))

    suite = (ROOT / "scripts/run-step001-suite.mjs").read_text(encoding="utf-8")
    step003_runner = (ROOT / "scripts/run_step003_acceptance.py").read_text(encoding="utf-8")
    check("suite-explicit-tap-reporter", '"--test-reporter=tap"' in suite)
    check("suite-default-reporter-zero", '"--test", ...unitTests' not in suite)
    check("suite-shell-false", "shell: false" in suite)
    check("suite-platform-shell-zero", "shell: process.platform" not in suite)
    check("suite-spawn-error-closed", "OPENRILL_SUITE_SPAWN_FAILED" in suite and "result.error" in suite)
    check("suite-no-color", 'NO_COLOR: "1"' in suite and 'NODE_DISABLE_COLORS: "1"' in suite)
    check("suite-python-utf8", 'PYTHONUTF8: "1"' in suite and 'PYTHONIOENCODING: "utf-8"' in suite)
    check("suite-deterministic-marker", "OPENRILL_STEP001_SUITE_PASS unit_files=${unitTests.length} reporter=TAP" in suite)
    check("step003-requires-tap-marker", "OPENRILL_STEP001_SUITE_PASS unit_files=14 reporter=TAP" in step003_runner)
    check("step003-requires-test-total", '"# tests 65" in output' in step003_runner)
    check("step003-requires-pass-total", '"# pass 65" in output' in step003_runner)
    check("step003-requires-fail-zero", '"# fail 0" in output' in step003_runner)
    check("step003-default-glyph-zero", "ℹ tests 29" not in step003_runner)

    plan = (ROOT / "docs/plans/STEP003A_DETERMINISTIC_NODE_TEST_REPORTER.md").read_text(encoding="utf-8")
    for heading in (
        "## 목적", "## 기준선", "## Reference Evidence", "## 원인", "## 구현 범위",
        "## 공개 계약", "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 패키징 산출물", "## 제외",
    ):
        check(f"step003a-heading:{heading}", heading in plan)
    check("plan-windows-output", "ℹ tests 29" in plan and "# tests 29" in plan)
    check("plan-explicit-reporter", "--test-reporter=tap" in plan)

    cmd = (ROOT / "scripts/sh_run_step003a_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd and b"\n" not in cmd.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd and b"run_step003a_acceptance.py" in cmd)
    check("posix-launcher", (ROOT / "scripts/sh_run_step003a_acceptance.sh").is_file())

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    check(
        "explicit-tap-suite-live",
        ok
        and "OPENRILL_STEP001_SUITE_PASS unit_files=14 reporter=TAP" in output
        and "# tests 65" in output
        and "# pass 65" in output
        and "# fail 0" in output,
        "suite_pass" if ok else output[-6000:],
    )

    ok, output = run_utf8(["python", "scripts/run_step003_acceptance.py"], cwd=ROOT)
    check(
        "step003-regression",
        ok and "checks=141/141 state=PASSED" in output,
        "step003_pass" if ok else output[-6000:],
    )

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [
        path for path in ROOT.rglob("*")
        if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})
    ]
    check("protected-payload-zero", not protected, ",".join(path.name for path in protected[:5]))

    clean_generated()
    generated = [
        path.relative_to(ROOT).as_posix() for path in ROOT.rglob("*")
        if any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)
    ]
    check("generated-cleanup", not generated, ",".join(generated[:5]))

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines: list[str] = []
    for name, ok, detail in checks:
        line = f"[{'PASS' if ok else 'FAIL'}] {name}"
        if detail:
            line += f" :: {detail}"
        lines.append(line)
    lines.append(
        f"{STEP} checks={passed}/{len(checks)} state={state} "
        "reporter=TAP shell=FALSE platform_output=STABLE"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
