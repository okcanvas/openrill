from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP014C_BOUNDED_NESTED_DELEGATION_PARALLELISM_AND_RESTART_RECOVERY"
VERSION = "0.14.2-step014c"
SCHEMA = 14
BASELINE = "STEP013CR2_SQLITE_NULL_PROTOTYPE_LIVE_ASSERTION_ALIGNMENT"
BASELINE_CHECKS = "163/163"
BASELINE_SHA256 = "c4314c2c9c877f503fc6bb84e04f5abc698f22c8e9104c826b7f0e2d328904fc"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP014C_ACCEPTANCE_REPORT.txt")
STAGE_LOG_DIR = REPORT.parent / "STEP014C_STAGES"
FAILURE_EXCERPT_LIMIT = 20_000
UNIT_TEST_FILES = [path.relative_to(ROOT).as_posix() for path in sorted((ROOT / "tests/unit").glob("*.test.mjs"))]

STAGES: list[tuple[str, list[str], int]] = [
    ("source-version-alignment", ["python", "scripts/verify_source_version_alignment.py"], 60),
    ("workspace-lock-alignment", ["python", "scripts/verify_workspace_lock_alignment.py"], 60),
    ("workspace-module-links", ["python", "scripts/verify_workspace_module_links.py"], 60),
    ("package-manifest-initial", ["python", "scripts/verify_package_manifest.py"], 120),
    ("focused-build", ["node", "scripts/workspace-runner.mjs", "build"], 300),
    ("focused-delegation-foundation", ["node", "--test", "--test-reporter=tap", "tests/unit/delegation-foundation-step014a.test.mjs"], 180),
    ("focused-delegation-foundation-boundaries", ["node", "--test", "--test-reporter=tap", "tests/unit/delegation-boundaries-step014a.test.mjs"], 180),
    ("focused-delegated-execution", ["node", "--test", "--test-reporter=tap", "tests/unit/delegation-execution-step014b.test.mjs"], 180),
    ("focused-delegated-execution-boundaries", ["node", "--test", "--test-reporter=tap", "tests/unit/delegation-execution-boundaries-step014b.test.mjs"], 180),
    ("focused-delegation-nested-recovery", ["node", "--test", "--test-reporter=tap", "tests/unit/delegation-nested-recovery-step014c.test.mjs"], 180),
    ("focused-delegation-nested-recovery-boundaries", ["node", "--test", "--test-reporter=tap", "tests/unit/delegation-nested-recovery-boundaries-step014c.test.mjs"], 180),
    ("canonical-suite", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", *UNIT_TEST_FILES], 900),
    ("architecture", ["python", "scripts/check_architecture.py"], 120),
    ("exports", ["node", "scripts/check-exports.mjs"], 180),
    ("package-manifest-final", ["python", "scripts/verify_package_manifest.py"], 120),
]


def read_utf8(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def stage_log_path(stage: str) -> Path:
    if not re.fullmatch(r"[a-z0-9-]+", stage):
        raise ValueError(f"invalid stage name: {stage}")
    return STAGE_LOG_DIR / f"{stage}.log"


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def failure_excerpt(stage: str, output: str) -> str:
    log_path = stage_log_path(stage)
    lines = output.splitlines()
    anchor = re.compile(r"^(?:not ok\b|# fail [1-9][0-9]*\b|\s*(?:AssertionError|Error(?: \[[^]]+\])?:|Traceback \(most recent call last\):)|.*OPENRILL_[A-Z0-9_]*(?:FAIL|FAILED))")
    intervals: list[tuple[int, int]] = []
    for index, line in enumerate(lines):
        if anchor.search(line):
            intervals.append((max(0, index - 3), min(len(lines), index + 45)))
    merged: list[tuple[int, int]] = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    evidence = "\n".join("\n".join(lines[start:end]) for start, end in merged) or output[:8_000]
    tail = output[-8_000:]
    combined = (
        f"full_stage_log={display_path(log_path)} bytes={len(output.encode('utf-8'))}\n"
        f"OPENRILL_STAGE_FAILURE_EVIDENCE_BEGIN name={stage}\n{evidence}\nOPENRILL_STAGE_FAILURE_EVIDENCE_END name={stage}\n"
        f"OPENRILL_STAGE_OUTPUT_TAIL_BEGIN name={stage}\n{tail}\nOPENRILL_STAGE_OUTPUT_TAIL_END name={stage}"
    )
    return combined if len(combined) <= FAILURE_EXCERPT_LIMIT else combined[:12_000] + "\nOPENRILL_STAGE_EXCERPT_TRUNCATED\n" + combined[-7_900:]


def run_utf8(name: str, command: list[str], timeout: int) -> tuple[bool, str]:
    env = os.environ.copy()
    env.update({"PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", "NO_COLOR": "1", "NODE_DISABLE_COLORS": "1", "TERM": "dumb"})
    result = run_stage(name=name, command=command, cwd=ROOT, env=env, timeout_seconds=timeout)
    path = stage_log_path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(result.output, encoding="utf-8")
    print(f"OPENRILL_ACCEPTANCE_STAGE_LOG name={name} path={display_path(path)} bytes={len(result.output.encode('utf-8'))}", flush=True)
    return result.ok, result.output


def clean() -> None:
    for group in ("apps", "services", "packages", "connectors", "skills"):
        for path in (ROOT / group).glob("*/dist"):
            shutil.rmtree(path, ignore_errors=True)
    shutil.rmtree(ROOT / ".artifacts", ignore_errors=True)
    for path in ROOT.rglob("__pycache__"):
        if "node_modules" not in path.parts:
            shutil.rmtree(path, ignore_errors=True)


def tap_pass(output: str, expected: int) -> bool:
    tests = re.search(r"# tests (\d+)(?:\r?\n)", output)
    passed = re.search(r"# pass (\d+)(?:\r?\n)", output)
    return bool(tests and passed and int(tests.group(1)) == expected and tests.group(1) == passed.group(1)
                and re.search(r"# fail 0(?:\r?\n)", output)
                and re.search(r"# cancelled 0(?:\r?\n)", output)
                and re.search(r"# skipped 0(?:\r?\n)", output))


def main() -> int:
    print("OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal", flush=True)
    clean()
    print("OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal", flush=True)
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8("package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("acceptance-script", scripts.get("acceptance:step014c") == "python scripts/run_step014c_acceptance.py")
    check("package-script", scripts.get("package:step014c") == "python scripts/package_step014c.py --output ../openrill-step014c-bounded-nested-delegation-parallelism-restart-recovery-v1.zip")

    required = [
        "packages/state/migrations/012_delegation_graph_budget_foundation.sql",
        "packages/state/migrations/013_delegation_result_delivery.sql",
        "packages/state/migrations/014_delegation_reservation_release_and_recovery.sql",
        "packages/state/src/delegation-repository.ts",
        "packages/conversations/src/delegation.ts",
        "packages/tools-delegation/package.json",
        "packages/tools-delegation/src/index.ts",
        "tests/unit/delegation-foundation-step014a.test.mjs",
        "tests/unit/delegation-boundaries-step014a.test.mjs",
        "tests/unit/delegation-execution-step014b.test.mjs",
        "tests/unit/delegation-execution-boundaries-step014b.test.mjs",
        "tests/unit/delegation-nested-recovery-step014c.test.mjs",
        "tests/unit/delegation-nested-recovery-boundaries-step014c.test.mjs",
        "docs/plans/STEP014C_BOUNDED_NESTED_DELEGATION_PARALLELISM_AND_RESTART_RECOVERY.md",
        "docs/contracts/DELEGATED_EXECUTION_SINGLE_CHILD.md",
        "docs/contracts/DELEGATION_NESTING_PARALLELISM_AND_RECOVERY.md",
        "docs/adrs/ADR-0030-SPAWN_THEN_DURABLE_WAIT.md",
        "docs/adrs/ADR-0031-DURABLE_RESERVATION_RELEASE_AND_ORDERED_DESCENDANT_RECOVERY.md",
        "docs/validation/STEP014B_FAILURE_PREVENTION_AUDIT.md",
        "docs/validation/STEP014C_FAILURE_PREVENTION_AUDIT.md",
        "reference/validation/STEP014B_LOCAL_DETERMINISTIC_VALIDATION.md",
        "reference/validation/STEP014C_LOCAL_DETERMINISTIC_VALIDATION.md",
        "scripts/run_step014c_acceptance.py", "scripts/package_step014c.py",
        "scripts/sh_run_step014b_acceptance.cmd", "scripts/sh_run_step014b_acceptance.sh",
        "config/current-accepted-baseline.json",
    ] + [f"reference/validation/STEP014B_OR_ISSUE_{number}.md" for number in range(129, 137)] + [f"reference/validation/STEP014C_OR_ISSUE_{number}.md" for number in range(137, 146)]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    accepted = json.loads(read_utf8("config/current-accepted-baseline.json"))
    check("accepted-step", accepted.get("step") == BASELINE)
    check("accepted-checks", accepted.get("checks") == BASELINE_CHECKS)
    check("accepted-sha", accepted.get("zipSha256") == BASELINE_SHA256)
    check("accepted-evidence", (ROOT / str(accepted.get("evidence", ""))).is_file())

    migrations = read_utf8("packages/state/src/migrations.ts")
    migration13 = read_utf8("packages/state/migrations/013_delegation_result_delivery.sql")
    migration14 = read_utf8("packages/state/migrations/014_delegation_reservation_release_and_recovery.sql")
    repository = read_utf8("packages/state/src/delegation-repository.ts")
    tools = read_utf8("packages/tools-delegation/src/index.ts")
    delegation = read_utf8("packages/conversations/src/delegation.ts")
    conversations = read_utf8("packages/conversations/src/service.ts")
    kernel = read_utf8("packages/agent-kernel/src/kernel.ts")
    host = read_utf8("services/agent-host/src/lifecycle.ts")
    protocol = read_utf8("services/agent-host/src/transport/operation-registry.ts")

    check("schema-14", f"OPENRILL_STATE_SCHEMA_VERSION = {SCHEMA} as const" in migrations)
    check("reservation-table", "CREATE TABLE run_delegation_budget_reservations" in migration14)
    check("delegated-usage-columns", all(token in migration14 for token in ("delegated_used_turns", "delegated_used_input_tokens", "delegated_used_output_tokens", "delegated_used_model_calls", "delegated_used_tool_calls")))
    check("reservation-exact-release", "WHERE delegation_id=? AND status='RESERVED'" in repository and "delegation budget release conflicts with durable charge" in repository)
    check("delivery-table", "CREATE TABLE run_delegation_result_deliveries" in migration13)
    for token in ("UNIQUE (parent_run_id, parent_tool_call_id)", "CHECK (tool_name = 'agent.wait')", "PENDING", "DELIVERED"):
        check(f"delivery-contract:{token}", token in migration13)
    check("spawn-tool", 'name: "agent.spawn"' in tools)
    check("wait-tool", 'name: "agent.wait"' in tools)
    check("closed-schemas", tools.count("additionalProperties: false") >= 2)
    check("no-extra-agent-tools", not re.search(r"agent\.(?:cancel|list|inspect|delegate)", tools))
    check("spawn-nonblocking", "scheduleChild" in tools and "ToolWaitRequiredError" in tools)
    check("bounded-nested-input", all(token in tools for token in ("maxNestedDepth", "maxActiveChildren", "maxTotalChildren")))
    check("nested-tool-derived", "agent.spawn and agent.wait are controlled by maxNestedDepth" in tools)
    check("task-output-redacted", "taskSha256" in delegation and "secret delegated task" not in tools)
    check("bounded-result", "MAX_PARENT_RESULT_SUMMARY_CHARS = 8_192" in delegation and "MAX_PARENT_RESULT_ARTIFACTS = 32" in delegation)
    check("delivery-idempotency", "markResultDelivered" in delegation and "checkpoint:tool:" in delegation and "tool-complete:" in delegation)
    check("delegation-wait-rollover", "DELEGATION_WAIT" in conversations and 'recoveryState: "RESUMABLE"' in conversations)
    check("durable-budget-source", "initial.budgetEnvelope" in kernel and "configuredBudget" in kernel)
    check("tool-schema-scope", "modelToolDefinitions" in kernel and "allowedToolNames.has(definition.name)" in kernel)
    check("tool-dispatch-scope", "AGENT_TOOL_NOT_ALLOWED" in kernel)
    check("usage-before-dispatch", "updateExecutionUsage(options.runId, finishUsage())" in kernel)
    check("host-register-tools", "registerDelegationTools" in host and "new DelegationService" in host)
    check("host-child-schedule", "ensureScheduled" in host)
    check("host-child-complete", "completeChild" in host and "completion.resumeParent" in host)
    check("host-terminal-reconcile", "reconcileTerminalChildren()" in host)
    check("host-runnable-reschedule", "runnableChildRunIds()" in host)
    check("host-timeout-sweep", "expiredChildRunIds()" in host and "DELEGATION_TIMEOUT" in host)
    check("host-cancel-cascade", "cancellationOrder(runId)" in host and "PARENT_CANCELLED" in host)
    check("host-parent-resume", "runCoordinator?.resume(completion.parentRunId)" in host)
    check("host-child-skill-isolation", "budget?.parentRunId" in host and "DEFAULT_AGENT_SYSTEM_INSTRUCTIONS" in host)
    check("no-delegation-protocol", "agent.spawn" not in protocol and "agent.wait" not in protocol and "delegation." not in protocol)

    registry = read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    gates = read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(129, 146):
        issue = f"OR-ISSUE-{number}"
        check(f"issue-registry:{issue}", issue in registry)
        check(f"recurrence-gate:{issue}", issue in gates)

    for relative in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        body = read_utf8(relative)
        check(f"root-doc-current:{relative}", STEP in body and VERSION in body)
        check(f"root-doc-accepted:{relative}", BASELINE in body and BASELINE_CHECKS in body and BASELINE_SHA256 in body)

    package_manifest = json.loads(read_utf8("PACKAGE_MANIFEST.json"))
    check("manifest-current-step", package_manifest.get("step") == STEP)
    check("manifest-current-version", package_manifest.get("version") == VERSION)

    stage_outputs: dict[str, str] = {}
    for name, command, timeout in STAGES:
        ok, output = run_utf8(name, command, timeout)
        stage_outputs[name] = output
        if name == "focused-delegation-foundation":
            ok = ok and tap_pass(output, 15)
        elif name == "focused-delegation-foundation-boundaries":
            ok = ok and tap_pass(output, 10)
        elif name == "focused-delegated-execution":
            ok = ok and tap_pass(output, 9)
        elif name == "focused-delegated-execution-boundaries":
            ok = ok and tap_pass(output, 10)
        elif name == "focused-delegation-nested-recovery":
            ok = ok and tap_pass(output, 7)
        elif name == "focused-delegation-nested-recovery-boundaries":
            ok = ok and tap_pass(output, 9)
        elif name == "canonical-suite":
            ok = ok and tap_pass(output, 390)
        check(name, ok, "" if ok else failure_excerpt(name, output))

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    marker = (
        f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} baseline=STEP013CR2 "
        "delegation=BOUNDED_NESTED_PARALLEL tools=AGENT_SPAWN_WAIT reservation=ACTUAL_USE_RETURN "
        "timeout=CASCADE recovery=RECONCILE_AND_RESCHEDULE scope=MONOTONIC protocol=UNCHANGED reporter=TAP"
    )
    lines = [marker]
    for name, ok, detail in checks:
        if not ok:
            lines.append(f"OPENRILL_STEP014C_FAILURE check={name}")
            if detail:
                lines.append(detail)
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines), flush=True)
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
