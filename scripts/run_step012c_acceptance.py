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
STEP = "STEP012C_AUTOMATION_PROTOCOL_AND_CONVERSATION_RUN_INTEGRATION"
RELEASE_STEP = "STEP012DR1_HOST_READY_AND_UI_BOOTSTRAP_PHASE_ALIGNMENT"
VERSION = "0.12.7-step012dr1"
SCHEMA = int(re.search(r"OPENRILL_STATE_SCHEMA_VERSION = (\d+) as const", (ROOT / "packages/state/src/migrations.ts").read_text(encoding="utf-8")).group(1))
ACCEPTED_STEP = "STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP"
ACCEPTED_SHA256 = "b90721d4d24f7467355f1f2dcd7e94d65f03517a7f60ff8208fa0c915f6ccbde"
ACCEPTED_MARKER = (
    "STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP checks=187/187 state=PASSED schema=8 "
    "scope=HISTORICAL_BASELINE_DELEGATED scheduler=WAKE_TIMER claim=TRANSACTIONAL lease=RENEWED "
    "recovery=CLAIM_REQUEUE_RUNNING_FAIL catch_up=SKIP_RUN_ONCE_BOUNDED shutdown=ASYNC_QUIESCENT "
    "executor=INJECTED_FAIL_CLOSED protocol_ui=DEFERRED browser_regression=CHROMIUM"
)
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP012C_ACCEPTANCE_REPORT.txt")
PACKAGED_REPORT = ROOT / "reference/validation/STEP012C_ACCEPTANCE_REPORT.txt"
PACKAGED_ACCEPTED_REPORT = ROOT / "reference/validation/STEP012BR1_ACCEPTANCE_REPORT.txt"
BROWSER_REGRESSION_MODE = os.environ.get("OPENRILL_BROWSER_REGRESSION_MODE", "chromium")


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
        marker = re.search(r"STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP checks=\d+/\d+ state=FAILED[^\r\n]*", output)
        if not marker:
            marker = re.search(r"STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS checks=\d+/\d+ state=FAILED[^\r\n]*", output)
        if not marker:
            marker = re.search(r"STEP011_CONTROL_UI_VERTICAL_SLICE checks=\d+/\d+ state=FAILED[^\r\n]*", output)
        detail = marker.group(0) if marker else "nested browser regression state=FAILED"
        return detail if "prerequisite=runtime_unavailable" in detail else f"{detail} prerequisite=runtime_unavailable"
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
    check("step012c-script", scripts.get("acceptance:step012c") == "python scripts/run_step012c_acceptance.py")
    check(
        "step012c-package-script",
        scripts.get("package:step012c") == "python scripts/package_step012c.py --output ../openrill-step012c-automation-protocol-conversation-run-integration-v1.zip",
    )

    required = [
        "packages/state/migrations/009_automation_protocol_run_linkage.sql",
        "packages/state/src/automation-repository.ts",
        "packages/automation/src/types.ts",
        "packages/automation/src/service.ts",
        "packages/automation/src/scheduler.ts",
        "packages/protocol/src/automation-operations.ts",
        "packages/protocol/src/validation.ts",
        "services/agent-host/src/transport/operation-registry.ts",
        "services/agent-host/src/transport/protocol-server.ts",
        "services/agent-host/src/automation-conversation-executor.ts",
        "services/agent-host/src/run-coordinator.ts",
        "services/agent-host/src/lifecycle.ts",
        "tests/unit/automation-protocol-step012c.test.mjs",
        "tests/unit/historical-schema-owner-step012c.test.mjs",
        "scripts/run_step012c_acceptance.py",
        "scripts/sh_run_step012c_acceptance.cmd",
        "scripts/sh_run_step012c_acceptance.sh",
        "scripts/package_step012c.py",
        "docs/plans/STEP012C_AUTOMATION_PROTOCOL_AND_CONVERSATION_RUN_INTEGRATION.md",
        "docs/plans/STEP012_AUTOMATION_SCHEDULER.md",
        "reference/validation/STEP012BR1_WINDOWS_LIVE_ACCEPTED.md",
        "reference/validation/STEP012BR1_ACCEPTANCE_REPORT.txt",
        "reference/validation/STEP012C_ACCEPTANCE_REPORT.txt",
        "reference/validation/STEP012C_HISTORICAL_SCHEMA_OWNER_SCOPE_GAP.md",
        "reference/validation/STEP012C_UNBOUNDED_VUE_ACQUISITION_WAIT.md",
        "reference/validation/STEP012C_HISTORICAL_ACCEPTED_BASELINE_DOCUMENT_OWNERSHIP_DRIFT.md",
        "reference/validation/STEP012C_HISTORICAL_DEFERRED_EXECUTOR_COMPOSITION_DRIFT.md",
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

    migrations = read_utf8(ROOT / "packages/state/src/migrations.ts")
    migration = read_utf8(ROOT / "packages/state/migrations/009_automation_protocol_run_linkage.sql")
    repository = read_utf8(ROOT / "packages/state/src/automation-repository.ts")
    state_index = read_utf8(ROOT / "packages/state/src/index.ts")
    automation_types = read_utf8(ROOT / "packages/automation/src/types.ts")
    automation_service = read_utf8(ROOT / "packages/automation/src/service.ts")
    scheduler = read_utf8(ROOT / "packages/automation/src/scheduler.ts")
    automation_index = read_utf8(ROOT / "packages/automation/src/index.ts")
    protocol_types = read_utf8(ROOT / "packages/protocol/src/automation-operations.ts")
    protocol_validation = read_utf8(ROOT / "packages/protocol/src/validation.ts")
    protocol_index = read_utf8(ROOT / "packages/protocol/src/index.ts")
    registry_source = read_utf8(ROOT / "services/agent-host/src/transport/operation-registry.ts")
    protocol_server = read_utf8(ROOT / "services/agent-host/src/transport/protocol-server.ts")
    executor = read_utf8(ROOT / "services/agent-host/src/automation-conversation-executor.ts")
    coordinator = read_utf8(ROOT / "services/agent-host/src/run-coordinator.ts")
    host = read_utf8(ROOT / "services/agent-host/src/lifecycle.ts")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")

    check("schema-version-nine", "OPENRILL_STATE_SCHEMA_VERSION = 9 as const" in migrations)
    check("migration-inventory-nine", (ROOT / "packages/state/migrations/009_automation_protocol_run_linkage.sql").is_file() and len(list((ROOT / "packages/state/migrations").glob("*.sql"))) == 9)
    check("migration-trigger-kind", "ADD COLUMN trigger_kind" in migration and "SCHEDULED" in migration and "MANUAL" in migration)
    check("migration-request-key", "ADD COLUMN request_key" in migration and "length(request_key) BETWEEN 1 AND 128" in migration)
    check("migration-manual-request-unique", "CREATE UNIQUE INDEX idx_automation_runs_manual_request" in migration and "WHERE request_key IS NOT NULL" in migration)
    check("run-trigger-export", "AutomationRunTriggerKind" in automation_types and "AutomationRunTriggerKind" in automation_index and "LedgerAutomationRunTriggerKind" in state_index)
    check("run-request-fields", all(token in automation_types for token in ("readonly triggerKind", "readonly requestKey", "bindRunId", "readonly signal")))
    check("repository-run-select-fields", "trigger_kind AS triggerKind" in repository and "request_key AS requestKey" in repository)
    check("repository-manual-replay", "public reserveManualRun" in repository and "getRunByRequestKey" in repository and "automation manual request conflict" in repository)
    check("repository-collision-safe", repository.count("scheduledFor += 1") >= 2 and "automation manual occurrence collision limit exceeded" in repository)
    check("repository-bind-owner", "public bindRunId" in repository and "current.leaseOwner !== input.leaseOwner" in repository)
    check("repository-bind-nonexpired", "status = 'RUNNING'" in repository and "lease_expires_at >= ?" in repository and "run_id IS NULL" in repository)
    check("repository-finish-preserves-link", "run_id = COALESCE(?, run_id)" in repository)
    check("service-run-now", "public runNow" in automation_service and "reserveManualRun" in automation_service)
    check("service-request-conflict", "AUTOMATION_REQUEST_CONFLICT" in read_utf8(ROOT / "packages/automation/src/errors.ts"))

    operation_names = ("automation.create", "automation.list", "automation.get", "automation.update", "automation.run_now", "automation.history")
    check("protocol-types-exported", all(token in protocol_types for token in ("AutomationCreateInput", "AutomationUpdateInput", "AutomationRunNowInput", "AutomationHistoryInput")) and 'from "./automation-operations.js"' in protocol_index and "AutomationRunNowInput" in protocol_index)
    check("protocol-validators-exported", all(token in protocol_index for token in ("validateAutomationCreateInput", "validateAutomationListInput", "validateAutomationGetInput", "validateAutomationUpdateInput", "validateAutomationRunNowInput", "validateAutomationHistoryInput")))
    check("protocol-closed-create", "automation.create input must be a closed object" in protocol_validation and "hasExactKeys" in protocol_validation)
    check("protocol-closed-update", "automation.update input must be a closed object" in protocol_validation and "invalid automation.update patch" in protocol_validation)
    check("protocol-closed-run-now", "invalid automation.run_now input" in protocol_validation and '["jobId", "requestKey"]' in protocol_validation)
    check("protocol-operations-six", all(f'name: "{name}"' in registry_source for name in operation_names))
    check("protocol-permissions", 'permission: "automation.read"' in registry_source and 'permission: "automation.write"' in registry_source and 'permission: "automation.execute"' in registry_source)
    check("protocol-error-mapping", "AutomationError" in registry_source and "AUTOMATION_REQUEST_CONFLICT" in registry_source)
    check("protocol-hooks", "export interface AutomationOperationHooks" in registry_source and "automationHooks" in protocol_server)
    check("protocol-notice-capabilities", '"automation.job.updated"' in protocol_server and '"automation.run.updated"' in protocol_server)

    check("executor-conversation-create", "this.options.conversations.create" in executor and "this.options.conversations.send" in executor)
    bind_index = executor.find("context.bindRunId(runId)")
    execute_index = executor.find("executeUntilTerminal(runId)")
    check("executor-pre-execution-bind", -1 not in (bind_index, execute_index) and bind_index < execute_index)
    check("executor-durable-submission", "submissionKey: `automation:${context.run.automationRunId}`" in executor)
    check("executor-terminal-wait", "executeUntilTerminal(runId)" in executor and 'result.status === "COMPLETED"' in executor)
    check("executor-abort-cancel", 'context.signal.addEventListener("abort"' in executor and "this.options.coordinator.cancel(runId)" in executor)
    check("coordinator-terminal-waiters", "#terminalWaiters" in coordinator and "executeUntilTerminal" in coordinator)
    check("coordinator-approval-aware", 'result.status === "WAITING_APPROVAL"' in coordinator and "#settleTerminal" in coordinator)
    check("scheduler-abort-controllers", "#executionControllers" in scheduler and "new AbortController()" in scheduler and "controller.abort()" in scheduler)
    check("scheduler-bind-run-id", "bindRunId: (runId: string)" in scheduler and "repositories.automations.bindRunId" in scheduler)
    check("scheduler-domain-notices", "onRunUpdated" in scheduler)
    check("host-production-executor", "new AutomationConversationExecutor" in host and "configured model providers" in host)
    check("host-automation-hooks", all(f"{name.split('.')[-1].replace('_now','Now')}:" in host for name in ("automation.create", "automation.list", "automation.get", "automation.update", "automation.run_now", "automation.history")))
    check("host-job-notices", host.count('protocol.publishNotice("automation.job.updated"') >= 2)
    check("host-run-notices", host.count('protocol.publishNotice("automation.run.updated"') >= 2)
    check("host-run-now-wake", "automationDefinitions.runNow" in host and "await automationScheduler.wake()" in host)
    check("host-close-order", host.find("await automationScheduler?.close();") < host.find("await runCoordinator?.close();") < host.find("await processManager?.close();") < host.find('stateDatabase.close({ checkpointMode: "TRUNCATE" })'))

    browser_sources = "\n".join(read_utf8(path) for path in sorted((ROOT / "apps/agent-web/src").glob("*.ts")))
    check("boundary-ui-deferred", "#/automations" not in browser_sources and "automation.run_now" not in browser_sources)
    check("boundary-backoff-deferred", "failure backoff/automatic disable" in read_utf8(ROOT / "docs/plans/STEP012C_AUTOMATION_PROTOCOL_AND_CONVERSATION_RUN_INTEGRATION.md"))
    check("boundary-event-trigger-deferred", "event-driven trigger" in read_utf8(ROOT / "docs/plans/STEP012C_AUTOMATION_PROTOCOL_AND_CONVERSATION_RUN_INTEGRATION.md"))

    issue_062 = read_utf8(ROOT / "reference/validation/STEP012C_HISTORICAL_SCHEMA_OWNER_SCOPE_GAP.md")
    check("issue-registry-062", "OR-ISSUE-062" in registry)
    check("issue-detail-062", "Historical Schema Owner Scope Gap" in issue_062 and "OPENRILL_STATE_SCHEMA_VERSION" in issue_062)
    check("recurrence-step012c", "Durable manual execution identity" in recurrence and "Pre-execution AutomationRun and AgentRun linkage" in recurrence and "Historical schema ownership" in recurrence)
    check("issue-registry-063", "OR-ISSUE-063" in registry)
    issue_063 = read_utf8(ROOT / "reference/validation/STEP012C_UNBOUNDED_VUE_ACQUISITION_WAIT.md")
    vendor_source = read_utf8(ROOT / "scripts/vendor-vue-runtime.mjs")
    check("issue-detail-063", "Unbounded Vue Acquisition Wait" in issue_063 and "AbortSignal.timeout" in issue_063)
    check("vendor-acquisition-bounded", "VUE_DOWNLOAD_TIMEOUT_MS = 15_000" in vendor_source and "signal: AbortSignal.timeout(VUE_DOWNLOAD_TIMEOUT_MS)" in vendor_source)
    check("issue-registry-064", "OR-ISSUE-064" in registry)
    check("issue-registry-065", "OR-ISSUE-065" in registry)
    historical_ar1_source = read_utf8(ROOT / "scripts/run_step012ar1_acceptance.py")
    historical_b_source = read_utf8(ROOT / "scripts/run_step012b_acceptance.py")
    check("historical-ar1-mutable-baseline-zero", "baseline-accepted-step" not in historical_ar1_source and "baseline-accepted-sha" not in historical_ar1_source and "baseline-feature:" not in historical_ar1_source)
    check("historical-b-mutable-baseline-zero", "baseline-accepted-step" not in historical_b_source and "baseline-accepted-sha" not in historical_b_source and "baseline-feature:" not in historical_b_source)
    check("historical-b-composition-invariant", "let executor = options.automationExecutor" in historical_b_source and "executor: options.automationExecutor" not in historical_b_source)
    live_step011 = read_utf8(ROOT / "scripts/run-step011-live.mjs")
    check("historical-live-schema-owner", "OPENRILL_STATE_SCHEMA_VERSION" in live_step011 and "identity.schemaVersion !== OPENRILL_STATE_SCHEMA_VERSION" in live_step011)
    check("historical-live-schema-literal-zero", "identity.schemaVersion !== 8" not in live_step011 and "OPENRILL_STEP011_LIVE_PASS schema=8" not in live_step011)
    historical_runners = [read_utf8(ROOT / relative) for relative in ("scripts/run_step011_acceptance.py", "scripts/run_step012ar1_acceptance.py", "scripts/run_step012b_acceptance.py", "scripts/run_step012br1_acceptance.py")]
    check("historical-runner-schema-owner", all("OPENRILL_STATE_SCHEMA_VERSION = (\\d+) as const" in source and "SCHEMA = 8" not in source for source in historical_runners))

    accepted = read_utf8(ROOT / "reference/validation/STEP012BR1_WINDOWS_LIVE_ACCEPTED.md")
    check("accepted-step-evidence", ACCEPTED_STEP in accepted and "187/187" in accepted and "WINDOWS_LIVE_ACCEPTED" in accepted)
    check("accepted-artifact-sha", ACCEPTED_SHA256 in accepted)
    check("accepted-marker-exact", ACCEPTED_MARKER in accepted)

    plan = read_utf8(ROOT / "docs/plans/STEP012C_AUTOMATION_PROTOCOL_AND_CONVERSATION_RUN_INTEGRATION.md")
    for heading in (
        "## 목적", "## 기준선", "## 코드 확인", "## 구현 범위", "## 공개 계약", "## 상태 전이",
        "## 실패 및 복구", "## Acceptance", "## 반복 방지 기록", "## 패키징 산출물", "## 제외", "## 완료 선언",
    ):
        check(f"plan-heading:{heading}", heading in plan)

    stale_patterns = (
        "current_candidate=STEP012BR1",
        "STEP012BR1 remains a candidate",
        "official_accepted_baseline=STEP012AR1",
    )
    for filename in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        text = read_utf8(ROOT / filename)
        check(f"baseline-current-release-step:{filename}", RELEASE_STEP in text)
        check(f"baseline-step012c-history:{filename}", STEP in text)
        check(f"baseline-current-version:{filename}", VERSION in text)
        check(f"baseline-accepted-step:{filename}", ACCEPTED_STEP in text and "187/187" in text)
        check(f"baseline-accepted-sha:{filename}", ACCEPTED_SHA256 in text)
        check(f"baseline-history:{filename}", "STEP011R8" in text and "198/198" in text)
        check(f"baseline-next:{filename}", "STEP012D" in text)
        check(f"baseline-stale-zero:{filename}", not any(pattern in text for pattern in stale_patterns))

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    cmd_bytes = (ROOT / "scripts/sh_run_step012c_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd_bytes and b"\n" not in cmd_bytes.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd_bytes)
    check("posix-launcher", 'cd "$SCRIPT_DIR/.."' in read_utf8(ROOT / "scripts/sh_run_step012c_acceptance.sh"))

    initial_manifest_ok, initial_manifest_output = run_utf8(["python", "scripts/verify_package_manifest.py"])
    check("package-manifest-initial", initial_manifest_ok and "OPENRILL_PACKAGE_MANIFEST_PASS" in initial_manifest_output, initial_manifest_output.strip())

    build_ok, build_output = run_utf8(["node", "scripts/workspace-runner.mjs", "build"])
    check("focused-build", build_ok and "OPENRILL_WORKSPACE_BUILD_PASS" in build_output, "build_pass" if build_ok else stable_failure(build_output))

    focused_specs = [
        ("focused-step012a-regression", "tests/unit/automation-step012a.test.mjs", 14, "step012a_tests_pass"),
        ("focused-step012b-regression", "tests/unit/automation-scheduler-step012b.test.mjs", 10, "step012b_tests_pass"),
        ("focused-historical-baseline-ownership", "tests/unit/historical-acceptance-baseline-scope-step012br1.test.mjs", 6, "historical_baseline_tests_pass"),
        ("focused-historical-schema-owner", "tests/unit/historical-schema-owner-step012c.test.mjs", 4, "historical_schema_tests_pass"),
        ("focused-step012c-integration", "tests/unit/automation-protocol-step012c.test.mjs", 5, "step012c_tests_pass"),
        ("focused-vendor-timeout", "tests/unit/vue-runtime-vendor-step011.test.mjs", 4, "vendor_timeout_tests_pass"),
    ]
    for label, test_file, expected, success_detail in focused_specs:
        ok, output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", test_file])
        contract = bool(
            ok and re.search(rf"# tests {expected}(?:\r?\n)", output)
            and re.search(rf"# pass {expected}(?:\r?\n)", output)
            and re.search(r"# fail 0(?:\r?\n)", output)
            and re.search(r"# skipped 0(?:\r?\n)", output)
        )
        check(label, contract, success_detail if contract else stable_failure(output))

    suite_ok, suite_output = run_utf8(["node", "scripts/run-step001-suite.mjs"])
    tests_match = re.search(r"# tests (\d+)(?:\r?\n)", suite_output)
    pass_match = re.search(r"# pass (\d+)(?:\r?\n)", suite_output)
    current_unit_files = len(list((ROOT / "tests/unit").glob("*.test.mjs")))
    suite_contract = bool(
        suite_ok and tests_match and pass_match and tests_match.group(1) == pass_match.group(1)
        and int(tests_match.group(1)) >= 206
        and re.search(r"# fail 0(?:\r?\n)", suite_output)
        and re.search(r"# skipped 0(?:\r?\n)", suite_output)
        and f"OPENRILL_STEP001_SUITE_PASS unit_files={current_unit_files} reporter=TAP concurrency=1" in suite_output
        and "OPENRILL_ARCHITECTURE_PASS" in suite_output
        and "OPENRILL_PACKAGE_EXPORT_PASS" in suite_output
    )
    check("canonical-suite", suite_contract, "suite_pass" if suite_contract else extract_tap_failure(suite_output))

    feature_report = ROOT / "reference/validation/STEP012BR1_ACCEPTANCE_REPORT.txt"
    feature_report_hash_before = hashlib.sha256(feature_report.read_bytes()).hexdigest()
    nested_report_relative = ".artifacts/nested/STEP012BR1_ACCEPTANCE_REPORT.txt"
    nested_report = ROOT / nested_report_relative
    if BROWSER_REGRESSION_MODE == "accepted-no-impact":
        no_impact_ok, no_impact_output = run_utf8(["python", "scripts/verify_historical_browser_no_impact.py"])
        nested_report.parent.mkdir(parents=True, exist_ok=True)
        nested_report.write_text(
            ACCEPTED_MARKER + "\n" + no_impact_output.strip() + "\n",
            encoding="utf-8",
        )
        regression_ok = no_impact_ok
        regression_output = no_impact_output
        regression_pass = bool(no_impact_ok and "OPENRILL_HISTORICAL_BROWSER_NO_IMPACT_PASS" in no_impact_output)
        regression_detail = "accepted_baseline_no_impact" if regression_pass else stable_failure(no_impact_output)
    else:
        regression_ok, regression_output = run_utf8(
            ["python", "scripts/run_step012br1_acceptance.py"],
            env={"OPENRILL_ACCEPTANCE_REPORT_PATH": nested_report_relative},
        )
        marker = re.search(
            rf"STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP checks=187/187 state=PASSED schema={SCHEMA} "
            r"scope=HISTORICAL_BASELINE_DELEGATED scheduler=WAKE_TIMER claim=TRANSACTIONAL lease=RENEWED "
            r"recovery=CLAIM_REQUEUE_RUNNING_FAIL catch_up=SKIP_RUN_ONCE_BOUNDED shutdown=ASYNC_QUIESCENT "
            r"executor=INJECTED_FAIL_CLOSED protocol_ui=DEFERRED browser_regression=CHROMIUM",
            regression_output,
        )
        regression_pass = bool(regression_ok and marker)
        regression_detail = "step012br1_pass" if regression_pass else stable_failure(regression_output)
    feature_report_hash_after = hashlib.sha256(feature_report.read_bytes()).hexdigest()
    check("step012br1-full-regression", regression_pass, regression_detail)
    check("nested-step012br1-report-artifact", nested_report.is_file(), nested_report_relative)
    check(
        "nested-step012br1-packaged-report-immutable",
        feature_report_hash_before == feature_report_hash_after,
        f"before={feature_report_hash_before} after={feature_report_hash_after}",
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
        "protocol=CREATE_LIST_GET_UPDATE_RUN_NOW_HISTORY manual_idempotency=DURABLE "
        "run_link=PRE_EXECUTION_LEASE_GUARDED executor=CONVERSATION_RUN notices=DOMAIN_EXPLICIT "
        f"shutdown=ABORT_QUIESCENT ui=DEFERRED browser_regression={'ACCEPTED_BASELINE_NO_IMPACT' if BROWSER_REGRESSION_MODE == 'accepted-no-impact' else 'CHROMIUM'}"
    )
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
