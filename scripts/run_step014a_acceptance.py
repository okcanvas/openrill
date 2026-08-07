from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP014A_DURABLE_DELEGATION_GRAPH_BUDGET_ENVELOPE_AND_WAIT_STATE_FOUNDATION"
VERSION = "0.14.0-step014a"
SCHEMA = 12
BASELINE = "STEP013CR2_SQLITE_NULL_PROTOTYPE_LIVE_ASSERTION_ALIGNMENT"
BASELINE_VERSION = "0.13.11-step013cr2"
BASELINE_CHECKS = "163/163"
BASELINE_SHA256 = "c4314c2c9c877f503fc6bb84e04f5abc698f22c8e9104c826b7f0e2d328904fc"
OPENCLAW_SHA256 = "1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP014A_ACCEPTANCE_REPORT.txt")
STAGE_LOG_DIR = REPORT.parent / "STEP014A_STAGES"
FAILURE_EXCERPT_LIMIT = 20_000
UNIT_TEST_FILES = [path.relative_to(ROOT).as_posix() for path in sorted((ROOT / "tests/unit").glob("*.test.mjs"))]

STAGES: list[tuple[str, list[str], int]] = [
    ("source-version-alignment", ["python", "scripts/verify_source_version_alignment.py"], 60),
    ("workspace-lock-alignment", ["python", "scripts/verify_workspace_lock_alignment.py"], 60),
    ("workspace-module-links", ["python", "scripts/verify_workspace_module_links.py"], 60),
    ("package-manifest-initial", ["python", "scripts/verify_package_manifest.py"], 120),
    ("focused-build", ["node", "scripts/workspace-runner.mjs", "build"], 300),
    ("focused-delegation-foundation", ["node", "--test", "--test-reporter=tap", "tests/unit/delegation-foundation-step014a.test.mjs"], 180),
    ("focused-delegation-boundaries", ["node", "--test", "--test-reporter=tap", "tests/unit/delegation-boundaries-step014a.test.mjs"], 180),
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
    if len(combined) <= FAILURE_EXCERPT_LIMIT:
        return combined
    return combined[:12_000] + "\nOPENRILL_STAGE_EXCERPT_TRUNCATED\n" + combined[-7_900:]


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
    check("acceptance-script", scripts.get("acceptance:step014a") == "python scripts/run_step014a_acceptance.py")
    check("package-script", scripts.get("package:step014a") == "python scripts/package_step014a.py --output ../openrill-step014a-durable-delegation-graph-budget-envelope-wait-state-foundation-v1.zip")

    required = [
        "packages/state/migrations/012_delegation_graph_budget_foundation.sql",
        "packages/state/src/delegation-repository.ts",
        "packages/conversations/src/delegation.ts",
        "tests/unit/delegation-foundation-step014a.test.mjs",
        "tests/unit/delegation-boundaries-step014a.test.mjs",
        "docs/plans/STEP014A_DURABLE_DELEGATION_GRAPH_BUDGET_ENVELOPE_AND_WAIT_STATE_FOUNDATION.md",
        "docs/contracts/DELEGATION_FOUNDATION.md",
        "docs/validation/STEP014A_FAILURE_PREVENTION_AUDIT.md",
        "reference/openclaw/STEP014A_DELEGATED_WORK_SOURCE_AUDIT.md",
        "reference/validation/STEP013CR2_WINDOWS_LIVE_ACCEPTANCE.md",
        "reference/validation/STEP014A_BUDGET_OVERSHOOT_EVIDENCE_CONSTRAINT.md",
        "reference/validation/STEP014A_RESTART_ATTEMPT_TURN_AGGREGATION.md",
        "reference/validation/STEP014A_HISTORICAL_CURRENT_IDENTITY_OWNERSHIP_DRIFT.md",
        "reference/validation/STEP014A_LEGACY_EXECUTION_BUDGET_DEFAULT_ALIGNMENT.md",
        "reference/validation/STEP014A_DURABLE_DEADLINE_CLOCK_DOMAIN_ALIGNMENT.md",
        "reference/validation/STEP014A_ACCEPTANCE_RUNNER_SOURCE_INVENTORY_ALIGNMENT.md",
        "reference/validation/STEP014A_CANONICAL_TEST_FILE_ENUMERATION.md",
        "reference/validation/STEP014A_LOCAL_DETERMINISTIC_VALIDATION.md",
        "docs/adrs/ADR-0029-DURABLE_DELEGATION_FOUNDATION_BEFORE_PUBLIC_TOOLS.md",
        "scripts/run_step014a_acceptance.py", "scripts/package_step014a.py",
        "scripts/sh_run_step014a_acceptance.cmd", "scripts/sh_run_step014a_acceptance.sh",
        "config/current-accepted-baseline.json",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    accepted = json.loads(read_utf8("config/current-accepted-baseline.json"))
    check("accepted-step", accepted.get("step") == BASELINE)
    check("accepted-version", accepted.get("version") == BASELINE_VERSION)
    check("accepted-checks", accepted.get("checks") == BASELINE_CHECKS)
    check("accepted-sha", accepted.get("zipSha256") == BASELINE_SHA256)
    check("accepted-evidence", (ROOT / str(accepted.get("evidence", ""))).is_file())

    migration = read_utf8("packages/state/migrations/012_delegation_graph_budget_foundation.sql")
    migrations = read_utf8("packages/state/src/migrations.ts")
    delegation = read_utf8("packages/conversations/src/delegation.ts")
    conversations = read_utf8("packages/conversations/src/service.ts")
    conversation_repository = read_utf8("packages/state/src/conversation-repository.ts")
    kernel = read_utf8("packages/agent-kernel/src/kernel.ts")
    browser_tools = read_utf8("packages/browser-runtime/src/tools.ts")
    protocol = read_utf8("services/agent-host/src/transport/operation-registry.ts")

    check("schema-12", f"OPENRILL_STATE_SCHEMA_VERSION = {SCHEMA} as const" in migrations)
    for table in ("run_budget_envelopes", "run_delegations", "run_delegation_events", "run_delegation_waits"):
        check(f"migration-table:{table}", f"CREATE TABLE {table}" in migration)
    check("wait-state", "state TEXT NOT NULL CHECK (state = 'WAITING_DELEGATION')" in migration)
    check("task-digest-only", "task_sha256" in migration and not re.search(r"task_(?:text|json)|raw_task|prompt_json", migration, re.I))
    check("observed-overshoot-persistable", not any(token in migration for token in (
        "used_turns <= max_turns", "used_model_calls <= max_model_calls", "used_tool_calls <= max_tool_calls",
        "used_input_tokens + used_output_tokens <= max_total_tokens",
    )))
    check("turn-aggregation-sum", len(re.findall(r"SELECT COALESCE\(SUM\(used_turns\),0\) turns", conversation_repository)) == 2)
    for token in ("DELEGATION_SCOPE_ESCALATION", "DELEGATION_DEPTH_EXCEEDED", "DELEGATION_ACTIVE_CHILD_LIMIT", "DELEGATION_TOTAL_CHILD_LIMIT", "DELEGATION_BUDGET_EXCEEDED", "DELEGATION_TIME_BUDGET_EXCEEDED"):
        check(f"delegation-error:{token}", token in delegation)
    for token in ("transitionDelegation", "cancellationOrder", "WAITING_DELEGATION", "taskSha256"):
        check(f"delegation-owner:{token}", token in delegation)
    check("legacy-budget-defaults", "maxTotalTokens: input.budget.maxTotalTokens ?? 65_536" in conversations and "maxDurationMs: input.budget.maxDurationMs ?? 15 * 60 * 1000" in conversations)
    check("shared-clock-domain", "options.conversations.currentTime()" in kernel and "public currentTime(): number" in conversations)
    check("total-token-enforcement", "AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED" in kernel)
    check("time-enforcement", "AGENT_TIME_BUDGET_EXCEEDED" in kernel)
    check("restart-wait-resumable", "delegationWaitRecoverable" in conversations and "waitingDelegation" in conversations)

    registered = re.findall(r'tool\(\s*"(browser\.[a-z]+)"', browser_tools)
    expected_browser = [
        "browser.status", "browser.open", "browser.list", "browser.navigate", "browser.snapshot", "browser.close",
        "browser.click", "browser.type", "browser.press", "browser.select", "browser.fill", "browser.wait",
        "browser.screenshot", "browser.download", "browser.evidence",
    ]
    check("browser-tools-retained-15", registered == expected_browser, json.dumps(registered))
    tool_runtime_sources = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted((ROOT / "packages/tool-runtime/src").glob("*.ts"))
    )
    code_surface = "\n".join([browser_tools, protocol, tool_runtime_sources])
    check("no-public-agent-spawn", not re.search(r'tool\(\s*["\']agent\.spawn["\']', code_surface))
    check("no-public-agent-wait", not re.search(r'tool\(\s*["\']agent\.wait["\']', code_surface))
    check("no-delegation-protocol", "agent.spawn" not in protocol and "agent.wait" not in protocol and "delegation." not in protocol)

    audit = read_utf8("reference/openclaw/STEP014A_DELEGATED_WORK_SOURCE_AUDIT.md")
    check("openclaw-archive-hash", OPENCLAW_SHA256 in audit)
    for hash_value in (
        "9fa23d8651e2991bf224676a7ceda7cc960ad3e1ddced721670040b8b48b90df",
        "30126778789afb1b6923a83b0df364f180e9dc64224c6059b459ba758d7b9918",
        "c51a30ccd51b3bc0b2de522eb46ac019f4f1de6f960b95fdde77090e5d2e5b80",
        "39c8e0047e7cb83762d74f3958d7edd5b1660022a2732e70195227f12ba95985",
    ):
        check(f"openclaw-file-hash:{hash_value[:8]}", hash_value in audit)

    registry = read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    gates = read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(122, 129):
        issue = f"OR-ISSUE-{number:03d}"
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
        elif name == "focused-delegation-boundaries":
            ok = ok and tap_pass(output, 10)
        elif name == "canonical-suite":
            ok = ok and tap_pass(output, 355)
        check(name, ok, "" if ok else failure_excerpt(name, output))

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    marker = (
        f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} baseline=STEP013CR2 "
        "delegation=FOUNDATION budget=TOTAL_TOKEN_TIME_DEPTH_CHILD wait=WAITING_DELEGATION "
        "scope=MONOTONIC transitions=VALIDATED tools=UNCHANGED_15 protocol=UNCHANGED reporter=TAP"
    )
    lines = [marker]
    for name, ok, detail in checks:
        if not ok:
            lines.append(f"OPENRILL_STEP014A_FAILURE check={name}")
            if detail:
                lines.append(detail)
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines), flush=True)
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
