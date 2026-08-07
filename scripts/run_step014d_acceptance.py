from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP014D_DELEGATED_WORK_CONTROL_UI_AND_WINDOWS_VERTICAL_SLICE"
VERSION = "0.14.3-step014d"
SCHEMA = 14
BASELINE = "STEP013CR2_SQLITE_NULL_PROTOTYPE_LIVE_ASSERTION_ALIGNMENT"
BASELINE_CHECKS = "163/163"
BASELINE_SHA256 = "c4314c2c9c877f503fc6bb84e04f5abc698f22c8e9104c826b7f0e2d328904fc"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP014D_ACCEPTANCE_REPORT.txt")
STAGE_LOG_DIR = REPORT.parent / "STEP014D_STAGES"
FAILURE_EXCERPT_LIMIT = 20_000
UNIT_TEST_FILES = [path.relative_to(ROOT).as_posix() for path in sorted((ROOT / "tests/unit").glob("*.test.mjs"))]
CANONICAL_EXPECTED = 402

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
    ("focused-delegation-control", ["node", "--test", "--test-reporter=tap", "tests/unit/delegation-control-step014d.test.mjs"], 180),
    ("focused-delegation-control-boundaries", ["node", "--test", "--test-reporter=tap", "tests/unit/delegation-control-boundaries-step014d.test.mjs"], 180),
    ("canonical-suite", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", *UNIT_TEST_FILES], 900),
    ("architecture", ["python", "scripts/check_architecture.py"], 120),
    ("exports", ["node", "scripts/check-exports.mjs"], 180),
    ("external-model-control-ui-live", ["node", "scripts/run-step014d-live.mjs"], 300),
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
    anchor = re.compile(r"^(?:not ok\b|# fail [1-9][0-9]*\b|\s*(?:AssertionError|Error(?: \[[^]]+\])?:|Traceback \(most recent call last\):)|.*OPENRILL_[A-Z0-9_]*(?:FAIL|FAILED|MISSING))")
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
    check("acceptance-script", scripts.get("acceptance:step014d") == "python scripts/run_step014d_acceptance.py")
    check("package-script", scripts.get("package:step014d") == "python scripts/package_step014d.py --output ../openrill-step014d-delegated-work-control-ui-windows-vertical-slice-v1.zip")

    required = [
        "packages/protocol/src/delegation-operations.ts", "packages/protocol/src/validation.ts",
        "packages/conversations/src/delegation.ts", "services/agent-host/src/transport/operation-registry.ts",
        "services/agent-host/src/transport/protocol-server.ts", "services/agent-host/src/lifecycle.ts",
        "apps/agent-web/src/browser-app.ts", "apps/agent-web/public/assets/app.css",
        "tests/unit/delegation-control-step014d.test.mjs", "tests/unit/delegation-control-boundaries-step014d.test.mjs",
        "scripts/run-step014d-live.mjs", "scripts/run_step014d_acceptance.py", "scripts/package_step014d.py",
        "scripts/sh_run_step014d_acceptance.cmd", "scripts/sh_run_step014d_acceptance.sh",
        "docs/plans/STEP014D_DELEGATED_WORK_CONTROL_UI_AND_WINDOWS_VERTICAL_SLICE.md",
        "docs/contracts/DELEGATED_WORK_CONTROL_SURFACE.md",
        "docs/adrs/ADR-0032-BOUNDED_DELEGATION_CONTROL_PROJECTION.md",
        "docs/validation/STEP014D_FAILURE_PREVENTION_AUDIT.md",
        "reference/validation/STEP014D_LOCAL_DETERMINISTIC_VALIDATION.md",
        "config/current-accepted-baseline.json",
    ] + [f"reference/validation/STEP014D_OR_ISSUE_{number}.md" for number in range(146, 157)]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    accepted = json.loads(read_utf8("config/current-accepted-baseline.json"))
    check("accepted-step", accepted.get("step") == BASELINE)
    check("accepted-checks", accepted.get("checks") == BASELINE_CHECKS)
    check("accepted-sha", accepted.get("zipSha256") == BASELINE_SHA256)
    check("accepted-evidence", (ROOT / str(accepted.get("evidence", ""))).is_file())

    migrations = read_utf8("packages/state/src/migrations.ts")
    check("schema-14-retained", f"OPENRILL_STATE_SCHEMA_VERSION = {SCHEMA} as const" in migrations)
    for number, name in ((12, "delegation_graph_budget_foundation"), (13, "delegation_result_delivery"), (14, "delegation_reservation_release_and_recovery")):
        check(f"migration-{number}-retained", (ROOT / f"packages/state/migrations/{number:03d}_{name}.sql").is_file())

    protocol = read_utf8("packages/protocol/src/delegation-operations.ts")
    validation = read_utf8("packages/protocol/src/validation.ts")
    registry = read_utf8("services/agent-host/src/transport/operation-registry.ts")
    host = read_utf8("services/agent-host/src/lifecycle.ts")
    delegation = read_utf8("packages/conversations/src/delegation.ts")
    ui = read_utf8("apps/agent-web/src/browser-app.ts")
    live = read_utf8("scripts/run-step014d-live.mjs")
    tools = read_utf8("packages/tools-delegation/src/index.ts")

    for operation in ("delegation.list", "delegation.get", "delegation.cancel"):
        check(f"operation:{operation}", f'name: "{operation}"' in registry)
    check("no-unsafe-delegation-operation", not re.search(r"delegation\.(?:spawn|wait|transcript|reasoning|raw)", registry))
    check("closed-list-validator", "delegation.list accepts rootRunId or parentRunId, not both" in validation and "boundedInteger(value.limit, 1, 200)" in validation)
    check("public-events-bounded", ".slice(-100)" in delegation)
    check("public-event-payload-absent", "payload: event.payload" not in delegation)
    check("public-task-hash-absent", "taskSha256:" not in protocol)
    check("public-reasoning-absent", not re.search(r"reasoning|transcript", protocol, re.I))
    check("tools-retained-two", 'name: "agent.spawn"' in tools and 'name: "agent.wait"' in tools)
    check("ui-route", '"delegations"' in ui and 'data-testid": `delegation-${item.delegationId}`' in ui)
    check("ui-tree-relation", "byParent.get(item.parentRunId)" in ui and "byParent.get(item.childRunId)" in ui and "childRunIds.has(item.parentRunId)" in ui)
    check("ui-bounded-detail", all(token in ui for token in ("selected.usage.turns", "selected.artifacts", "selected.events")))
    check("ui-operator-cancel", "Cancel subtree" in ui and "delegation.cancel" in ui)
    check("host-cancel-reuse", "subtreeCancellationOrder(before.childRunId)" in host and 'terminateDelegationOrder(order, "CANCELLED", "OPERATOR_CANCELLED")' in host)
    check("delegation-notice", 'publishNotice("delegation.updated"' in host)
    check("live-explicit-key", 'required("OPENAI_API_KEY")' in live)
    check("live-explicit-model", 'required("OPENRILL_STEP014D_MODEL")' in live and not re.search(r'model\s*=\s*["\'](?:gpt|o[1345])', live, re.I))
    check("live-parallel-nested", "agent.spawn twice without waiting" in live and "grandchild" in live)
    check("live-protocol", all(operation in live for operation in ("delegation.list", "delegation.get", "delegation.cancel")))
    check("live-chromium-ui", all(token in live for token in ("resolveChromiumExecutable", "nav-delegations", "delegation-tree-render", "delegation-detail-render")))
    check("live-orphan-marker", "chromium_orphan=0" in live)

    registry_doc = read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    gates_doc = read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(146, 157):
        issue = f"OR-ISSUE-{number}"
        check(f"registry:{issue}", issue in registry_doc)
        check(f"gate:{issue}", issue in gates_doc)

    package_manifest = json.loads(read_utf8("PACKAGE_MANIFEST.json"))
    check("manifest-current-step", package_manifest.get("step") == STEP)
    check("manifest-current-version", package_manifest.get("version") == VERSION)
    for relative in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        body = read_utf8(relative)
        check(f"root-current:{relative}", STEP in body and VERSION in body)
        check(f"root-accepted:{relative}", BASELINE in body and BASELINE_CHECKS in body and BASELINE_SHA256 in body)

    stage_expectations = {
        "focused-delegation-foundation": 15,
        "focused-delegation-foundation-boundaries": 10,
        "focused-delegated-execution": 9,
        "focused-delegated-execution-boundaries": 10,
        "focused-delegation-nested-recovery": 7,
        "focused-delegation-nested-recovery-boundaries": 9,
        "focused-delegation-control": 5,
        "focused-delegation-control-boundaries": 7,
        "canonical-suite": CANONICAL_EXPECTED,
    }
    for name, command, timeout in STAGES:
        ok, output = run_utf8(name, command, timeout)
        if name in stage_expectations:
            ok = ok and tap_pass(output, stage_expectations[name])
        if name == "external-model-control-ui-live":
            ok = ok and "STEP014D_EXTERNAL_MODEL_DELEGATED_WORK_PASS" in output and "chromium_orphan=0" in output
        check(name, ok, "" if ok else failure_excerpt(name, output))

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    marker = (
        f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} baseline=STEP013CR2 "
        "delegation=PROTOCOL_CONTROL_UI protocol=LIST_GET_CANCEL ui=PARENT_CHILD_TREE cancel=DEEPEST_FIRST "
        "external_model=NESTED_PARALLEL chromium=RENDERED privacy=BOUNDED reporter=TAP chromium_orphan=0"
    )
    lines = [marker]
    for name, ok, detail in checks:
        if not ok:
            lines.append(f"OPENRILL_STEP014D_FAILURE check={name}")
            if detail:
                lines.append(detail)
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines), flush=True)
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
