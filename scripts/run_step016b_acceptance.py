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
STEP = "STEP016B_FIRST_RUN_MODEL_CONNECTIVITY_AND_LOCAL_CONVERSATION_FLOW"
VERSION = "0.16.2-step016b"
SCHEMA = 15
ACCEPTED_PRODUCT_BASELINE = "STEP016AR1_WINDOWS_DPAPI_ENCODED_COMMAND_ARGUMENT_TRANSPORT_ALIGNMENT"
ACCEPTED_CHECKS = "WINDOWS_DPAPI_75/75"
ACCEPTED_SHA = "8a4c0574fc90faffd332de861aab32f636e01694e8619a6c009700904aad3325"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP016B_ACCEPTANCE_REPORT.txt")
STAGE_LOG_DIR = REPORT.parent / "STEP016B_STAGES"

BASE_STAGES: list[tuple[str, list[str], int]] = [
    ("source-version-alignment", ["python", "scripts/verify_source_version_alignment.py"], 60),
    ("workspace-lock-alignment", ["python", "scripts/verify_workspace_lock_alignment.py"], 60),
    ("workspace-module-links", ["python", "scripts/verify_workspace_module_links.py"], 60),
    ("source-root-boundary", ["python", "scripts/check_source_root_boundary.py"], 60),
    ("package-manifest-initial", ["python", "scripts/verify_package_manifest.py"], 120),
    ("workspace-build", ["node", "scripts/workspace-runner.mjs", "build"], 300),
    ("focused-step016b-product", [
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap",
        "tests/unit/first-local-conversation-step016b.test.mjs",
    ], 180),
    ("affected-first-run-regression", [
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap",
        "tests/unit/cli-foundation.test.mjs",
        "tests/unit/cli-host-foundation-step002.test.mjs",
        "tests/unit/cli-config-step003.test.mjs",
        "tests/unit/config-step003.test.mjs",
        "tests/unit/host-lifecycle.test.mjs",
        "tests/unit/model-openai-responses-step007.test.mjs",
        "tests/unit/agent-kernel-step007.test.mjs",
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
    ], 240),
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


def tap_pass(output: str, expected: int) -> bool:
    return all(re.search(pattern, output, re.MULTILINE) for pattern in (
        rf"^# tests {expected}$",
        rf"^# pass {expected}$",
        r"^# fail 0$",
        r"^# cancelled 0$",
        r"^# skipped 0$",
    ))


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
    parser = argparse.ArgumentParser(description="Run OpenRill STEP016B source/package acceptance")
    parser.add_argument("--require-windows-first-run-live", action="store_true")
    args = parser.parse_args()

    print("OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal", flush=True)
    clean()
    print("OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal", flush=True)

    checks: list[tuple[str, bool, str]] = []
    automated_seconds = 0.0

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8("package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("root-description", "STEP016B" in package.get("description", ""))
    check("acceptance-script", scripts.get("acceptance:step016b") == "python scripts/run_step016b_acceptance.py")
    check("live-acceptance-script", scripts.get("acceptance:step016b:live") == "python scripts/run_step016b_acceptance.py --require-windows-first-run-live")
    check("live-script", scripts.get("first-run-live:step016b") == "node scripts/run-step016b-first-local-conversation-live.mjs")
    check("package-script", scripts.get("package:step016b") == "python scripts/package_step016b.py --output ../openrill-step016b-first-run-model-connectivity-local-conversation-flow-v1.zip")

    required = [
        "apps/agent-cli/src/index.ts",
        "services/agent-host/src/lifecycle.ts",
        "services/agent-host/src/model-resolver.ts",
        "packages/agent-kernel/src/kernel.ts",
        "tests/unit/first-local-conversation-step016b.test.mjs",
        "tests/unit/validation-governance-step016b.test.mjs",
        "scripts/run-step016b-first-local-conversation-live.mjs",
        "docs/adrs/ADR-0038-EPHEMERAL-HOST-FIRST-CONVERSATION-AND-LOOPBACK-PROMOTION.md",
        "docs/plans/STEP016B_FIRST_RUN_MODEL_CONNECTIVITY_AND_LOCAL_CONVERSATION_FLOW.md",
        "reference/validation/STEP016AR1_WINDOWS_DPAPI_LIVE_ACCEPTANCE.md",
        "reference/validation/STEP016B_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md",
        "reference/validation/STEP016B_OR_ISSUE_208.md",
        "reference/validation/STEP016B_OR_ISSUE_209.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    accepted = json.loads(read_utf8("config/current-accepted-baseline.json"))
    check("accepted-baseline", accepted.get("step") == ACCEPTED_PRODUCT_BASELINE)
    check("accepted-checks", accepted.get("checks") == ACCEPTED_CHECKS)
    check("accepted-sha", accepted.get("zipSha256") == ACCEPTED_SHA)
    check("accepted-version", accepted.get("version") == "0.16.1-step016ar1")
    check("accepted-dimensional", accepted.get("acceptanceModel") == "DIMENSIONAL")

    cli = read_utf8("apps/agent-cli/src/index.ts")
    host = read_utf8("services/agent-host/src/lifecycle.ts")
    resolver = read_utf8("services/agent-host/src/model-resolver.ts")
    kernel = read_utf8("packages/agent-kernel/src/kernel.ts")
    live = read_utf8("scripts/run-step016b-first-local-conversation-live.mjs")
    runner = read_utf8("scripts/run_step016b_acceptance.py")
    plan = read_utf8("docs/plans/STEP016B_FIRST_RUN_MODEL_CONNECTIVITY_AND_LOCAL_CONVERSATION_FLOW.md")
    handoff = read_utf8("HANDOFF.md")
    registry = read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    gates = read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md")

    check("ask-command", '"ask"' in cli and "runConversation" in cli)
    check("ask-stdin", "requires a non-empty prompt on stdin" in cli and "readStdin" in cli)
    check("ask-no-prompt-argv", "ask accepts only --profile, --workspace-id, --provider, --timeout-ms, and --json" in cli)
    check("ask-ephemeral-host", "port: 0" in cli and 'hostMode: "EPHEMERAL"' in cli)
    check("ask-clean-close", 'host?.close("ask-complete")' in cli)
    check("host-durable-create", "conversations.create" in host and "conversations.send" in host)
    check("host-terminal-run", "executeUntilTerminal" in host and "LocalConversationResult" in host)
    check("host-os-secret-provider", "osSecretProvider" in host)
    check("resolver-os-secret-provider", "osSecretProvider" in resolver and "createOpenAIResponsesAdapter" in resolver)
    check("typed-model-failure", "error.cause instanceof ModelAdapterError" in kernel and "modelCause?.code" in kernel)
    check("live-loopback", 'server.listen(0, "127.0.0.1"' in live)
    check("live-real-dpapi", "OPENRILL_STEP016B_WINDOWS_DPAPI_REQUIRED" in live and '"setup"' in live and '"ask"' in live)
    check("live-durable-state", "openOpenRillStateDatabase" in live and "durable-model-invocation" in live)
    check("live-clean-host", "ephemeral-host-closed" in live and "cleanup=QUIESCENT" in live)
    check("live-no-external-model", "external_model=NOT_RUN" in live and "api.openai.com" not in live)
    check("live-no-browser", "browser=NOT_RUN" in live and not re.search(r"chromium|playwright", live, re.I))
    check("connector-deferred", "no Connector or Mattermost implementation" in plan and "DEFERRED_NO_REAL_SYSTEM" in handoff)
    check("schema-retained", "state_schema=15" in plan)
    check("human-time-not-invented", "human_work_minutes=NOT_RECORDED" in plan)
    for issue in ("OR-ISSUE-190", "OR-ISSUE-191", "OR-ISSUE-206", "OR-ISSUE-207", "OR-ISSUE-208", "OR-ISSUE-209"):
        check(f"issue-visible:{issue}", all(issue in body for body in (handoff, registry, gates)))
    stage_source = runner[runner.index("BASE_STAGES:"):runner.index("def read_utf8")]
    check("no-browser-stage", not re.search(r"chromium|playwright|control-ui|browser-live", stage_source, re.I))
    check("no-external-model-stage", not re.search(r"external-model|openai-live|api\.openai\.com", stage_source, re.I))
    check("current-live-entrypoint", "scripts/run-step016b-first-local-conversation-live.mjs" in runner)

    manifest = json.loads(read_utf8("PACKAGE_MANIFEST.json"))
    check("manifest-current-step", manifest.get("step") == STEP)
    check("manifest-current-version", manifest.get("version") == VERSION)

    stages = list(BASE_STAGES)
    live_state = "PENDING_ENV"
    if args.require_windows_first_run_live:
        if os.name != "nt":
            check("windows-first-run-environment", False, "Windows is required")
            live_state = "UNSUPPORTED_ENV"
        else:
            stages.append(("windows-first-run-live", ["node", "scripts/run-step016b-first-local-conversation-live.mjs"], 240))
            live_state = "RUNNING"

    for name, command, timeout in stages:
        ok, output, elapsed = run_utf8(name, command, timeout)
        automated_seconds += elapsed
        if name == "focused-step016b-product":
            ok = ok and tap_pass(output, 4)
        elif name == "affected-first-run-regression":
            ok = ok and tap_pass(output, 16)
        elif name == "focused-validation-governance":
            ok = ok and tap_pass(output, 46)
        elif name == "canonical-suite":
            match = re.search(r"OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0", output)
            ok = ok and bool(match) and match.group(3) == match.group(4)
        elif name == "windows-first-run-live":
            ok = ok and bool(re.search(
                rf"^{STEP} checks=19/19 state=PASSED version={re.escape(VERSION)} schema={SCHEMA} .*model_transport=LOOPBACK_RESPONSES .*conversation=DURABLE .*external_model=NOT_RUN browser=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM cleanup=QUIESCENT$",
                output,
                re.MULTILINE,
            ))
            live_state = "PASSED" if ok else "FAILED"
        check(name, ok, "" if ok else output[-12000:])

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    promotion = "READY" if live_state == "PASSED" and state == "PASSED" else "WINDOWS_FIRST_RUN_LIVE_PENDING" if state == "PASSED" else "BLOCKED"
    marker = (
        f"{STEP} checks={passed}/{len(checks)} state={state} version={VERSION} schema={SCHEMA} "
        f"accepted_product_baseline={ACCEPTED_PRODUCT_BASELINE} accepted_checks={ACCEPTED_CHECKS} "
        "source=ACCEPTED_PROFILE package=CANDIDATE local_setup=RETAINED doctor=RETAINED first_run=IMPLEMENTED "
        "prompt=STDIN_ONLY conversation=DURABLE model_transport=LOOPBACK_RESPONSES_SOURCE_ACCEPTED "
        "secret_persistence=REFERENCE_ONLY external_model=NOT_RUN browser=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM "
        f"windows_first_run_live={live_state} promotion={promotion} automated_run_seconds={automated_seconds:.3f}"
    )
    lines = [marker]
    for name, ok, detail in checks:
        if not ok:
            lines.append(f"OPENRILL_STEP016B_FAILURE check={name}")
            if detail:
                lines.append(detail)
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines), flush=True)
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
