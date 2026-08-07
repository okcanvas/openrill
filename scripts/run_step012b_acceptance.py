from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP012B_AUTOMATION_SCHEDULER_LIFECYCLE_LEASE_AND_RECOVERY"
RELEASE_STEP = "STEP012DR1_HOST_READY_AND_UI_BOOTSTRAP_PHASE_ALIGNMENT"
VERSION = "0.12.7-step012dr1"
SCHEMA = int(re.search(r"OPENRILL_STATE_SCHEMA_VERSION = (\d+) as const", (ROOT / "packages/state/src/migrations.ts").read_text(encoding="utf-8")).group(1))
ACCEPTED_STEP = "STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS"
ACCEPTED_SHA256 = "1f038edc3c21bf9ddff233fc079df80dd18289231d30045c84595e8ec0c6e257"
ACCEPTED_MARKER = (
    "STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS checks=163/163 state=PASSED "
    "schema=8 reports=ARTIFACT_ISOLATED manifest=PRE_POST_VERIFIED diagnostics=CHANGED_PATHS "
    "feature=STEP012A schedules=AT_INTERVAL_CRON timezone=IANA dst=SKIP_GAP_REPEAT_INSTANT "
    "config_runtime=SEPARATED run_identity=UNIQUE browser_regression=CHROMIUM"
)
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP012B_ACCEPTANCE_REPORT.txt")
PACKAGED_REPORT = ROOT / "reference/validation/STEP012B_ACCEPTANCE_REPORT.txt"
PACKAGED_ACCEPTED_REPORT = ROOT / "reference/validation/STEP012AR1_ACCEPTANCE_REPORT.txt"


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
        "apps/*/package.json", "services/*/package.json", "packages/*/package.json",
        "connectors/*/package.json", "skills/*/package.json",
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
    failure_index = next((i for i, line in enumerate(lines) if line.startswith("not ok ")), None)
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
        marker = re.search(r"STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS checks=\d+/\d+ state=FAILED[^\r\n]*", output)
        if not marker:
            marker = re.search(r"STEP011_CONTROL_UI_VERTICAL_SLICE checks=\d+/\d+ state=FAILED[^\r\n]*", output)
        return f"{marker.group(0) if marker else 'nested browser regression state=FAILED'} prerequisite=runtime_unavailable"
    if "not ok " in output:
        return extract_tap_failure(output)
    browser_start = output.find("OPENRILL_BROWSER_EVIDENCE_BEGIN")
    browser_end = output.find("OPENRILL_BROWSER_EVIDENCE_END", browser_start + 1) if browser_start >= 0 else -1
    if browser_start >= 0 and browser_end >= 0:
        return output[browser_start:browser_end + len("OPENRILL_BROWSER_EVIDENCE_END")][-24000:]
    lines = output.splitlines()
    failure = next((i for i, line in enumerate(lines) if line.startswith("[FAIL] ")), None)
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
    check("step012b-script", scripts.get("acceptance:step012b") == "python scripts/run_step012b_acceptance.py")
    check(
        "step012b-package-script",
        scripts.get("package:step012b") == "python scripts/package_step012b.py --output ../openrill-step012b-automation-scheduler-lifecycle-lease-recovery-v1.zip",
    )

    required = [
        "packages/automation/src/scheduler.ts",
        "packages/automation/src/errors.ts",
        "packages/automation/src/types.ts",
        "packages/automation/src/index.ts",
        "packages/automation/README.md",
        "packages/state/src/automation-repository.ts",
        "services/agent-host/src/lifecycle.ts",
        "services/agent-host/package.json",
        "tests/unit/automation-scheduler-step012b.test.mjs",
        "tests/unit/automation-step012a.test.mjs",
        "scripts/run_step012b_acceptance.py",
        "scripts/sh_run_step012b_acceptance.cmd",
        "scripts/sh_run_step012b_acceptance.sh",
        "scripts/package_step012b.py",
        "docs/plans/STEP012B_AUTOMATION_SCHEDULER_LIFECYCLE_LEASE_AND_RECOVERY.md",
        "docs/plans/STEP012_AUTOMATION_SCHEDULER.md",
        "reference/validation/STEP012AR1_WINDOWS_LIVE_ACCEPTED.md",
        "reference/validation/STEP012AR1_ACCEPTANCE_REPORT.txt",
        "reference/validation/STEP012B_ACCEPTANCE_REPORT.txt",
        "reference/validation/STEP012B_HISTORICAL_MANIFEST_FIXTURE_IDENTITY_DRIFT.md",
        "reference/validation/STEP012B_HOST_READINESS_METADATA_WRITE_AFTER_CLOSE.md",
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
    generated = json.loads(read_utf8(ROOT / "PACKAGE_MANIFEST.json")) if (ROOT / "PACKAGE_MANIFEST.json").exists() else {}
    for label, source in (("generator", generator), ("verifier", verifier)):
        check(f"package-manifest-{label}-step", f'STEP = "{RELEASE_STEP}"' in source)
        check(f"package-manifest-{label}-version", f'VERSION = "{VERSION}"' in source)
    check(
        "package-manifest-generated-identity",
        generated.get("step") == RELEASE_STEP and generated.get("version") == VERSION,
        f"{generated.get('step')} {generated.get('version')}",
    )

    scheduler = read_utf8(ROOT / "packages/automation/src/scheduler.ts")
    repository = read_utf8(ROOT / "packages/state/src/automation-repository.ts")
    types = read_utf8(ROOT / "packages/automation/src/types.ts")
    errors = read_utf8(ROOT / "packages/automation/src/errors.ts")
    automation_index = read_utf8(ROOT / "packages/automation/src/index.ts")
    host = read_utf8(ROOT / "services/agent-host/src/lifecycle.ts")
    host_package = json.loads(read_utf8(ROOT / "services/agent-host/package.json"))
    lockfile = read_utf8(ROOT / "pnpm-lock.yaml")
    test_source = read_utf8(ROOT / "tests/unit/automation-scheduler-step012b.test.mjs")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")

    check("schema-owner-current", f"OPENRILL_STATE_SCHEMA_VERSION = {SCHEMA} as const" in read_utf8(ROOT / "packages/state/src/migrations.ts") and SCHEMA >= 8)
    check("migration-nine-zero", not (ROOT / "packages/state/migrations/009_automation_scheduler.sql").exists())
    check("scheduler-exported", 'export { AutomationScheduler, type AutomationSchedulerOptions } from "./scheduler.js"' in automation_index)
    check("scheduler-types-exported", all(token in automation_index for token in ("AutomationExecutionContext", "AutomationExecutionResult", "AutomationSchedulerStatus", "AutomationSchedulerWakeResult")))
    check("scheduler-errors", all(token in errors for token in ("AUTOMATION_SCHEDULER_NOT_STARTED", "AUTOMATION_SCHEDULER_CLOSED", "AUTOMATION_LEASE_LOST")))
    check("scheduler-injected-executor", "readonly executor: (context: AutomationExecutionContext) => Promise<AutomationExecutionResult>" in scheduler)
    check("scheduler-start-wake-close", all(token in scheduler for token in ("public async start(): Promise<void>", "public wake(): Promise<AutomationSchedulerWakeResult>", "public close(): Promise<void>")))
    check("scheduler-timer-unref", "this.#timer.unref?.()" in scheduler and "renewTimer.unref?.()" in scheduler)
    check("scheduler-wake-single-flight", "#wakePromise" in scheduler and "if (this.#wakePromise) return this.#wakePromise" in scheduler)
    check("scheduler-close-idempotent", "#closePromise" in scheduler and "if (this.#closePromise) return this.#closePromise" in scheduler)
    check("scheduler-close-awaits-wake", "await this.#wakePromise" in scheduler)

    check("due-materialization-owned", "public materializeDueJob" in repository)
    check("due-expected-cursor", "current.nextScheduledFor !== input.expectedNextScheduledFor" in repository and "next_scheduled_for = ?" in repository)
    check("due-enabled-conditional", "WHERE job_id = ? AND enabled = 1 AND next_scheduled_for = ?" in repository)
    check("claim-pending-only", "WHERE automation_run_id = ? AND status = 'PENDING'" in repository)
    check("claim-attempt-increment", "attempt = attempt + 1" in repository)
    check("running-owner-expiry", "status = 'CLAIMED'" in repository and "lease_owner = ? AND lease_expires_at >= ?" in repository)
    check("renew-owner-expiry", "status IN ('CLAIMED', 'RUNNING')" in repository and repository.count("lease_owner = ? AND lease_expires_at >= ?") >= 2)
    check("finish-owner-expiry", "current.leaseOwner !== input.leaseOwner" in repository and "current.leaseExpiresAt < input.terminalAt" in repository)
    check("finish-clears-lease", "claimed_at = NULL, lease_owner = NULL, lease_expires_at = NULL" in repository)
    check("finish-runtime-transaction", "consecutive_failures = 0" in repository and "consecutive_failures = consecutive_failures + 1" in repository)
    check("recover-expired-only", "status IN ('CLAIMED', 'RUNNING') AND lease_expires_at <= ?" in repository)
    check("recover-claim-requeue", "SET status = 'PENDING'" in repository and "status = 'CLAIMED' AND lease_expires_at <= ?" in repository)
    check("recover-running-fail", "AUTOMATION_INTERRUPTED_BY_RESTART" in repository and "status = 'RUNNING' AND lease_expires_at <= ?" in repository)
    check("next-wake-pending-first", "SELECT 1 AS present FROM automation_runs WHERE status = 'PENDING'" in repository)

    check("catchup-skip", 'policy.kind === "SKIP"' in scheduler and "AUTOMATION_CATCH_UP_SKIPPED" in scheduler)
    check("catchup-run-once", 'policy.kind === "RUN_ONCE"' in scheduler and "pending: [first]" in scheduler)
    check("catchup-bounded", "pending.length < policy.limit" in scheduler and "cursor = nextAfterNow(row, now)" in scheduler)
    check("regular-one-occurrence", "function regularPlan" in scheduler and "pending: [first]" in scheduler)
    check("claim-transactional-path", "repositories.automations.claimRun" in scheduler)
    check("lease-renewal-path", "repositories.automations.renewRunLease" in scheduler)
    check("terminal-path", "repositories.automations.finishRun" in scheduler)
    check("lease-loss-fail-closed", scheduler.count("AUTOMATION_LEASE_LOST") >= 4)
    check("executor-throw-durable-failure", "AUTOMATION_EXECUTOR_ERROR" in scheduler)
    check("run-limits-bounded", "DEFAULT_DUE_JOB_LIMIT = 100" in scheduler and "DEFAULT_RUN_LIMIT = 100" in scheduler)

    check("host-automation-dependency", host_package.get("dependencies", {}).get("@openrill/automation") == "workspace:*")
    check("lock-automation-dependency", "services/agent-host:" in lockfile and "'@openrill/automation':" in lockfile)
    check("host-executor-option", "readonly automationExecutor?:" in host)
    check("host-scheduler-composition", "let executor = options.automationExecutor" in host and "automationScheduler = new AutomationScheduler" in host and "state: stateDatabase, executor, ownerId" in host)
    check("host-enabled-fail-closed", "automation.enabled requires either configured model providers or an injected Automation executor" in host and "if (options.config?.automation.enabled && !automationScheduler)" in host)
    check("host-start-await", "await automationScheduler?.start()" in host)
    close_index = host.find("await automationScheduler?.close();")
    run_close_index = host.find("await runCoordinator?.close();")
    process_close_index = host.find("await processManager?.close();")
    state_close_index = host.find('stateDatabase.close({ checkpointMode: "TRUNCATE" })')
    check("host-close-order", -1 not in (close_index, run_close_index, process_close_index, state_close_index) and close_index < run_close_index < process_close_index < state_close_index)
    check("host-readiness-owned", "let readinessTask: Promise<void> | null = null" in host and "readinessTask = (async () =>" in host)
    check("host-readiness-close-quiescence", "cancelReadinessDelay();" in host and "await readinessTask?.catch(() => undefined);" in host)
    check("host-metadata-write-serialized", "metadataWriteTail" in host and "const snapshot = getPrivateMetadata()" in host)
    check("host-ready-rejection-observed", "void ready.catch(() => undefined);" in host)

    check("boundary-no-protocol-import", "@openrill/protocol" not in scheduler)
    check("boundary-no-conversation-import", "@openrill/conversations" not in scheduler)
    check("boundary-no-model-import", not re.search(r'@openrill/model-', scheduler))
    check("boundary-no-ui-import", "apps/agent-web" not in scheduler)
    protocol_sources = "\n".join(read_utf8(path) for path in sorted((ROOT / "packages/protocol/src").glob("*.ts")))
    browser_sources = "\n".join(read_utf8(path) for path in sorted((ROOT / "apps/agent-web/src").glob("*.ts")))
    check("boundary-no-automation-protocol-op", not re.search(r'operation:\s*"automation\.', protocol_sources))
    check("boundary-no-automation-ui-route", "#/automations" not in browser_sources)
    check("boundary-doc-exclusions", all(token in read_utf8(ROOT / "docs/plans/STEP012B_AUTOMATION_SCHEDULER_LIFECYCLE_LEASE_AND_RECOVERY.md") for token in ("failure backoff", "disable-active", "STEP012C", "STEP012D")))

    check("focused-catchup-source", "startup catch-up applies SKIP, RUN_ONCE, and bounded oldest-first policies" in test_source)
    check("focused-regular-source", "regular wake materializes one due occurrence" in test_source)
    check("focused-renewal-source", "scheduler renews the owned lease" in test_source)
    check("focused-two-owner-source", "two scheduler owners have exactly one transactional claim winner" in test_source)
    check("focused-recovery-source", "restart recovery requeues expired claims and fails interrupted running work" in test_source)
    check("focused-quiescence-source", "async close waits for in-flight executor quiescence" in test_source)
    check("focused-host-source", "Host scheduler is fail-closed without an executor and executes persisted due work when injected" in test_source)
    check("focused-close-before-ready-source", "readyDelayMs: 60_000" in test_source and "Host stopped before readiness" in test_source)
    check("recurrence-step012b", "Transactional due materialization and one-owner claim" in recurrence and "Scheduler lifecycle and Host quiescence" in recurrence and "Historical fixtures derive current package identity" in recurrence)
    check("issue-registry-through-060", "OR-ISSUE-058" in registry and "OR-ISSUE-059" in registry and "OR-ISSUE-060" in registry)
    issue_059 = read_utf8(ROOT / "reference/validation/STEP012B_HISTORICAL_MANIFEST_FIXTURE_IDENTITY_DRIFT.md")
    check("issue-detail-059", "Historical Manifest Fixture Identity Drift" in issue_059 and "currentIdentity" in issue_059)
    report_fixture = read_utf8(ROOT / "tests/unit/acceptance-report-immutability-step012ar1.test.mjs")
    check("historical-fixture-current-identity", "currentIdentity.step" in report_fixture and "currentIdentity.version" in report_fixture)
    check("historical-fixture-release-literal-zero", "0.12.1-step012ar1" not in report_fixture and "0.12.3-step012br1" not in report_fixture)
    issue_060 = read_utf8(ROOT / "reference/validation/STEP012B_HOST_READINESS_METADATA_WRITE_AFTER_CLOSE.md")
    check("issue-detail-060", "Host Readiness Metadata Write After Close" in issue_060 and "readinessTask" in issue_060)

    accepted = read_utf8(ROOT / "reference/validation/STEP012AR1_WINDOWS_LIVE_ACCEPTED.md")
    check("accepted-step-evidence", ACCEPTED_STEP in accepted and "163/163" in accepted and "WINDOWS_LIVE_ACCEPTED" in accepted)
    check("accepted-artifact-sha", ACCEPTED_SHA256 in accepted)
    check("accepted-marker-exact", ACCEPTED_MARKER in accepted)

    plan = read_utf8(ROOT / "docs/plans/STEP012B_AUTOMATION_SCHEDULER_LIFECYCLE_LEASE_AND_RECOVERY.md")
    for heading in (
        "## 목적", "## 기준선", "## 코드 확인", "## 구현 범위", "## 공개 계약", "## 상태 전이",
        "## Catch-up 계약", "## 실패 및 복구", "## Acceptance", "## 반복 방지 기록",
        "## 패키징 산출물", "## 제외", "## 완료 선언",
    ):
        check(f"plan-heading:{heading}", heading in plan)

    stale_patterns = (
        "official baseline remains STEP011R8",
        "Official accepted baseline remains STEP011R8",
        "current_candidate=STEP012AR1",
        "STEP012AR1 is not promoted",
    )
    for filename in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        text = read_utf8(ROOT / filename)
        check(f"baseline-current-release-step:{filename}", RELEASE_STEP in text)
        check(f"baseline-current-version:{filename}", VERSION in text)
        check(f"baseline-step012ar1-history:{filename}", "STEP012AR1" in text)
        check(f"baseline-step012ar1-check-history:{filename}", "163/163" in text)
        check(f"baseline-step012a-feature-history:{filename}", "STEP012A_AUTOMATION_DOMAIN_AND_PERSISTENCE_FOUNDATION" in text)
        check(f"baseline-history:{filename}", "STEP011R8" in text and "198/198" in text)
        check(
            f"baseline-historical-current-claim-zero:{filename}",
            "current_candidate=STEP012B_AUTOMATION_SCHEDULER_LIFECYCLE_LEASE_AND_RECOVERY" not in text
            and "## Current STEP012B contract" not in text,
        )
        check(f"baseline-stale-zero:{filename}", not any(pattern in text for pattern in stale_patterns))

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    cmd_bytes = (ROOT / "scripts/sh_run_step012b_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd_bytes and b"\n" not in cmd_bytes.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd_bytes)
    check("posix-launcher", 'cd "$SCRIPT_DIR/.."' in read_utf8(ROOT / "scripts/sh_run_step012b_acceptance.sh"))

    initial_manifest_ok, initial_manifest_output = run_utf8(["python", "scripts/verify_package_manifest.py"])
    check("package-manifest-initial", initial_manifest_ok and "OPENRILL_PACKAGE_MANIFEST_PASS" in initial_manifest_output, initial_manifest_output.strip())

    build_ok, build_output = run_utf8(["node", "scripts/workspace-runner.mjs", "build"])
    check("focused-build", build_ok and "OPENRILL_WORKSPACE_BUILD_PASS" in build_output, "build_pass" if build_ok else stable_failure(build_output))

    step012a_ok, step012a_output = run_utf8([
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/automation-step012a.test.mjs",
    ])
    step012a_contract = bool(
        step012a_ok and re.search(r"# tests 14(?:\r?\n)", step012a_output)
        and re.search(r"# pass 14(?:\r?\n)", step012a_output)
        and re.search(r"# fail 0(?:\r?\n)", step012a_output)
        and re.search(r"# skipped 0(?:\r?\n)", step012a_output)
    )
    check("focused-step012a-regression", step012a_contract, "step012a_tests_pass" if step012a_contract else stable_failure(step012a_output))

    focused_ok, focused_output = run_utf8([
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/automation-scheduler-step012b.test.mjs",
    ])
    focused_contract = bool(
        focused_ok and re.search(r"# tests 10(?:\r?\n)", focused_output)
        and re.search(r"# pass 10(?:\r?\n)", focused_output)
        and re.search(r"# fail 0(?:\r?\n)", focused_output)
        and re.search(r"# skipped 0(?:\r?\n)", focused_output)
    )
    check("focused-scheduler-tests", focused_contract, "scheduler_tests_pass" if focused_contract else stable_failure(focused_output))

    suite_ok, suite_output = run_utf8(["node", "scripts/run-step001-suite.mjs"])
    tests_match = re.search(r"# tests (\d+)(?:\r?\n)", suite_output)
    pass_match = re.search(r"# pass (\d+)(?:\r?\n)", suite_output)
    current_unit_files = len(list((ROOT / "tests/unit").glob("*.test.mjs")))
    suite_contract = bool(
        suite_ok and tests_match and pass_match and tests_match.group(1) == pass_match.group(1)
        and int(tests_match.group(1)) >= 190
        and re.search(r"# fail 0(?:\r?\n)", suite_output)
        and re.search(r"# skipped 0(?:\r?\n)", suite_output)
        and f"OPENRILL_STEP001_SUITE_PASS unit_files={current_unit_files} reporter=TAP concurrency=1" in suite_output
        and "OPENRILL_ARCHITECTURE_PASS" in suite_output
        and "OPENRILL_PACKAGE_EXPORT_PASS" in suite_output
    )
    check("canonical-suite", suite_contract, "suite_pass" if suite_contract else extract_tap_failure(suite_output))

    accepted_report_hash_before = hashlib.sha256(PACKAGED_ACCEPTED_REPORT.read_bytes()).hexdigest()
    nested_report_relative = ".artifacts/nested/STEP012AR1_ACCEPTANCE_REPORT.txt"
    regression_ok, regression_output = run_utf8(
        ["python", "scripts/run_step012ar1_acceptance.py"],
        env={"OPENRILL_ACCEPTANCE_REPORT_PATH": nested_report_relative},
    )
    accepted_report_hash_after = hashlib.sha256(PACKAGED_ACCEPTED_REPORT.read_bytes()).hexdigest()
    nested_report = ROOT / nested_report_relative
    marker = re.search(
        r"STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS checks=163/163 state=PASSED schema=8 "
        r"reports=ARTIFACT_ISOLATED manifest=PRE_POST_VERIFIED diagnostics=CHANGED_PATHS feature=STEP012A "
        r"schedules=AT_INTERVAL_CRON timezone=IANA dst=SKIP_GAP_REPEAT_INSTANT config_runtime=SEPARATED "
        r"run_identity=UNIQUE browser_regression=CHROMIUM",
        regression_output,
    )
    regression_pass = bool(regression_ok and marker)
    check("step012ar1-full-regression", regression_pass, "step012ar1_pass" if regression_pass else stable_failure(regression_output))
    check("nested-step012ar1-report-artifact", nested_report.is_file(), nested_report_relative)
    check(
        "nested-step012ar1-packaged-report-immutable",
        accepted_report_hash_before == accepted_report_hash_after,
        f"before={accepted_report_hash_before} after={accepted_report_hash_after}",
    )

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
        "scheduler=WAKE_TIMER claim=TRANSACTIONAL lease=RENEWED "
        "recovery=CLAIM_REQUEUE_RUNNING_FAIL catch_up=SKIP_RUN_ONCE_BOUNDED "
        "shutdown=ASYNC_QUIESCENT executor=INJECTED_FAIL_CLOSED "
        "protocol_ui=DEFERRED browser_regression=CHROMIUM"
    )
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
