from __future__ import annotations

import argparse
import json
import os
import re
import shutil
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP016C_LOCAL_MULTI_TURN_CONTINUATION_AND_RUNNING_HOST_ATTACHMENT"
VERSION = "0.16.3-step016c"
SCHEMA = 15
ACCEPTED_PRODUCT_BASELINE = "STEP016B_FIRST_RUN_MODEL_CONNECTIVITY_AND_LOCAL_CONVERSATION_FLOW"
ACCEPTED_CHECKS = "WINDOWS_FIRST_RUN_68/68"
ACCEPTED_SHA = "0db9ba1bef4bedeb1513b199a7ec7fcfd932c5c0ba12676815d2cf579bf21d46"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP016C_ACCEPTANCE_REPORT.txt")
STAGE_LOG_DIR = REPORT.parent / "STEP016C_STAGES"

BASE_STAGES: list[tuple[str, list[str], int]] = [
    ("source-version-alignment", ["python", "scripts/verify_source_version_alignment.py"], 60),
    ("workspace-lock-alignment", ["python", "scripts/verify_workspace_lock_alignment.py"], 60),
    ("workspace-module-links", ["python", "scripts/verify_workspace_module_links.py"], 60),
    ("source-root-boundary", ["python", "scripts/check_source_root_boundary.py"], 60),
    ("package-manifest-initial", ["python", "scripts/verify_package_manifest.py"], 120),
    ("workspace-build", ["node", "scripts/workspace-runner.mjs", "build"], 300),
    ("focused-step016c-product", [
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap",
        "tests/unit/local-multi-turn-step016c.test.mjs",
    ], 240),
    ("affected-conversation-regression", [
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap",
        "tests/unit/first-local-conversation-step016b.test.mjs",
        "tests/unit/local-protocol-step004.test.mjs",
        "tests/unit/conversation-step006.test.mjs",
    ], 300),
    ("focused-validation-governance", [
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap",
        "tests/unit/validation-governance-step015a.test.mjs",
        "tests/unit/validation-governance-step015b.test.mjs",
        "tests/unit/docker-container-id-evidence-step015bh1.test.mjs",
        "tests/unit/validation-governance-step016a.test.mjs",
        "tests/unit/windows-dpapi-argument-transport-step016ar1.test.mjs",
        "tests/unit/windows-dpapi-live-entrypoint-step016ar1h1.test.mjs",
        "tests/unit/validation-governance-step016b.test.mjs",
        "tests/unit/validation-governance-step016c.test.mjs",
        "tests/unit/live-child-close-step016ch1.test.mjs",
        "tests/unit/live-output-privacy-step016ch2.test.mjs",
    ], 300),
    ("canonical-suite", ["node", "scripts/run-canonical-unit-batches.mjs"], 900),
    ("architecture", ["python", "scripts/check_architecture.py"], 120),
    ("exports", ["node", "scripts/check-exports.mjs"], 180),
    ("package-manifest-final", ["python", "scripts/verify_package_manifest.py"], 120),
]


