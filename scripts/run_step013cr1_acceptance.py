from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP013CR1_RESTART_ATTEMPT_POINTER_AND_TYPED_RECOVERY_DIAGNOSTICS"
VERSION = "0.13.10-step013cr1"
SCHEMA = 11
BASELINE = "STEP013B3_BROWSER_ARTIFACTS_AND_BOUNDED_EVIDENCE"
BASELINE_SHA256 = "381e02dd9bf0806bd0810adbe24b3379477ef281e83c04951d80f20ec36f076f"
OPENCLAW_SHA256 = "1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP013CR1_ACCEPTANCE_REPORT.txt")
STAGE_LOG_DIR = REPORT.parent / "STEP013CR1_STAGES"
FAILURE_EXCERPT_LIMIT = 20_000

STAGE_TIMEOUTS = {
    "source-version-alignment": 60,
    "workspace-lock-alignment": 60,
    "workspace-module-links": 60,
    "package-manifest-initial": 120,
    "focused-build": 300,
    "focused-browser-automation-ledger": 180,
    "focused-browser-automation-boundaries": 180,
    "focused-browser-artifacts": 180,
    "focused-browser-artifact-boundaries": 180,
    "focused-browser-interactions": 180,
    "focused-browser-interaction-boundaries": 180,
    "focused-acceptance-stage-evidence": 120,
    "focused-test-reporter": 120,
    "focused-browser-observation": 180,
    "focused-browser-adapter-boundaries": 180,
    "focused-browser-runtime": 180,
    "focused-browser-boundaries": 180,
    "canonical-suite": 900,
    "architecture": 120,
    "exports": 180,
    "browser-live": 180,
    "package-manifest-final": 120,
}


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def stage_log_path(stage: str) -> Path:
    if not re.fullmatch(r"[a-z0-9-]+", stage):
        raise ValueError(f"invalid stage name: {stage}")
    return STAGE_LOG_DIR / f"{stage}.log"


def persist_stage_output(stage: str, output: str) -> Path:
    path = stage_log_path(stage)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(output, encoding="utf-8")
    return path


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def failure_excerpt(stage: str, output: str) -> str:
    log_path = stage_log_path(stage)
    lines = output.splitlines()
    anchor_pattern = re.compile(
        r"^(?:not ok\b|# fail [1-9][0-9]*\b|\s*(?:AssertionError|Error(?: \[[^]]+\])?:|Traceback \(most recent call last\):)|.*OPENRILL_[A-Z0-9_]*(?:FAIL|FAILED))"
    )
    intervals: list[tuple[int, int]] = []
    for index, line in enumerate(lines):
        if anchor_pattern.search(line):
            intervals.append((max(0, index - 3), min(len(lines), index + 45)))

    merged: list[tuple[int, int]] = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    evidence = "\n".join("\n".join(lines[start:end]) for start, end in merged)
    tail = output[-8_000:]
    if not evidence:
        evidence = output[:8_000]
    combined = (
        f"full_stage_log={display_path(log_path)} bytes={len(output.encode('utf-8'))}\n"
        f"OPENRILL_STAGE_FAILURE_EVIDENCE_BEGIN name={stage}\n"
        f"{evidence}\n"
        f"OPENRILL_STAGE_FAILURE_EVIDENCE_END name={stage}\n"
        f"OPENRILL_STAGE_OUTPUT_TAIL_BEGIN name={stage}\n"
        f"{tail}\n"
        f"OPENRILL_STAGE_OUTPUT_TAIL_END name={stage}"
    )
    if len(combined) <= FAILURE_EXCERPT_LIMIT:
        return combined
    prefix = combined[: FAILURE_EXCERPT_LIMIT - 8_000]
    return prefix + "\nOPENRILL_STAGE_EXCERPT_TRUNCATED\n" + combined[-7_960:]


