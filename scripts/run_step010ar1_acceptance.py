from __future__ import annotations

import ast
import json
import re
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP010AR1_ACCEPTANCE_REPORT.txt"
VERSION = "0.10.3-step010ar1"
STEP = "STEP010AR1_WINDOWS_UNIT_SUITE_DETERMINISM_AND_FAILURE_EVIDENCE"
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
    check("step010ar1-script", scripts.get("acceptance:step010ar1") == "python scripts/run_step010ar1_acceptance.py")
    check(
        "step010ar1-package-script",
        scripts.get("package:step010ar1")
        == "python scripts/package_step010ar1.py --output ../openrill-step010ar1-windows-unit-suite-determinism-failure-evidence-v1.zip",
    )

    required = [
        "scripts/run-step001-suite.mjs",
        "scripts/run_step010a_acceptance.py",
        "scripts/run_step010ar1_acceptance.py",
        "scripts/sh_run_step010ar1_acceptance.cmd",
        "scripts/sh_run_step010ar1_acceptance.sh",
        "scripts/package_step010ar1.py",
        "docs/plans/STEP010AR1_WINDOWS_UNIT_SUITE_DETERMINISM_AND_FAILURE_EVIDENCE.md",
        "reference/validation/STEP010A_WINDOWS_UNIT_FAILURE_EVIDENCE_TRUNCATION.md",
        "reference/validation/STEP010A_UNIT_FILE_CONCURRENCY_UNDECLARED.md",
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

    suite_runner = read_utf8(ROOT / "scripts/run-step001-suite.mjs")
    check("suite-concurrency-constant", "const UNIT_TEST_CONCURRENCY = 1;" in suite_runner)
    check("suite-concurrency-argument", '`--test-concurrency=${UNIT_TEST_CONCURRENCY}`' in suite_runner)
    check("suite-concurrency-marker", "reporter=TAP concurrency=${UNIT_TEST_CONCURRENCY}" in suite_runner)
    check("suite-unbounded-command-zero", '["--test", "--test-reporter=tap", ...unitTests]' not in suite_runner)

    step010a_acceptance = read_utf8(ROOT / "scripts/run_step010a_acceptance.py")
    check("tap-extractor-defined", "def extract_tap_failure(output: str) -> str:" in step010a_acceptance)
    check("tap-extractor-not-ok", 'line.startswith("not ok ")' in step010a_acceptance)
    check("tap-extractor-boundaries", "OPENRILL_TAP_FAILURE_BEGIN" in step010a_acceptance and "OPENRILL_TAP_FAILURE_END" in step010a_acceptance)
    check("tap-extractor-used", "extract_tap_failure(suite_output)" in step010a_acceptance)
    check("suite-tail-only-zero", "suite_output[-10000:]" not in step010a_acceptance)
    check("synthetic-early-failure-gate", "tap-failure-position-independent" in step010a_acceptance and '"x" * 12000' in step010a_acceptance)

    registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(1, 37):
        check(f"issue-registry:OR-ISSUE-{number:03d}", f"OR-ISSUE-{number:03d}" in registry)
    for issue_filename in (
        "STEP010A_WINDOWS_UNIT_FAILURE_EVIDENCE_TRUNCATION.md",
        "STEP010A_UNIT_FILE_CONCURRENCY_UNDECLARED.md",
    ):
        detail = read_utf8(ROOT / "reference/validation" / issue_filename)
        check(
            f"issue-detail:{issue_filename}",
            all(heading in detail for heading in (
                "## Exact symptom",
                "## Code-confirmed root cause",
                "## Impact",
                "## Fix",
                "## Detailed evidence",
                "## Recurrence-prevention gate",
            )),
        )
    check("recurrence:tap-failure-evidence", "### Position-independent TAP failure evidence" in recurrence)
    check("recurrence:unit-suite-concurrency", "### Deterministic unit-file concurrency" in recurrence)

    plan = read_utf8(ROOT / "docs/plans/STEP010AR1_WINDOWS_UNIT_SUITE_DETERMINISM_AND_FAILURE_EVIDENCE.md")
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
        check(f"baseline-step:{filename}", "STEP010AR1" in text)
        check(f"baseline-version:{filename}", VERSION in text or filename == "ROADMAP.md")
        check(f"baseline-step010a-failure:{filename}", "STEP010A" in text and "251/252" in text and "FAILED" in text)
        check(f"baseline-framework:{filename}", "VUE_3" in text)
        check(f"baseline-next:{filename}", "STEP011" in text)
    active_docs = "\n".join(read_utf8(ROOT / filename) for filename in baseline_files)
    check("step010ar1-windows-pending", "STEP010AR1 Windows live" in active_docs and "PENDING" in active_docs)

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    windows = (ROOT / "scripts/sh_run_step010ar1_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in windows and b"\n" not in windows.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in windows)
    check("posix-launcher", (ROOT / "scripts/sh_run_step010ar1_acceptance.sh").is_file())

    regression_ok, regression_output = run_utf8(["python", "scripts/run_step010a_acceptance.py"], cwd=ROOT)
    regression_marker = re.search(
        r"STEP010A_CONTROL_UI_FRAMEWORK_SELECTION checks=(\d+)/(\d+) state=PASSED schema=7 framework=VUE_3 finalists=2 fixture=SHARED",
        regression_output,
    )
    regression_contract_ok = bool(
        regression_ok
        and regression_marker
        and regression_marker.group(1) == regression_marker.group(2)
        and "[PASS] build-unit-architecture-exports :: suite_pass" in regression_output
        and "[PASS] unit-suite-concurrency-one" in regression_output
        and "[PASS] tap-failure-position-independent" in regression_output
    )
    check("step010a-full-regression", regression_contract_ok, "step010a_pass" if regression_contract_ok else regression_output[-12000:])

    check(
        "database-files-zero",
        not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")),
    )
    check(
        "runtime-files-zero",
        not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")),
    )
    protected = [
        path
        for path in ROOT.rglob("*")
        if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})
    ]
    check("protected-payload-zero", not protected)
    report_text = read_utf8(REPORT) if REPORT.exists() else ""
    check(
        "secret-value-not-reported",
        "Bearer " not in report_text and re.search(r"(?i)(api[_-]?key|secret)\s*[:=]\s*\S+", report_text) is None,
    )

    clean()
    generated_paths = [
        path
        for path in ROOT.rglob("*")
        if "node_modules" not in path.relative_to(ROOT).parts
        and any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)
    ]
    check("generated-cleanup", not generated_paths, json.dumps([str(path.relative_to(ROOT)) for path in generated_paths[:20]]))

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, outcome, detail in checks]
    lines.append(
        f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} concurrency=SERIAL diagnostics=TAP_BLOCK"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