def read_utf8(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def clean() -> None:
    for group in ("apps", "services", "packages", "connectors", "skills"):
        base = ROOT / group
        for directory in base.iterdir():
            if directory.is_dir():
                shutil.rmtree(directory / "dist", ignore_errors=True)
    shutil.rmtree(ROOT / ".artifacts", ignore_errors=True)


def tap_summary(output: str) -> tuple[bool, int]:
    tests = re.search(r"^# tests (\d+)$", output, re.MULTILINE)
    passed = re.search(r"^# pass (\d+)$", output, re.MULTILINE)
    clean_result = all(re.search(pattern, output, re.MULTILINE) for pattern in (
        r"^# fail 0$", r"^# cancelled 0$", r"^# skipped 0$",
    ))
    if not tests or not passed:
        return False, 0
    return clean_result and tests.group(1) == passed.group(1), int(tests.group(1))


def run_utf8(name: str, command: list[str], timeout: int) -> tuple[bool, str, float]:
    env = os.environ.copy()
    env.update({"PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", "NO_COLOR": "1", "NODE_DISABLE_COLORS": "1"})
    result = run_stage(name=name, command=command, cwd=ROOT, env=env, timeout_seconds=timeout)
    STAGE_LOG_DIR.mkdir(parents=True, exist_ok=True)
    log = STAGE_LOG_DIR / f"{name}.log"
    log.write_text(result.output, encoding="utf-8")
    print(f"OPENRILL_ACCEPTANCE_STAGE_LOG name={name} path={log.relative_to(ROOT).as_posix()} bytes={log.stat().st_size}", flush=True)
    return result.ok, result.output, result.elapsed_seconds


def main() -> int:
    parser = argparse.ArgumentParser(description="Run OpenRill STEP016C source/package acceptance")
    parser.add_argument("--require-windows-multi-turn-live", action="store_true")
    args = parser.parse_args()

    print("OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal", flush=True)
    clean()
    print("OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal", flush=True)

    checks: list[tuple[str, bool, str]] = []
    automated_seconds = 0.0
    stage_tests: dict[str, int] = {}

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8("package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("root-description", "STEP016C" in package.get("description", ""))
    check("acceptance-script", scripts.get("acceptance:step016c") == "python scripts/run_step016c_acceptance.py")
    check("live-acceptance-script", scripts.get("acceptance:step016c:live") == "python scripts/run_step016c_acceptance.py --require-windows-multi-turn-live")
    check("live-script", scripts.get("multi-turn-live:step016c") == "node scripts/run-step016c-local-multi-turn-live.mjs")
    check("package-script", scripts.get("package:step016c") == "python scripts/package_step016c.py --output ../openrill-step016c-local-multi-turn-running-host-attachment-v1.zip")

    required = [
        "apps/agent-cli/src/index.ts",
        "apps/agent-cli/src/conversation-session.ts",
        "apps/agent-cli/src/local-protocol-client.ts",
        "packages/protocol/src/conversation-operations.ts",
        "services/agent-host/src/lifecycle.ts",
        "services/agent-host/src/transport/operation-registry.ts",
        "tests/unit/local-multi-turn-step016c.test.mjs",
        "tests/unit/validation-governance-step016c.test.mjs",
        "scripts/run-step016c-local-multi-turn-live.mjs",
        "scripts/live-child-close.mjs",
        "tests/unit/live-child-close-step016ch1.test.mjs",
        "scripts/live-output-privacy.mjs",
        "tests/unit/live-output-privacy-step016ch2.test.mjs",
        "reference/validation/STEP016C_WINDOWS_MULTI_TURN_LIVE_ATTEMPT_1.md",
        "reference/validation/STEP016C_OR_ISSUE_213.md",
        "reference/validation/STEP016C_WINDOWS_MULTI_TURN_LIVE_ATTEMPT_2.md",
        "reference/validation/STEP016C_OR_ISSUE_214.md",
        "docs/adrs/ADR-0039-RUNNING-HOST-ATTACHMENT-AND-CONVERSATION-EXECUTION.md",
        "docs/plans/STEP016C_LOCAL_MULTI_TURN_CONTINUATION_AND_RUNNING_HOST_ATTACHMENT.md",
        "reference/validation/STEP016B_WINDOWS_FIRST_RUN_LIVE_ACCEPTANCE.md",
        "reference/validation/STEP016C_OR_ISSUE_210.md",
        "reference/validation/STEP016C_OR_ISSUE_211.md",
        "reference/validation/STEP016C_OR_ISSUE_212.md",
        "reference/validation/STEP016C_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    accepted = json.loads(read_utf8("config/current-accepted-baseline.json"))
    check("accepted-baseline", accepted.get("step") == ACCEPTED_PRODUCT_BASELINE)
    check("accepted-version", accepted.get("version") == "0.16.2-step016b")
    check("accepted-checks", accepted.get("checks") == ACCEPTED_CHECKS)
    check("accepted-sha", accepted.get("zipSha256") == ACCEPTED_SHA)
    check("accepted-dimensional", accepted.get("acceptanceModel") == "DIMENSIONAL")
    check("accepted-artifact", accepted.get("artifact") == "openrill-step016b-first-run-model-connectivity-local-conversation-flow-v1.zip")
    check("accepted-artifact-alias", accepted.get("zip") == accepted.get("artifact"))
    check("accepted-evidence", accepted.get("evidence") == "reference/validation/STEP016B_WINDOWS_FIRST_RUN_LIVE_ACCEPTANCE.md")
    check("accepted-evidence-exists", (ROOT / str(accepted.get("evidence", ""))).is_file())
    check("accepted-integration-dimension", accepted.get("dimensions", {}).get("requiredIntegration") == "ACCEPTED_WINDOWS_FIRST_RUN_LOOPBACK_RESPONSES")
    check("accepted-harness-dimension", accepted.get("dimensions", {}).get("harness") == "ACCEPTED_WINDOWS_FIRST_RUN_LIVE")

    cli = read_utf8("apps/agent-cli/src/index.ts")
    session = read_utf8("apps/agent-cli/src/conversation-session.ts")
    client = read_utf8("apps/agent-cli/src/local-protocol-client.ts")
    protocol = read_utf8("packages/protocol/src/conversation-operations.ts")
    validation = read_utf8("packages/protocol/src/validation.ts")
    registry = read_utf8("services/agent-host/src/transport/operation-registry.ts")
    host = read_utf8("services/agent-host/src/lifecycle.ts")
    live = read_utf8("scripts/run-step016c-local-multi-turn-live.mjs")
    plan = read_utf8("docs/plans/STEP016C_LOCAL_MULTI_TURN_CONTINUATION_AND_RUNNING_HOST_ATTACHMENT.md")
    handoff = read_utf8("HANDOFF.md")
    issue_registry = read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    gates = read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md")

    check("ask-continuation", "--conversation-id" in cli and '"conversation.execute"' in cli)
    check("conversation-discovery", "conversation list" in cli and "conversation show" in cli)
    check("prompt-stdin-only", "requires a non-empty prompt on stdin" in cli)
    check("running-host-attach", "RUNNING_ATTACHED" in session and "inspectLocalHost" in session)
    check("host-ownership", "ownedHost?.close" in session and 'mode: ConversationHostMode' in session)
    check("profile-token-auth", 'credential: { kind: "profile-token"' in client)
    check("bounded-protocol", "MAX_PROTOCOL_FRAME_BYTES" in client and "PROTOCOL_CALL_TIMEOUT" in client)
    check("identity-check", "PROTOCOL_HOST_IDENTITY_MISMATCH" in client)
    check("protocol-execute-type", "ConversationExecuteInput" in protocol and "ConversationExecuteOutput" in protocol)
    check("protocol-execute-validation", "validateConversationExecuteInput" in validation and "existing conversation execution cannot replace title or modelProfile" in validation)
    check("protocol-execute-operation", 'name: "conversation.execute"' in registry)
    check("terminal-execution", "executeUntilTerminal" in host and "executeConversation" in host)
    check("history-retained", "executionContext" in read_utf8("packages/conversations/src/service.ts") and "listMessages" in read_utf8("packages/conversations/src/service.ts"))
    check("live-running-host", "startForegroundHost" in live and "RUNNING_ATTACHED" in live)
    check("live-two-turn-history", "history-users" in live and "history-assistant" in live)
    check("live-host-preserved", "host-preserved" in live and "host-clean" in live)
    close_helper = read_utf8("scripts/live-child-close.mjs")
    check("live-close-preobserved", "child.exitCode !== null || child.signalCode !== null" in close_helper and "OPENRILL_LIVE_CHILD_CLOSE_TIMEOUT" in close_helper)
    check("live-close-helper-owned", "waitForChildClose(host.child" in live and "host.child.once(\"close\"" not in live)
    privacy_helper = read_utf8("scripts/live-output-privacy.mjs")
    check("live-progress-evidence", "OPENRILL_STEP016C_LIVE_PHASE" in live and "STEP016C_H2_AUTHORIZED_HISTORY_SECRET_REDACTION_ALIGNMENT" in live)
    check("live-redaction-semantics", all(token in live for token in ("secret-redaction", "prompt-not-echoed", "authorized-history-visible")) and all(token in privacy_helper for token in ("secretRedacted", "promptsNotEchoedOutsideHistory", "authorizedHistoryContainsPrompts")))
    check("live-real-dpapi", "OPENRILL_STEP016C_WINDOWS_DPAPI_REQUIRED" in live and "createOsSecretProvider" in live)
    check("no-external-model", "api.openai.com" not in live and "external_model=NOT_RUN" in live)
    check("no-browser", not re.search(r"chromium|playwright", live, re.I) and "browser=NOT_RUN" in live)
    check("connector-deferred", "no Connector or Mattermost implementation" in plan and "DEFERRED_NO_REAL_SYSTEM" in handoff)
    check("human-time-not-invented", "human_work_minutes=NOT_RECORDED" in plan)
    for issue in ("OR-ISSUE-190", "OR-ISSUE-191", "OR-ISSUE-206", "OR-ISSUE-207", "OR-ISSUE-208", "OR-ISSUE-209", "OR-ISSUE-210", "OR-ISSUE-211", "OR-ISSUE-212", "OR-ISSUE-213", "OR-ISSUE-214"):
        check(f"issue-visible:{issue}", all(issue in body for body in (handoff, issue_registry, gates)))
    check("or-issue-208-recurrence", "STEP016C recurrence interception" in read_utf8("reference/validation/STEP016B_OR_ISSUE_208.md"))
    check("manifest-identity-cross-gate", all(token in read_utf8("scripts/verify_package_manifest.py") and token in read_utf8("scripts/generate_package_manifest.py") for token in (STEP, VERSION)))
    check("root-doc-current-identity", all(STEP in read_utf8(path) for path in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md")))
    source_evidence = read_utf8("reference/validation/STEP016C_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md")
    check("source-package-evidence", all(token in source_evidence for token in (STEP, "checks=82/82", "canonical_tests=561/561", "automated_run_seconds=", "windows_multi_turn_live=PENDING_ENV")))

    manifest = json.loads(read_utf8("PACKAGE_MANIFEST.json"))
    check("manifest-current-step", manifest.get("step") == STEP)
    check("manifest-current-version", manifest.get("version") == VERSION)

    stages = list(BASE_STAGES)
    live_state = "PENDING_ENV"
    if args.require_windows_multi_turn_live:
        if os.name != "nt":
            check("windows-multi-turn-environment", False, "Windows is required")
            live_state = "UNSUPPORTED_ENV"
        else:
            stages.append(("windows-multi-turn-live", ["node", "scripts/run-step016c-local-multi-turn-live.mjs"], 300))
            live_state = "RUNNING"

    for name, command, timeout in stages:
        ok, output, elapsed = run_utf8(name, command, timeout)
        automated_seconds += elapsed
        if name in {"focused-step016c-product", "affected-conversation-regression", "focused-validation-governance"}:
            tap_ok, count = tap_summary(output)
            ok = ok and tap_ok
            stage_tests[name] = count
        elif name == "canonical-suite":
            match = re.search(r"OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0", output)
            ok = ok and bool(match) and match.group(3) == match.group(4)
            if match:
                stage_tests["canonical-files"] = int(match.group(1))
                stage_tests["canonical-tests"] = int(match.group(3))
        elif name == "windows-multi-turn-live":
            match = re.search(
                rf"^{STEP} checks=(\d+)/(\d+) state=PASSED version={re.escape(VERSION)} schema={SCHEMA} live_harness=STEP016C_H2_AUTHORIZED_HISTORY_SECRET_REDACTION_ALIGNMENT .*host=RUNNING_ATTACHED .*multi_turn=DURABLE_HISTORY .*host_ownership=PRESERVED .*redaction=SECRET_ONLY_HISTORY_AUTHORIZED .*external_model=NOT_RUN browser=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM cleanup=QUIESCENT$",
                output,
                re.MULTILINE,
            )
            ok = ok and bool(match) and match.group(1) == match.group(2)
            live_state = "PASSED" if ok else "FAILED"
        check(name, ok, "" if ok else output[-12000:])

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    promotion = "READY" if live_state == "PASSED" and state == "PASSED" else "WINDOWS_MULTI_TURN_LIVE_PENDING" if state == "PASSED" else "BLOCKED"
    marker = (
        f"{STEP} checks={passed}/{len(checks)} state={state} version={VERSION} schema={SCHEMA} "
        f"accepted_product_baseline={ACCEPTED_PRODUCT_BASELINE} accepted_checks={ACCEPTED_CHECKS} "
        "source=ACCEPTED_PROFILE package=CANDIDATE continuation=PROTOCOL_EXECUTE host_attachment=READY_RUNNING "
        "host_ownership=EXISTING_PRESERVED_EPHEMERAL_OWNED conversation=DURABLE_MULTI_TURN discovery=LIST_SHOW "
        "prompt=STDIN_ONLY secret_persistence=REFERENCE_ONLY external_model=NOT_RUN browser=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM "
        f"focused_product={stage_tests.get('focused-step016c-product', 0)} affected_regression={stage_tests.get('affected-conversation-regression', 0)} "
        f"governance={stage_tests.get('focused-validation-governance', 0)} canonical_files={stage_tests.get('canonical-files', 0)} canonical_tests={stage_tests.get('canonical-tests', 0)} "
        f"windows_multi_turn_live={live_state} live_harness=STEP016C_H2_AUTHORIZED_HISTORY_SECRET_REDACTION_ALIGNMENT promotion={promotion} automated_run_seconds={automated_seconds:.3f}"
    )
    lines = [marker]
    for name, ok, detail in checks:
        if not ok:
            lines.append(f"OPENRILL_STEP016C_FAILURE check={name}")
            if detail:
                lines.append(detail)
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines), flush=True)
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