def run_utf8(*, stage: str, command: list[str]) -> tuple[bool, str]:
    env = os.environ.copy()
    env.update({
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
        "NO_COLOR": "1",
        "NODE_DISABLE_COLORS": "1",
        "TERM": "dumb",
    })
    result = run_stage(
        name=stage,
        command=command,
        cwd=ROOT,
        env=env,
        timeout_seconds=STAGE_TIMEOUTS[stage],
    )
    log_path = persist_stage_output(stage, result.output)
    print(
        f"OPENRILL_ACCEPTANCE_STAGE_LOG name={stage} path={display_path(log_path)} "
        f"bytes={len(result.output.encode('utf-8'))}",
        flush=True,
    )
    return result.ok, result.output


def clean() -> None:
    for group in ("apps", "services", "packages", "connectors", "skills"):
        for path in (ROOT / group).glob("*/dist"):
            shutil.rmtree(path, ignore_errors=True)
    shutil.rmtree(ROOT / ".artifacts", ignore_errors=True)
    for path in ROOT.rglob("__pycache__"):
        if "node_modules" not in path.parts:
            shutil.rmtree(path, ignore_errors=True)


def manifests() -> list[Path]:
    result = [ROOT / "package.json"]
    for pattern in (
        "apps/*/package.json", "services/*/package.json", "packages/*/package.json",
        "connectors/*/package.json", "skills/*/package.json",
    ):
        result.extend(ROOT.glob(pattern))
    return sorted(result)


def tap_pass(output: str, expected: int | None = None) -> bool:
    tests = re.search(r"# tests (\d+)(?:\r?\n)", output)
    passed = re.search(r"# pass (\d+)(?:\r?\n)", output)
    return bool(
        tests and passed
        and tests.group(1) == passed.group(1)
        and (expected is None or int(tests.group(1)) == expected)
        and re.search(r"# fail 0(?:\r?\n)", output)
        and re.search(r"# cancelled 0(?:\r?\n)", output)
        and re.search(r"# skipped 0(?:\r?\n)", output)
    )


