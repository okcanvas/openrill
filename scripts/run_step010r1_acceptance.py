from __future__ import annotations

import ast
import json
import re
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP010R1_ACCEPTANCE_REPORT.txt"
VERSION = "0.10.1-step010r1"
STEP = "STEP010R1_WINDOWS_SYMLINK_CAPABILITY_AND_SUITE_DIAGNOSTICS"
SCHEMA = 7


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def clean() -> None:
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
    return sorted(result)


def implicit_text_io() -> list[str]:
    failures: list[str] = []
    for path in sorted((ROOT / "scripts").glob("*.py")):
        tree = ast.parse(read_utf8(path), filename=path.as_posix())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            if node.func.attr not in {"read_text", "write_text"}:
                continue
            if not any(keyword.arg == "encoding" for keyword in node.keywords):
                failures.append(f"{path.name}:{node.lineno}:{node.func.attr}")
    return failures


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check("step010r1-script", scripts.get("acceptance:step010r1") == "python scripts/run_step010r1_acceptance.py")
    check(
        "step010r1-package-script",
        scripts.get("package:step010r1")
        == "python scripts/package_step010r1.py --output ../openrill-step010r1-windows-symlink-capability-suite-diagnostics-v1.zip",
    )

    required = [
        "tests/unit/skills-step010.test.mjs",
        "scripts/run_step010_acceptance.py",
        "scripts/run_step010r1_acceptance.py",
        "scripts/sh_run_step010r1_acceptance.cmd",
        "scripts/sh_run_step010r1_acceptance.sh",
        "scripts/package_step010r1.py",
        "docs/plans/STEP010R1_WINDOWS_SYMLINK_CAPABILITY_AND_SUITE_DIAGNOSTICS.md",
        "reference/validation/STEP010_WINDOWS_FILE_SYMLINK_SKIP_FAILURE.md",
        "reference/validation/STEP010_SUITE_PREDICATE_DIAGNOSTIC_MASKING.md",
        "docs/governance/ENGINEERING_ISSUE_REGISTRY.md",
        "docs/testing/RECURRENCE_PREVENTION_GATES.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    package_manifests = manifests()
    versions = {json.loads(read_utf8(path)).get("version") for path in package_manifests}
    check("manifest-count", len(package_manifests) == 26, str(len(package_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))

    generator = read_utf8(ROOT / "scripts/generate_package_manifest.py")
    verifier = read_utf8(ROOT / "scripts/verify_package_manifest.py")
    generated = json.loads(read_utf8(ROOT / "PACKAGE_MANIFEST.json"))
    for label, source in (("generator", generator), ("verifier", verifier)):
        check(f"package-manifest-{label}-step", f'STEP = "{STEP}"' in source)
        check(f"package-manifest-{label}-version", f'VERSION = "{VERSION}"' in source)
    check(
        "package-manifest-generated-identity",
        generated.get("step") == STEP and generated.get("version") == VERSION,
        f"{generated.get('step')} {generated.get('version')}",
    )

    tests = read_utf8(ROOT / "tests/unit/skills-step010.test.mjs")
    symlink_section = tests.split('test("resource symlink escape is rejected"', 1)[1].split('\ntest("workspace precedence', 1)[0]
    check("symlink-fixture-no-skip", "t.skip" not in symlink_section and "async (t)" not in symlink_section)
    check("symlink-fixture-windows-junction", 'process.platform === "win32" ? "junction" : "dir"' in symlink_section)
    check("symlink-fixture-directory-target", 'const outsideDirectory = join(f.root, "outside-resource")' in symlink_section)
    check("symlink-fixture-nested-resource", "resources/escape/outside.md" in symlink_section)
    check("file-symlink-fixture-zero", '"file"' not in symlink_section)

    step010_acceptance = read_utf8(ROOT / "scripts/run_step010_acceptance.py")
    check("suite-full-predicate", "suite_contract_ok = (" in step010_acceptance)
    check("suite-skipped-zero", 'and "# skipped 0" in output' in step010_acceptance)
    check("suite-outcome-full-predicate", '"build-unit-architecture-exports",\n        suite_contract_ok,' in step010_acceptance)
    check("suite-detail-full-predicate", '"suite_pass" if suite_contract_ok else output[-8000:]' in step010_acceptance)
    check("suite-detail-child-exit-only-zero", '"suite_pass" if ok else' not in step010_acceptance)

    issue_registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(1, 33):
        check(f"issue-registry:OR-ISSUE-{number:03d}", f"OR-ISSUE-{number:03d}" in issue_registry)
    for filename in (
        "STEP010_WINDOWS_FILE_SYMLINK_SKIP_FAILURE.md",
        "STEP010_SUITE_PREDICATE_DIAGNOSTIC_MASKING.md",
        "STEP010R1_FOCUSED_TEST_BUILD_PREREQUISITE.md",
    ):
        text = read_utf8(ROOT / "reference/validation" / filename)
        check(
            f"issue-detail:{filename}",
            all(
                heading in text
                for heading in (
                    "## Exact symptom",
                    "## Code-confirmed root cause",
                    "## Impact",
                    "## Fix",
                    "## Detailed evidence",
                    "## Recurrence-prevention gate",
                )
            ),
        )
    check("recurrence:cross-platform-filesystem", "### Cross-platform filesystem capability fixtures" in recurrence)
    check("recurrence:aggregate-suite-diagnostics", "### Aggregate suite predicate diagnostics" in recurrence)
    check("recurrence:focused-build-prerequisite", "### Compiled focused-test prerequisites" in recurrence)

    plan = read_utf8(ROOT / "docs/plans/STEP010R1_WINDOWS_SYMLINK_CAPABILITY_AND_SUITE_DIAGNOSTICS.md")
    for heading in (
        "## 목적",
        "## 기준선",
        "## Windows 실패 증거",
        "## 코드 확인",
        "## 구현 범위",
        "## 공개 계약",
        "## 상태 전이",
        "## 실패 및 복구",
        "## Acceptance",
        "## 반복 방지 기록",
        "## 패키징 산출물",
        "## 제외",
        "## 완료 선언",
    ):
        check(f"plan-heading:{heading}", heading in plan)

    baseline_files = ["README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"]
    for filename in baseline_files:
        text = read_utf8(ROOT / filename)
        check(f"baseline-step:{filename}", "STEP010R1" in text)
        check(f"baseline-version:{filename}", VERSION in text or filename == "ROADMAP.md")
        check(f"baseline-step010-failure:{filename}", "STEP010" in text and "246/247" in text)
        check(f"baseline-next:{filename}", "STEP010A" in text)
    active_docs = "\n".join(read_utf8(ROOT / filename) for filename in baseline_files)
    check("step010r1-windows-pending", "STEP010R1 Windows live" in active_docs and "PENDING" in active_docs)

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    windows = (ROOT / "scripts/sh_run_step010r1_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in windows and b"\n" not in windows.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in windows)
    check("posix-launcher", (ROOT / "scripts/sh_run_step010r1_acceptance.sh").is_file())

    step010r1_source = read_utf8(ROOT / "scripts/run_step010r1_acceptance.py")
    check("focused-build-before-test", step010r1_source.index('"scripts/workspace-runner.mjs", "build"') < step010r1_source.index('"--test", "--test-reporter=tap"'))

    focused_build_ok, focused_build_output = run_utf8(
        ["node", "scripts/workspace-runner.mjs", "build"],
        cwd=ROOT,
    )
    focused_ok = False
    focused_output = ""
    if focused_build_ok:
        focused_ok, focused_output = run_utf8(
            ["node", "--test", "--test-reporter=tap", "tests/unit/skills-step010.test.mjs"],
            cwd=ROOT,
        )
    focused_contract_ok = (
        focused_build_ok
        and focused_ok
        and "# tests 11" in focused_output
        and "# pass 11" in focused_output
        and "# fail 0" in focused_output
        and "# skipped 0" in focused_output
    )
    focused_detail = (
        "skill_tests_pass"
        if focused_contract_ok
        else (focused_build_output + "\n" + focused_output)[-8000:]
    )
    check("focused-skill-tests", focused_contract_ok, focused_detail)

    regression_ok, regression_output = run_utf8(["python", "scripts/run_step010_acceptance.py"], cwd=ROOT)
    regression_marker = (
        f"{STEP} checks=247/247 state=PASSED schema=7 skills=DISCOVERED snapshot=IMMUTABLE"
    )
    regression_contract_ok = regression_ok and regression_marker in regression_output
    check(
        "step010-full-regression",
        regression_contract_ok,
        "step010_pass" if regression_contract_ok else regression_output[-8000:],
    )

    check(
        "database-files-zero",
        not any(ROOT.rglob("*.db"))
        and not any(ROOT.rglob("*.db-wal"))
        and not any(ROOT.rglob("*.db-shm")),
    )
    check(
        "runtime-files-zero",
        not any(
            path.name in {"host.lock", "host.json", "config.mutation.lock"}
            for path in ROOT.rglob("*")
        ),
    )
    protected = [
        path
        for path in ROOT.rglob("*")
        if path.is_file()
        and (
            path.name in {".env", ".env.local"}
            or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"}
        )
    ]
    check("protected-payload-zero", not protected)
    report_text = read_utf8(REPORT) if REPORT.exists() else ""
    check(
        "secret-value-not-reported",
        "Bearer " not in report_text
        and re.search(r"(?i)(api[_-]?key|secret)\s*[:=]\s*\S+", report_text) is None,
    )

    clean()
    generated_paths = [
        path
        for path in ROOT.rglob("*")
        if "node_modules" not in path.relative_to(ROOT).parts
        and any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)
    ]
    check(
        "generated-cleanup",
        not generated_paths,
        json.dumps([str(path.relative_to(ROOT)) for path in generated_paths[:20]]),
    )

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [
        f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "")
        for name, outcome, detail in checks
    ]
    lines.append(
        f"{STEP} checks={passed}/{len(checks)} state={state} "
        "schema=7 symlink=JUNCTION_OR_DIRECTORY_LINK diagnostics=FULL_PREDICATE"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
