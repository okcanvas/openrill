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
STEP = "STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT"
VERSION = "0.15.1-step015b"
SCHEMA = 15
PREVIOUS_CANDIDATE = "STEP015A_EXECUTION_BACKEND_CONTRACT_AND_DOCKER_CONFINEMENT_PLAN_FOUNDATION"
ACCEPTED_PRODUCT_BASELINE = "STEP014_PRODUCT_CORE_ACCEPTED"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP015B_ACCEPTANCE_REPORT.txt")
STAGE_LOG_DIR = REPORT.parent / "STEP015B_STAGES"

BASE_STAGES: list[tuple[str, list[str], int]] = [
    ("source-version-alignment", ["python", "scripts/verify_source_version_alignment.py"], 60),
    ("workspace-lock-alignment", ["python", "scripts/verify_workspace_lock_alignment.py"], 60),
    ("workspace-module-links", ["python", "scripts/verify_workspace_module_links.py"], 60),
    ("source-root-boundary", ["python", "scripts/check_source_root_boundary.py"], 60),
    ("package-manifest-initial", ["python", "scripts/verify_package_manifest.py"], 120),
    ("workspace-build", ["node", "scripts/workspace-runner.mjs", "build"], 300),
    ("focused-step015b-product", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/process-docker-backend-step015b.test.mjs"], 180),
    ("affected-process-state-regression", [
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap",
        "tests/unit/sandbox-execution-backend-step015a.test.mjs",
        "tests/unit/process-approval-step009.test.mjs",
        "tests/unit/process-manager-close-step011r7.test.mjs",
        "tests/unit/state-step005.test.mjs",
    ], 300),
    ("focused-validation-governance", [
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap",
        "tests/unit/validation-governance-step015a.test.mjs",
        "tests/unit/validation-governance-step015b.test.mjs",
        "tests/unit/docker-container-id-evidence-step015bh1.test.mjs",
    ], 180),
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
    parser = argparse.ArgumentParser(description="Run OpenRill STEP015B source/package acceptance")
    parser.add_argument("--require-docker-live", action="store_true")
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
    check("acceptance-script", scripts.get("acceptance:step015b") == "python scripts/run_step015b_acceptance.py")
    check("live-acceptance-script", scripts.get("acceptance:step015b:live") == "python scripts/run_step015b_acceptance.py --require-docker-live")
    check("package-script", scripts.get("package:step015b") == "python scripts/package_step015b.py --output ../openrill-step015b-process-tool-docker-backend-integration-live-confinement-v1.zip")

    required = [
        "packages/state/migrations/015_process_execution_backend_confinement.sql",
        "packages/tools-process/src/index.ts",
        "services/agent-host/src/lifecycle.ts",
        "tests/unit/process-docker-backend-step015b.test.mjs",
        "scripts/run-step015b-docker-live.mjs",
        "docs/plans/STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT.md",
        "reference/validation/STEP015B_OR_ISSUE_197.md",
        "reference/validation/STEP015B_OR_ISSUE_198.md",
        "reference/validation/STEP015B_OR_ISSUE_199.md",
        "reference/validation/STEP015B_OR_ISSUE_200.md",
        "reference/validation/STEP015B_OR_ISSUE_201.md",
        "reference/validation/STEP015B_OR_ISSUE_202.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    accepted = json.loads(read_utf8("config/current-accepted-baseline.json"))
    check("accepted-baseline-not-overstated", accepted.get("step") == ACCEPTED_PRODUCT_BASELINE)
    check("accepted-dimensional-model-retained", accepted.get("acceptanceModel") == "DIMENSIONAL")

    config_source = read_utf8("packages/config/src/schema.ts") + read_utf8("packages/config/src/types.ts")
    process_source = read_utf8("packages/tools-process/src/index.ts")
    docker_source = read_utf8("packages/sandbox-docker/src/index.ts")
    host_source = read_utf8("services/agent-host/src/lifecycle.ts")
    state_source = read_utf8("packages/state/src/migrations.ts") + read_utf8("packages/state/src/approval-process-repository.ts")
    runner_source = read_utf8("scripts/run_step015b_acceptance.py")

    check("schema-15", f"OPENRILL_STATE_SCHEMA_VERSION = {SCHEMA} as const" in state_source)
    for token in ("backend_kind", "backend_handle_id", "sandboxed", "confinement_json"):
        check(f"state-process-column:{token}", token in read_utf8("packages/state/migrations/015_process_execution_backend_confinement.sql"))
    check("state-backend-bind", "bindProcessBackend" in state_source)
    check("config-backend-selector", 'backend?: "host" | "docker"' in config_source)
    check("config-fallback-deny", 'fallback?: "deny" | "host"' in config_source)
    check("config-digest-required", "DIGEST" in config_source and "execution.docker.image" in config_source)
    check("process-backend-routing", "backendRouting" in process_source and "#selectBackend" in process_source)
    check("process-proof-output", "confinement: activeHandle.confinementProof" in process_source)
    check("process-proof-durable", "bindProcessBackend" in process_source)
    check("root-cwd-normalized", 'cwd: cwd.relativePath || "."' in process_source)
    check("selection-before-process-artifacts", process_source.index("selected = await this.#selectBackend") < process_source.index("await mkdir(this.options.rootDirectory"))
    check("environment-before-backend-prepare", process_source.index("environment = await this.#environment") < process_source.index("selected.backend.prepare"))
    check("docker-timeout-kills-container", 'if (result.timedOut)' in docker_source and '["kill", containerId]' in docker_source)
    check("host-product-wiring", "createDockerExecutionBackend" in host_source and "backendRouting" in host_source)
    check("browser-not-in-acceptance-profile", not re.search(r"chromium|playwright|control-ui|browser-live", runner_source[runner_source.index("BASE_STAGES:"):runner_source.index("def read_utf8")], re.I))
    check("or-issue-197-registered", "OR-ISSUE-197" in read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"))
    check("or-issue-197-gated", "OR-ISSUE-197" in read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md"))
    check("or-issue-198-registered", "OR-ISSUE-198" in read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"))
    check("or-issue-198-gated", "OR-ISSUE-198" in read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md"))
    check("or-issue-199-registered", "OR-ISSUE-199" in read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"))
    check("or-issue-199-gated", "OR-ISSUE-199" in read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md"))
    check("or-issue-200-registered", "OR-ISSUE-200" in read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"))
    check("or-issue-200-gated", "OR-ISSUE-200" in read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md"))
    check("or-issue-201-registered", "OR-ISSUE-201" in read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"))
    check("or-issue-201-gated", "OR-ISSUE-201" in read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md"))
    check("or-issue-202-registered", "OR-ISSUE-202" in read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"))
    check("or-issue-202-gated", "OR-ISSUE-202" in read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md"))

    manifest = json.loads(read_utf8("PACKAGE_MANIFEST.json"))
    check("manifest-current-step", manifest.get("step") == STEP)
    check("manifest-current-version", manifest.get("version") == VERSION)

    stages = list(BASE_STAGES)
    docker_live_state = "PENDING_ENV"
    if args.require_docker_live:
        if not os.environ.get("OPENRILL_STEP015B_DOCKER_IMAGE"):
            check("docker-live-environment", False, "OPENRILL_STEP015B_DOCKER_IMAGE is required")
            docker_live_state = "MISSING_ENV"
        else:
            stages.append(("docker-live-confinement", ["node", "scripts/run-step015b-docker-live.mjs"], 600))
            docker_live_state = "RUNNING"

    for name, command, timeout in stages:
        ok, output, elapsed = run_utf8(name, command, timeout)
        automated_seconds += elapsed
        if name == "focused-step015b-product":
            ok = ok and tap_pass(output, 9)
        elif name == "affected-process-state-regression":
            ok = ok and tap_pass(output, 40)
        elif name == "focused-validation-governance":
            ok = ok and tap_pass(output, 22)
        elif name == "canonical-suite":
            match = re.search(r"OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0", output)
            ok = ok and bool(match) and match.group(3) == match.group(4)
        elif name == "docker-live-confinement":
            ok = ok and bool(re.search(rf"^{STEP} checks=(\d+)/(\1) state=PASSED schema={SCHEMA} .*browser=NOT_RUN$", output, re.MULTILINE))
            docker_live_state = "PASSED" if ok else "FAILED"
        check(name, ok, "" if ok else output[-12000:])

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    promotion = "READY" if docker_live_state == "PASSED" and state == "PASSED" else "DOCKER_LIVE_PENDING" if state == "PASSED" else "BLOCKED"
    marker = (
        f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} "
        f"previous_candidate={PREVIOUS_CANDIDATE} accepted_product_baseline={ACCEPTED_PRODUCT_BASELINE} "
        "source=ACCEPTED_PROFILE package=CANDIDATE process_tool=BACKEND_ROUTED backend=HOST_DOCKER "
        "fallback=EXPLICIT confinement=DURABLE state_upgrade=14_TO_15 browser=NOT_RUN "
        f"docker_live={docker_live_state} live_harness=STEP015B_H1_CONTAINER_ID_EVIDENCE promotion={promotion} automated_run_seconds={automated_seconds:.3f}"
    )
    lines = [marker]
    for name, ok, detail in checks:
        if not ok:
            lines.append(f"OPENRILL_STEP015B_FAILURE check={name}")
            if detail:
                lines.append(detail)
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines), flush=True)
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