def main() -> int:
    print("OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal", flush=True)
    clean()
    print("OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal", flush=True)
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("acceptance-script", scripts.get("acceptance:step013cr1") == "python scripts/run_step013cr1_acceptance.py")
    check("package-script", scripts.get("package:step013cr1") == "python scripts/package_step013cr1.py --output ../openrill-step013cr1-restart-attempt-pointer-typed-recovery-diagnostics-v1.zip")

    required = [
        "packages/state/migrations/011_browser_automation_ledger.sql",
        "packages/state/src/browser-repository.ts",
        "packages/state/src/conversation-repository.ts",
        "packages/browser-runtime/src/tools.ts",
        "packages/agent-kernel/src/kernel.ts",
        "packages/automation/src/scheduler.ts",
        "services/agent-host/src/browser-operation-ledger.ts",
        "services/agent-host/src/automation-conversation-executor.ts",
        "services/agent-host/src/lifecycle.ts",
        "scripts/run-step013cr1-host-child.mjs",
        "scripts/run-step013cr1-live.mjs",
        "scripts/run_step013cr1_acceptance.py",
        "scripts/package_step013cr1.py",
        "scripts/sh_run_step013cr1_acceptance.cmd",
        "scripts/sh_run_step013cr1_acceptance.sh",
        "tests/unit/browser-automation-ledger-step013c.test.mjs",
        "tests/unit/browser-automation-boundaries-step013c.test.mjs",
        "docs/contracts/BROWSER_AUTOMATION_AND_RECOVERY.md",
        "docs/plans/STEP013CR1_RESTART_ATTEMPT_POINTER_AND_TYPED_RECOVERY_DIAGNOSTICS.md",
        "docs/validation/STEP013CR1_FAILURE_PREVENTION_AUDIT.md",
        "reference/validation/STEP013B3_WINDOWS_LIVE_ACCEPTANCE.md",
        "reference/validation/STEP013CR1_LOCAL_VALIDATION.md",
        "reference/validation/STEP013C_WINDOWS_LIVE_RESTART_ATTEMPT_POINTER_FAILURE.md",
        "reference/validation/STEP013CR1_RESTART_ATTEMPT_POINTER_CONTRACT_MISMATCH.md",
        "reference/validation/STEP013CR1_TYPED_RECOVERY_DIAGNOSTIC_PRESERVATION.md",
        "reference/validation/STEP013CR1_HISTORICAL_RECOVERY_TEST_NULL_POINTER_FREEZE.md",
        "reference/validation/STEP013CR1_LIVE_ASSERTION_RAW_MESSAGE_DISCLOSURE.md",
        "reference/validation/STEP013C_HISTORICAL_SCHEMA_TOOL_OWNERSHIP_FREEZE.md",
        "reference/validation/STEP013C_POST_CHECKPOINT_MODEL_REQUEST_RECOVERY_MISCLASSIFICATION.md",
        "reference/validation/STEP013C_STARTED_MODEL_INVOCATION_RESTART_STRANDING.md",
        "reference/validation/STEP013C_DURABLE_EVIDENCE_RAW_TEXT_DUPLICATION.md",
        "reference/validation/STEP013C_ROOT_DOCUMENT_ACCEPTED_CHECK_IDENTITY_OMISSION.md",
        "config/current-accepted-baseline.json",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    package_manifests = manifests()
    versions = {json.loads(read_utf8(path)).get("version") for path in package_manifests}
    check("manifest-count", len(package_manifests) == 27, str(len(package_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))

    migrations = read_utf8(ROOT / "packages/state/src/migrations.ts")
    migration_011 = read_utf8(ROOT / "packages/state/migrations/011_browser_automation_ledger.sql")
    browser_repository = read_utf8(ROOT / "packages/state/src/browser-repository.ts")
    conversation_repository = read_utf8(ROOT / "packages/state/src/conversation-repository.ts")
    conversations = read_utf8(ROOT / "packages/conversations/src/service.ts")
    kernel = read_utf8(ROOT / "packages/agent-kernel/src/kernel.ts")
    automation_repository = read_utf8(ROOT / "packages/state/src/automation-repository.ts")
    automation_executor = read_utf8(ROOT / "services/agent-host/src/automation-conversation-executor.ts")
    ledger = read_utf8(ROOT / "services/agent-host/src/browser-operation-ledger.ts")
    lifecycle = read_utf8(ROOT / "services/agent-host/src/lifecycle.ts")
    tools = read_utf8(ROOT / "packages/browser-runtime/src/tools.ts")
    operation_registry = read_utf8(ROOT / "services/agent-host/src/transport/operation-registry.ts")
    live = read_utf8(ROOT / "scripts/run-step013cr1-live.mjs")
    child = read_utf8(ROOT / "scripts/run-step013cr1-host-child.mjs")

    registered = re.findall(r'tool\(\s*"(browser\.[a-z]+)"', tools)
    expected_tools = [
        "browser.status", "browser.open", "browser.list", "browser.navigate", "browser.snapshot", "browser.close",
        "browser.click", "browser.type", "browser.press", "browser.select", "browser.fill", "browser.wait",
        "browser.screenshot", "browser.download", "browser.evidence",
    ]
    check("schema-11", "OPENRILL_STATE_SCHEMA_VERSION = 11 as const" in migrations)
    check("migration-011-tables", all(f"CREATE TABLE {name}" in migration_011 for name in ("browser_operations", "browser_operation_events", "browser_evidence_events")))
    check("migration-operation-states", all(f"'{status}'" in migration_011 for status in ("STARTED", "SUCCEEDED", "FAILED", "INTERRUPTED")))
    check("migration-tool-call-identity", "ON browser_operations(run_id, tool_call_id)" in migration_011)
    check("migration-no-raw-input", "input_sha256" in migration_011 and not any(token in migration_011 for token in ("input_json", "arguments_json", "raw_input")))
    check("browser-tools-retained-fifteen", registered == expected_tools, json.dumps(registered))
    check("browser-protocol-zero", "browser." not in operation_registry)
    check("browser-ledger-repository", all(token in browser_repository for token in ("beginOperation", "completeOperation", "recoverInterruptedOperations", "insertEvidenceEvents")))
    check("browser-ledger-wrapper", all(token in tools for token in ("inputSha256: sha256(input)", "options.ledger!.begin", "options.ledger!.complete")))
    check("ledger-url-redaction", all(token in ledger for token in ('parsed.username = ""', 'parsed.password = ""', 'parsed.hash = ""', 'parsed.search = parsed.search ? "?redacted" : ""')))
    check("ledger-evidence-digest", 'createHash("sha256")' in ledger and "durableEvidencePayload" in ledger and "payload: durableEvidencePayload(event, kind)" in ledger)
    check("model-invocation-recovery", "MODEL_INTERRUPTED_BY_RESTART" in conversation_repository and "recoverStartedModelInvocations" in conversations)
    check("checkpoint-safe-window", 'SAFE_AFTER_CHECKPOINT = new Set(["model.requested", "model.retry"])' in conversations and "hasRecoverableCheckpoint(events)" in conversations)
    check("tool-checkpoints", all(token in kernel for token in ('eventType: "run.checkpoint"', 'kind: "tool.completed"', 'kind: "tool.replayed"', 'checkpoint:tool:')))
    check("automation-resumable-requeue", 'linked?.recoveryState === "RESUMABLE"' in automation_repository and 'linked.status === "CREATED" || linked.status === "WAITING_APPROVAL"' in automation_repository)
    check("automation-run-identity-resume", 'let runId: string | null = context.run.runId' in automation_executor and 'automation.run.resuming' in automation_executor)
    recovery_block = conversations.split("public recoverIncompleteRuns()", 1)[1].split("public events(runId", 1)[0]
    check("recovery-aborted-attempt-pointer-retained", "const currentAttemptId = run.currentAttemptId" in recovery_block and "currentAttemptId = null" not in recovery_block)
    check("start-execution-aborted-rollover", 'attempt.status === "ABORTED"' in conversations and "nextAttemptNumber(run.runId)" in conversations)
    check("typed-conversation-recovery-error", "error instanceof ConversationError" in automation_executor and "AUTOMATION_CONVERSATION_${error.code}" in automation_executor)
    check("live-recovery-diagnostics", "OPENRILL_STEP013CR1_RECOVERY_DIAGNOSTICS" in live and all(token in live for token in ("latestEvents", "modelInvocations", "browserOperations")))
    check("live-diagnostics-no-raw-messages", not any(token in live for token in ("preCrashMessages", "content_json contentJson", "conversation_messages")))
    windows_failure = read_utf8(ROOT / "reference/validation/STEP013C_WINDOWS_LIVE_RESTART_ATTEMPT_POINTER_FAILURE.md")
    check("windows-failure-evidence", "checks=120/121 state=FAILED" in windows_failure and "AUTOMATION_CONVERSATION_EXECUTION_FAILED" in windows_failure)
    browser_recovery = lifecycle.index("repositories.browser.recoverInterruptedOperations")
    conversation_recovery = lifecycle.index("conversations.recoverIncompleteRuns()")
    scheduler_start = lifecycle.index("await automationScheduler?.start()")
    check("host-recovery-order", -1 < browser_recovery < conversation_recovery < scheduler_start)
    check("host-ledger-wiring", "new StateBrowserToolLedger(stateDatabase)" in lifecycle)
    check("live-forced-crash", "forceKill(first.child)" in live and "model.blocked" in live)
    check("live-same-run-reclaim", 'terminal.runId, runId' in live and 'terminal.attempt, 2' in live)
    check("live-stale-session-reopen", "BROWSER_SESSION_NOT_FOUND" in live and "browser.open" in live)
    check("live-artifact-evidence", "browser.screenshot" in live and "browser.evidence" in live)
    check("live-model-interruption", "MODEL_INTERRUPTED_BY_RESTART" in live)
    check("live-orphan-zero", "markerProcessIds" in live and "process_count=0 chromium_orphan=0" in live)
    check("child-real-playwright", "createPlaywrightBrowserDriver" in child and "automationLeaseDurationMs: 1_500" in child and "automationRenewIntervalMs: 500" in child)
    check("deferred-surfaces-zero", not any(f'"browser.{name}"' in tools for name in ("evaluate", "batch", "upload", "pdf")))

    accepted_record = json.loads(read_utf8(ROOT / "config/current-accepted-baseline.json"))
    check("accepted-record-schema", accepted_record.get("schemaVersion") == 1)
    check("accepted-record-step", accepted_record.get("step") == BASELINE)
    check("accepted-record-version", accepted_record.get("version") == "0.13.8-step013b3")
    check("accepted-record-checks", accepted_record.get("checks") == "134/134")
    check("accepted-record-sha", accepted_record.get("zipSha256") == BASELINE_SHA256)
    accepted_evidence = ROOT / str(accepted_record.get("evidence", ""))
    check("accepted-record-evidence", accepted_evidence.is_file() and BASELINE in read_utf8(accepted_evidence) and "process_count=0 chromium_orphan=0" in read_utf8(accepted_evidence))
    for relative in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        text = read_utf8(ROOT / relative)
        check(f"root-doc-baseline:{relative}", BASELINE in text and accepted_record["checks"] in text and BASELINE_SHA256 in text)
        check(f"root-doc-current:{relative}", STEP in text and VERSION in text)

    issue_registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(109, 118):
        token = f"OR-ISSUE-{number:03d}"
        check(f"issue-registry:{token}", token in issue_registry)
        check(f"recurrence-gate:{token}", token in recurrence)

    active_focused_commands = [
        "focused-browser-automation-ledger", "focused-browser-automation-boundaries",
        "focused-browser-artifacts", "focused-browser-artifact-boundaries",
        "focused-browser-interactions", "focused-browser-interaction-boundaries", "focused-acceptance-stage-evidence",
        "focused-test-reporter", "focused-browser-observation", "focused-browser-adapter-boundaries",
        "focused-browser-runtime", "focused-browser-boundaries",
    ]
    source_self = read_utf8(ROOT / "scripts/run_step013cr1_acceptance.py")
    check("stage-output-full-log", "persist_stage_output(stage, result.output)" in source_self and "STEP013CR1_STAGES" in source_self)
    check("stage-failure-anchor-excerpt", "failure_excerpt(stage, output)" in source_self and not re.search(r"check\(stage, contract_ok, output\[-?\d+:", source_self) and not re.search(r"detail\[-\d+:", source_self))
    for stage_name in active_focused_commands:
        line = next((line for line in source_self.splitlines() if f'("{stage_name}"' in line), "")
        check(f"tap-reporter:{stage_name}", "--test-reporter=tap" in line)

    stages = [
        ("source-version-alignment", ["python", "scripts/verify_source_version_alignment.py"], lambda output: f"OPENRILL_SOURCE_VERSION_ALIGNMENT_PASS version={VERSION} manifests=27 sources=26 host_literals=3" in output),
        ("workspace-lock-alignment", ["python", "scripts/verify_workspace_lock_alignment.py"], lambda output: "OPENRILL_WORKSPACE_LOCK_ALIGNMENT_PASS importers=27 dependencies=67" in output),
        ("workspace-module-links", ["python", "scripts/verify_workspace_module_links.py"], lambda output: "OPENRILL_WORKSPACE_MODULE_LINKS_PASS" in output),
        ("package-manifest-initial", ["python", "scripts/verify_package_manifest.py"], lambda output: "OPENRILL_PACKAGE_MANIFEST_PASS" in output and "changed=0" in output),
        ("focused-build", ["node", "scripts/workspace-runner.mjs", "build"], lambda output: "OPENRILL_WORKSPACE_BUILD_PASS" in output),
        ("focused-browser-automation-ledger", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-automation-ledger-step013c.test.mjs"], lambda output: tap_pass(output, 8)),
        ("focused-browser-automation-boundaries", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-automation-boundaries-step013c.test.mjs"], lambda output: tap_pass(output, 11)),
        ("focused-browser-artifacts", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-artifacts-step013b3.test.mjs"], lambda output: tap_pass(output, 5)),
        ("focused-browser-artifact-boundaries", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-artifact-boundaries-step013b3.test.mjs"], lambda output: tap_pass(output, 6)),
        ("focused-browser-interactions", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-interactions-step013b2.test.mjs"], lambda output: tap_pass(output, 5)),
        ("focused-browser-interaction-boundaries", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-interaction-boundaries-step013b2.test.mjs"], lambda output: tap_pass(output, 7)),
        ("focused-acceptance-stage-evidence", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/acceptance-stage-evidence-step013b2.test.mjs"], lambda output: tap_pass(output, 2)),
        ("focused-test-reporter", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/focused-test-reporter-step013b1a.test.mjs"], lambda output: tap_pass(output, 4)),
        ("focused-browser-observation", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-observation-step013b1.test.mjs"], lambda output: tap_pass(output, 5)),
        ("focused-browser-adapter-boundaries", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-playwright-boundaries-step013b1.test.mjs"], lambda output: tap_pass(output, 5)),
        ("focused-browser-runtime", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-runtime-step013a.test.mjs"], lambda output: tap_pass(output, 13)),
        ("focused-browser-boundaries", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-runtime-boundaries-step013a.test.mjs"], lambda output: tap_pass(output, 8)),
        ("canonical-suite", ["node", "scripts/run-step001-suite.mjs"], lambda output: "OPENRILL_STEP001_SUITE_PASS" in output and tap_pass(output)),
        ("architecture", ["python", "scripts/check_architecture.py"], lambda output: "OPENRILL_ARCHITECTURE_PASS" in output),
        ("exports", ["node", "scripts/check-exports.mjs"], lambda output: "OPENRILL_PACKAGE_EXPORT_PASS packages=26" in output),
        ("browser-live", ["node", "scripts/run-step013cr1-live.mjs"], lambda output: "OPENRILL_STEP013CR1_LIVE_PASS" in output and "automation=BROWSER_RUN ledger=ACTION_EVIDENCE recovery=RESUME_AND_REOPEN" in output and "process_count=0 chromium_orphan=0" in output),
        ("package-manifest-final", ["python", "scripts/verify_package_manifest.py"], lambda output: "OPENRILL_PACKAGE_MANIFEST_PASS" in output and "changed=0" in output),
    ]
    for stage, command, predicate in stages:
        ok, output = run_utf8(stage=stage, command=command)
        contract_ok = ok and predicate(output)
        check(stage, contract_ok, failure_excerpt(stage, output) if not contract_ok else "pass")

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, ok, detail in checks]
    marker = (
        f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} baseline=STEP013B3 retained_feature=STEP013C "
        "adapter=PLAYWRIGHT_CORE tools=15 automation_browser=AUTONOMOUS ledger=ACTION_EVIDENCE "
        "recovery=RESUME_AND_REOPEN attempt_pointer=ABORTED_RETAINED diagnostics=TYPED_AND_PRESERVED "
        "reporter=TAP process_count=0 chromium_orphan=0"
    )
    lines.append(marker)
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print(marker)
    if state != "PASSED":
        for name, ok, detail in checks:
            if not ok:
                print(f"OPENRILL_STEP013CR1_FAILURE check={name}\n{detail}")
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
