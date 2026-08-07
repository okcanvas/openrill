from __future__ import annotations

import ast
import json
import os
import re
import hashlib
import shutil
import subprocess
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS"
RELEASE_STEP = "STEP012DR1_HOST_READY_AND_UI_BOOTSTRAP_PHASE_ALIGNMENT"
VERSION = "0.12.7-step012dr1"
SCHEMA = int(re.search(r"OPENRILL_STATE_SCHEMA_VERSION = (\d+) as const", (ROOT / "packages/state/src/migrations.ts").read_text(encoding="utf-8")).group(1))
ACCEPTED_STEP = "STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS"
ACCEPTED_SHA256 = "1f038edc3c21bf9ddff233fc079df80dd18289231d30045c84595e8ec0c6e257"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP012AR1_ACCEPTANCE_REPORT.txt")
PACKAGED_REPORT = ROOT / "reference/validation/STEP012AR1_ACCEPTANCE_REPORT.txt"
PACKAGED_STEP011_REPORT = ROOT / "reference/validation/STEP011_ACCEPTANCE_REPORT.txt"


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def run_utf8(command: list[str], *, env: dict[str, str] | None = None) -> tuple[bool, str]:
    process_env = os.environ.copy()
    process_env.update({
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
        "NO_COLOR": "1",
        "NODE_DISABLE_COLORS": "1",
        "TERM": "dumb",
    })
    if env:
        process_env.update(env)
    completed = subprocess.run(
        command,
        cwd=ROOT,
        env=process_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return completed.returncode == 0, completed.stdout.decode("utf-8", errors="replace")


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


def extract_tap_failure(output: str) -> str:
    lines = output.splitlines()
    failure_index = next((index for index, line in enumerate(lines) if line.startswith("not ok ")), None)
    if failure_index is None:
        return output[-16000:]
    start = failure_index
    if start > 0 and lines[start - 1].startswith("# Subtest:"):
        start -= 1
    while start > 0 and lines[start - 1].startswith("# Error:"):
        start -= 1
    end = len(lines)
    for index in range(failure_index + 1, len(lines)):
        if lines[index].startswith("# Subtest:"):
            end = index
            break
    summary = [
        line for line in lines
        if line.startswith(("1..", "# tests ", "# pass ", "# fail ", "# cancelled ", "# skipped ", "# todo ", "# duration_ms "))
    ][-8:]
    return "\n".join(["OPENRILL_TAP_FAILURE_BEGIN", *lines[start:end], "OPENRILL_TAP_FAILURE_END", *summary])[-24000:]


def stable_failure(output: str) -> str:
    if "runtime_unavailable" in output:
        marker = re.search(r"STEP011_CONTROL_UI_VERTICAL_SLICE checks=\d+/\d+ state=FAILED[^\r\n]*", output)
        return f"{marker.group(0) if marker else 'STEP011 state=FAILED'} prerequisite=runtime_unavailable"
    browser_start = output.find("OPENRILL_BROWSER_EVIDENCE_BEGIN")
    browser_end = output.find("OPENRILL_BROWSER_EVIDENCE_END", browser_start + 1) if browser_start >= 0 else -1
    approval_end = output.find("OPENRILL_APPROVAL_WAIT_EVIDENCE_END", browser_end + 1) if browser_end >= 0 else -1
    if browser_start >= 0 and approval_end >= 0:
        return output[browser_start:approval_end + len("OPENRILL_APPROVAL_WAIT_EVIDENCE_END")][-24000:]
    if browser_start >= 0 and browser_end >= 0:
        return output[browser_start:browser_end + len("OPENRILL_BROWSER_EVIDENCE_END")][-24000:]
    if "not ok " in output:
        return extract_tap_failure(output)
    lines = output.splitlines()
    failure = next((index for index, line in enumerate(lines) if line.startswith("[FAIL] ")), None)
    if failure is not None:
        return "\n".join(lines[max(0, failure - 1):])[-24000:]
    return output[-16000:]


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check("step012ar1-script", scripts.get("acceptance:step012ar1") == "python scripts/run_step012ar1_acceptance.py")
    check(
        "step012ar1-package-script",
        scripts.get("package:step012ar1") == "python scripts/package_step012ar1.py --output ../openrill-step012ar1-acceptance-report-immutability-manifest-diagnostics-v1.zip",
    )

    required = [
        "packages/automation/src/errors.ts",
        "packages/automation/src/types.ts",
        "packages/automation/src/schedule.ts",
        "packages/automation/src/service.ts",
        "packages/automation/src/index.ts",
        "packages/state/migrations/008_automation_domain_persistence.sql",
        "packages/state/src/automation-repository.ts",
        "tests/unit/automation-step012a.test.mjs",
        "scripts/run_step012a_acceptance.py",
        "scripts/sh_run_step012a_acceptance.cmd",
        "scripts/sh_run_step012a_acceptance.sh",
        "scripts/package_step012a.py",
        "scripts/acceptance_reports.py",
        "scripts/run_step012ar1_acceptance.py",
        "scripts/sh_run_step012ar1_acceptance.cmd",
        "scripts/sh_run_step012ar1_acceptance.sh",
        "scripts/package_step012ar1.py",
        "tests/unit/acceptance-report-immutability-step012ar1.test.mjs",
        "docs/plans/STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS.md",
        "reference/validation/STEP012A_WINDOWS_PACKAGE_MANIFEST_POST_REGRESSION_MUTATION.md",
        "reference/validation/STEP012AR1_ACCEPTANCE_REPORT.txt",
        "docs/plans/STEP012A_AUTOMATION_DOMAIN_AND_PERSISTENCE_FOUNDATION.md",
        "reference/validation/STEP011R8_WINDOWS_LIVE_ACCEPTED.md",
        "reference/validation/STEP011_POST_ACCEPTANCE_BASELINE_DOCUMENT_CLOSURE_GAP.md",
        "docs/governance/POST_ACCEPTANCE_CLOSURE_GOVERNANCE.md",
        "docs/validation/STEP011_FAILURE_HISTORY_AND_PREVENTION_MATRIX.md",
        "docs/governance/ENGINEERING_ISSUE_REGISTRY.md",
        "docs/testing/RECURRENCE_PREVENTION_GATES.md",
        "reference/validation/STEP012A_NESTED_STEP011_SUITE_INVENTORY_DRIFT.md",
        "reference/validation/STEP012A_HISTORICAL_LIVE_SCHEMA_LITERAL_DRIFT.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    package_manifests = manifests()
    versions = {json.loads(read_utf8(path)).get("version") for path in package_manifests}
    check("manifest-count", len(package_manifests) == 26, str(len(package_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))

    generator = read_utf8(ROOT / "scripts/generate_package_manifest.py")
    verifier = read_utf8(ROOT / "scripts/verify_package_manifest.py")
    generated = json.loads(read_utf8(ROOT / "PACKAGE_MANIFEST.json")) if (ROOT / "PACKAGE_MANIFEST.json").exists() else {}
    for label, source in (("generator", generator), ("verifier", verifier)):
        check(f"package-manifest-{label}-step", f'STEP = "{RELEASE_STEP}"' in source)
        check(f"package-manifest-{label}-version", f'VERSION = "{VERSION}"' in source)
    check(
        "package-manifest-generated-identity",
        generated.get("step") == RELEASE_STEP and generated.get("version") == VERSION,
        f"{generated.get('step')} {generated.get('version')}",
    )

    migrations = read_utf8(ROOT / "packages/state/src/migrations.ts")
    migration = read_utf8(ROOT / "packages/state/migrations/008_automation_domain_persistence.sql")
    repository = read_utf8(ROOT / "packages/state/src/automation-repository.ts")
    state_index = read_utf8(ROOT / "packages/state/src/index.ts")
    state_repository = read_utf8(ROOT / "packages/state/src/repository.ts")
    schedule = read_utf8(ROOT / "packages/automation/src/schedule.ts")
    service = read_utf8(ROOT / "packages/automation/src/service.ts")
    types = read_utf8(ROOT / "packages/automation/src/types.ts")
    automation_test = read_utf8(ROOT / "tests/unit/automation-step012a.test.mjs")

    check("schema-owner-current", f"OPENRILL_STATE_SCHEMA_VERSION = {SCHEMA} as const" in migrations and SCHEMA >= 8)
    check("migration-inventory-eight", 'migrations[7].name, "automation_domain_persistence"' in automation_test)
    check("automation-jobs-strict", "CREATE TABLE automation_jobs" in migration and ") STRICT;" in migration)
    check("automation-runs-strict", "CREATE TABLE automation_runs" in migration and migration.count(") STRICT;") >= 2)
    check("automation-run-unique-occurrence", "UNIQUE (job_id, scheduled_for)" in migration)
    check("automation-due-index", "idx_automation_jobs_due" in migration and "next_scheduled_for" in migration)
    check("automation-lease-consistency", "lease_expires_at >= claimed_at" in migration)
    check("state-repository-owned", "readonly automations: StateAutomationRepository" in state_repository)
    check("state-export-owned", "automation-repository.js" in state_index)
    check("config-update-revision", "WHERE job_id = ? AND revision = ?" in repository and "revision = revision + 1" in repository)
    runtime_section = repository[repository.find("public updateJobRuntime"):repository.find("public insertRun")]
    check("runtime-update-revision-zero", "revision" not in runtime_section)
    check("occurrence-insert-idempotent", "ON CONFLICT(job_id, scheduled_for) DO NOTHING" in repository)

    check("schedule-kinds", all(token in types for token in ('kind: "at"', 'kind: "interval"', 'kind: "cron"')))
    check("at-explicit-offset", "RFC3339 timestamp with Z or an explicit offset" in schedule)
    check("at-calendar-validation", "at schedule date is invalid" in schedule)
    check("interval-anchor-arithmetic", "elapsed = after - schedule.anchorMs" in schedule and "Math.floor(elapsed / schedule.everyMs) + 1" in schedule)
    check("cron-five-field", "cron expression must contain exactly five fields" in schedule)
    check("cron-vixie-or", "return dayOfMonthMatch || dayOfWeekMatch" in schedule)
    check("cron-sunday-seven", "normalizeDow" in schedule and "0, 7, \"day-of-week\"" in schedule)
    check("timezone-iana-intl", "new Intl.DateTimeFormat" in schedule and "invalid IANA timezone" in schedule)
    check("dst-executable-fixtures", "DST spring gaps" in automation_test and "fall repeated wall minutes" in automation_test)
    check("disabled-past-enabled-future", "disabled one-shot jobs may preserve a past absolute schedule" in automation_test and "if (!enabled)" in service)
    check("service-config-runtime-separation", "public update(" in service and "public updateRuntime(" in service)
    check("service-no-timers", not re.search(r"\bset(?:Timeout|Interval)\s*\(", schedule + service))
    check("service-no-model-protocol-ui", not re.search(r"@openrill/(?:agent-kernel|conversations|model-|web)", schedule + service))
    check("actual-two-writer-gate", "two simultaneous SQLite writers have one scheduled_for winner" in automation_test and "new Worker" in automation_test)

    accepted = read_utf8(ROOT / "reference/validation/STEP012AR1_WINDOWS_LIVE_ACCEPTED.md")
    closure = read_utf8(ROOT / "reference/validation/STEP011_POST_ACCEPTANCE_BASELINE_DOCUMENT_CLOSURE_GAP.md")
    governance = read_utf8(ROOT / "docs/governance/POST_ACCEPTANCE_CLOSURE_GOVERNANCE.md")
    matrix = read_utf8(ROOT / "docs/validation/STEP011_FAILURE_HISTORY_AND_PREVENTION_MATRIX.md")
    registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    check("accepted-step-evidence", ACCEPTED_STEP in accepted and "163/163" in accepted and "WINDOWS_LIVE_ACCEPTED" in accepted)
    check("accepted-artifact-sha", ACCEPTED_SHA256 in accepted)
    check("accepted-marker-exact", "reports=ARTIFACT_ISOLATED" in accepted and "browser_regression=CHROMIUM" in accepted)
    check("failure-matrix-through-054", "OR-ISSUE-037" in matrix and "OR-ISSUE-054" in matrix)
    check("issue-registry-055", "OR-ISSUE-055" in registry)
    check("issue-detail-055", "POST_ACCEPTANCE_BASELINE_DOCUMENT_CLOSURE_GAP" in closure)
    check("closure-governance", "accepted ZIP" in governance and "separate closure" in governance)
    check("recurrence-post-acceptance", "Immutable accepted artifact and baseline promotion" in recurrence)
    check("recurrence-step012a", "Automation schedule semantics" in recurrence and "Automation persistence and mutation separation" in recurrence)
    nested_runner = read_utf8(ROOT / "scripts/run_step011_acceptance.py")
    check("issue-registry-056", "OR-ISSUE-056" in registry)
    check("issue-detail-056", "Nested STEP011 Suite Inventory Drift" in read_utf8(ROOT / "reference/validation/STEP012A_NESTED_STEP011_SUITE_INVENTORY_DRIFT.md"))
    check("nested-suite-dynamic-inventory", 'current_unit_files = len(list((ROOT / "tests/unit").glob("*.test.mjs")))' in nested_runner)
    check("nested-suite-tap-equality", 'tests_match.group(1) == pass_match.group(1)' in nested_runner and 'int(tests_match.group(1)) >= 176' in nested_runner)
    check("nested-suite-stale-174-zero", '# tests 174' not in nested_runner and '# pass 174' not in nested_runner)
    shared_live_sources = [read_utf8(ROOT / f"scripts/run-step{step}-live.mjs") for step in ("008", "009", "010")]
    check("issue-registry-057", "OR-ISSUE-057" in registry)
    check("issue-detail-057", "Historical Live Schema Literal Drift" in read_utf8(ROOT / "reference/validation/STEP012A_HISTORICAL_LIVE_SCHEMA_LITERAL_DRIFT.md"))
    check("historical-live-schema-owner", all('OPENRILL_STATE_SCHEMA_VERSION' in source and '../packages/state/dist/index.js' in source for source in shared_live_sources))
    check("historical-live-schema-literal-zero", all('schemaVersion !== 7' not in source and 'schemaVersion === 7' not in source and 'LIVE_PASS schema=7' not in source for source in shared_live_sources))
    issue_058 = read_utf8(ROOT / "reference/validation/STEP012A_WINDOWS_PACKAGE_MANIFEST_POST_REGRESSION_MUTATION.md")
    report_helper = read_utf8(ROOT / "scripts/acceptance_reports.py")
    current_source = read_utf8(ROOT / "scripts/run_step012ar1_acceptance.py")
    check("issue-registry-058", "OR-ISSUE-058" in registry)
    check("issue-detail-058", "Package Manifest Post-Regression Mutation" in issue_058 and "declared=650 actual=650" in issue_058)
    check("recurrence-report-immutability", "Acceptance report immutability" in recurrence)
    check("report-path-owner", "OPENRILL_ACCEPTANCE_REPORT_PATH" in report_helper and "resolve_acceptance_report" in report_helper)
    check("nested-report-isolation-source", ".artifacts/nested/STEP011_ACCEPTANCE_REPORT.txt" in current_source)
    check("current-report-isolation-source", ".artifacts/acceptance/STEP012AR1_ACCEPTANCE_REPORT.txt" in current_source)
    check("manifest-diagnostic-source", "changed_paths=" in verifier and "missing_paths=" in verifier and "extra_paths=" in verifier)

    plan = read_utf8(ROOT / "docs/plans/STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS.md")
    for heading in (
        "## 목적", "## 기준선", "## 코드 확인", "## 구현 범위", "## 시간 계약", "## 영속성 계약",
        "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 반복 방지 기록", "## 패키징 산출물",
        "## 제외", "## 완료 선언",
    ):
        check(f"plan-heading:{heading}", heading in plan)

    stale_patterns = ("STEP011R8 Windows validation candidate", "official accepted baseline remains STEP010AR1")
    for filename in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        text = read_utf8(ROOT / filename)
        check(f"baseline-current-step:{filename}", RELEASE_STEP in text)
        check(f"baseline-current-version:{filename}", VERSION in text)
        check(f"baseline-ar1-step-history:{filename}", "STEP012AR1" in text)
        check(f"baseline-ar1-check-history:{filename}", "163/163" in text)
        check(f"baseline-ar1-feature-history:{filename}", "STEP012A_AUTOMATION_DOMAIN_AND_PERSISTENCE_FOUNDATION" in text)
        check(f"baseline-previous-history:{filename}", "STEP011R8" in text and "198/198" in text)
        check(
            f"baseline-historical-current-claim-zero:{filename}",
            "current_candidate=STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS" not in text
            and "## Current STEP012AR1 contract" not in text,
        )
        check(f"baseline-stale-zero:{filename}", not any(pattern in text for pattern in stale_patterns))

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    cmd_bytes = (ROOT / "scripts/sh_run_step012ar1_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd_bytes and b"\n" not in cmd_bytes.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd_bytes)
    check("posix-launcher", 'cd "$SCRIPT_DIR/.."' in read_utf8(ROOT / "scripts/sh_run_step012ar1_acceptance.sh"))

    initial_manifest_ok, initial_manifest_output = run_utf8(["python", "scripts/verify_package_manifest.py"])
    check("package-manifest-initial", initial_manifest_ok and "OPENRILL_PACKAGE_MANIFEST_PASS" in initial_manifest_output, initial_manifest_output.strip())

    build_ok, build_output = run_utf8(["node", "scripts/workspace-runner.mjs", "build"])
    check("focused-build", build_ok and "OPENRILL_WORKSPACE_BUILD_PASS" in build_output, "build_pass" if build_ok else stable_failure(build_output))

    focused_ok, focused_output = run_utf8([
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/automation-step012a.test.mjs",
    ])
    focused_contract = bool(
        focused_ok
        and re.search(r"# tests 14(?:\r?\n)", focused_output)
        and re.search(r"# pass 14(?:\r?\n)", focused_output)
        and re.search(r"# fail 0(?:\r?\n)", focused_output)
        and re.search(r"# skipped 0(?:\r?\n)", focused_output)
    )
    check("focused-automation-tests", focused_contract, "automation_tests_pass" if focused_contract else stable_failure(focused_output))

    report_focused_ok, report_focused_output = run_utf8([
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/acceptance-report-immutability-step012ar1.test.mjs",
    ])
    report_focused_contract = bool(
        report_focused_ok
        and re.search(r"# tests 4(?:\r?\n)", report_focused_output)
        and re.search(r"# pass 4(?:\r?\n)", report_focused_output)
        and re.search(r"# fail 0(?:\r?\n)", report_focused_output)
        and re.search(r"# skipped 0(?:\r?\n)", report_focused_output)
    )
    check("focused-report-immutability-tests", report_focused_contract, "report_immutability_tests_pass" if report_focused_contract else stable_failure(report_focused_output))

    suite_ok, suite_output = run_utf8(["node", "scripts/run-step001-suite.mjs"])
    tests_match = re.search(r"# tests (\d+)(?:\r?\n)", suite_output)
    pass_match = re.search(r"# pass (\d+)(?:\r?\n)", suite_output)
    current_unit_files = len(list((ROOT / "tests/unit").glob("*.test.mjs")))
    suite_contract = bool(
        suite_ok
        and tests_match
        and pass_match
        and tests_match.group(1) == pass_match.group(1)
        and int(tests_match.group(1)) >= 180
        and re.search(r"# fail 0(?:\r?\n)", suite_output)
        and re.search(r"# skipped 0(?:\r?\n)", suite_output)
        and f"OPENRILL_STEP001_SUITE_PASS unit_files={current_unit_files} reporter=TAP concurrency=1" in suite_output
        and "OPENRILL_ARCHITECTURE_PASS" in suite_output
        and "OPENRILL_PACKAGE_EXPORT_PASS" in suite_output
    )
    check("canonical-suite", suite_contract, "suite_pass" if suite_contract else extract_tap_failure(suite_output))

    packaged_step011_hash_before = hashlib.sha256(PACKAGED_STEP011_REPORT.read_bytes()).hexdigest()
    nested_report_relative = ".artifacts/nested/STEP011_ACCEPTANCE_REPORT.txt"
    regression_ok, regression_output = run_utf8(
        ["python", "scripts/run_step011_acceptance.py"],
        env={"OPENRILL_ACCEPTANCE_REPORT_PATH": nested_report_relative},
    )
    nested_report = ROOT / nested_report_relative
    packaged_step011_hash_after = hashlib.sha256(PACKAGED_STEP011_REPORT.read_bytes()).hexdigest()
    marker = re.search(
        rf"STEP011_CONTROL_UI_VERTICAL_SLICE checks=(\d+)/(\d+) state=PASSED schema={SCHEMA} framework=VUE_3 browser=CHROMIUM",
        regression_output,
    )
    regression_pass = bool(regression_ok and marker and marker.group(1) == marker.group(2))
    check("step011-full-regression", regression_pass, "step011_pass" if regression_pass else stable_failure(regression_output))
    check("nested-step011-report-artifact", nested_report.is_file(), nested_report_relative)
    check("nested-step011-packaged-report-immutable", packaged_step011_hash_before == packaged_step011_hash_after, f"before={packaged_step011_hash_before} after={packaged_step011_hash_after}")

    manifest_ok, manifest_output = run_utf8(["python", "scripts/verify_package_manifest.py"])
    check("package-manifest-final", manifest_ok and "OPENRILL_PACKAGE_MANIFEST_PASS" in manifest_output, manifest_output.strip())

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [
        path for path in ROOT.rglob("*")
        if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})
    ]
    check("protected-payload-zero", not protected)
    report_text = read_utf8(PACKAGED_REPORT) if PACKAGED_REPORT.exists() else ""
    check("secret-value-not-reported", "Bearer " not in report_text and re.search(r"(?i)(api[_-]?key|secret)\s*[:=]\s*\S+", report_text) is None)

    clean()
    generated_paths = [
        path for path in ROOT.rglob("*")
        if "node_modules" not in path.relative_to(ROOT).parts
        and any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)
    ]
    check("generated-cleanup", not generated_paths, json.dumps([str(path.relative_to(ROOT)) for path in generated_paths[:20]]))

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, outcome, detail in checks]
    lines.append(
        f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} "
        "reports=ARTIFACT_ISOLATED manifest=PRE_POST_VERIFIED diagnostics=CHANGED_PATHS "
        "feature=STEP012A schedules=AT_INTERVAL_CRON timezone=IANA dst=SKIP_GAP_REPEAT_INSTANT "
        "config_runtime=SEPARATED run_identity=UNIQUE browser_regression=CHROMIUM"
    )
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
