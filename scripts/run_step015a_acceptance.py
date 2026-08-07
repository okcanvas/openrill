from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP015A_EXECUTION_BACKEND_CONTRACT_AND_DOCKER_CONFINEMENT_PLAN_FOUNDATION"
VERSION = "0.15.0-step015a"
SCHEMA = 14
BASELINE = "STEP014_PRODUCT_CORE_ACCEPTED"
BASELINE_VERSION = "0.14.11-step014dr8"
BASELINE_CHECKS = "WINDOWS_357/358_PRODUCT_CORE_ACCEPTED"
BASELINE_SHA256 = "484c231d4998d9dc58c298624671cf7a084348567ab2779c5a4bce6f04f05054"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP015A_ACCEPTANCE_REPORT.txt")
STAGE_LOG_DIR = REPORT.parent / "STEP015A_STAGES"

STAGES: list[tuple[str, list[str], int]] = [
    ("source-version-alignment", ["python", "scripts/verify_source_version_alignment.py"], 60),
    ("workspace-lock-alignment", ["python", "scripts/verify_workspace_lock_alignment.py"], 60),
    ("workspace-module-links", ["python", "scripts/verify_workspace_module_links.py"], 60),
    ("source-root-boundary", ["python", "scripts/check_source_root_boundary.py"], 60),
    ("package-manifest-initial", ["python", "scripts/verify_package_manifest.py"], 120),
    ("focused-build", ["node", "scripts/workspace-runner.mjs", "build"], 300),
    ("focused-sandbox", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/sandbox-execution-backend-step015a.test.mjs"], 180),
    ("focused-validation-governance", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/validation-governance-step015a.test.mjs"], 180),
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
    check("acceptance-script", scripts.get("acceptance:step015a") == "python scripts/run_step015a_acceptance.py")
    check("package-script", scripts.get("package:step015a") == "python scripts/package_step015a.py --output ../openrill-step015a-execution-backend-contract-docker-confinement-plan-foundation-v1.zip")

    required = [
        "packages/sandbox/src/types.ts",
        "packages/sandbox/src/policy.ts",
        "packages/sandbox/src/host-backend.ts",
        "packages/sandbox-docker/src/index.ts",
        "tests/unit/sandbox-execution-backend-step015a.test.mjs",
        "tests/unit/validation-governance-step015a.test.mjs",
        "docs/contracts/SANDBOX.md",
        "docs/governance/PRACTICAL_VALIDATION_AND_FAILURE_ASSET_GOVERNANCE.md",
        "docs/validation/STEP014_FAILURE_ASSET_LEDGER.md",
        "docs/plans/STEP014_PRODUCT_ACCEPTANCE_CLOSURE.md",
        "docs/plans/STEP015A_EXECUTION_BACKEND_CONTRACT_AND_DOCKER_CONFINEMENT_PLAN_FOUNDATION.md",
        "docs/validation/STEP015A_FAILURE_PREVENTION_AUDIT.md",
        "reference/validation/STEP014DR8_WINDOWS_357_OF_358_EVIDENCE.txt",
        "reference/validation/STEP014_PRODUCT_CORE_ACCEPTANCE_EVIDENCE.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    accepted = json.loads(read_utf8("config/current-accepted-baseline.json"))
    check("accepted-model", accepted.get("acceptanceModel") == "DIMENSIONAL")
    check("accepted-step", accepted.get("step") == BASELINE)
    check("accepted-version", accepted.get("version") == BASELINE_VERSION)
    check("accepted-checks", accepted.get("checks") == BASELINE_CHECKS)
    check("accepted-sha", accepted.get("zipSha256") == BASELINE_SHA256)
    check("accepted-product-core", accepted.get("dimensions", {}).get("productCore") == "ACCEPTED")
    check("accepted-ui-known-issue", accepted.get("dimensions", {}).get("optionalUi") == "KNOWN_ISSUE_OR_ISSUE_190")
    check("accepted-harness-known-issue", accepted.get("dimensions", {}).get("harness") == "KNOWN_ISSUE_OR_ISSUE_191")

    sandbox = read_utf8("packages/sandbox/src/policy.ts") + read_utf8("packages/sandbox/src/host-backend.ts")
    docker = read_utf8("packages/sandbox-docker/src/index.ts")
    process_tool = read_utf8("packages/tools-process/src/index.ts")
    migrations = read_utf8("packages/state/src/migrations.ts")
    runner = read_utf8("scripts/run_step015a_acceptance.py")
    check("schema-retained-14", f"OPENRILL_STATE_SCHEMA_VERSION = {SCHEMA} as const" in migrations)
    check("deny-extra-bind", "SANDBOX_EXTRA_BIND_DENIED" in sandbox)
    check("deny-docker-socket", "SANDBOX_DOCKER_SOCKET_DENIED" in sandbox)
    check("explicit-network", "allowOutboundNetwork" in sandbox and 'networkMode ?? "NONE"' in sandbox)
    check("explicit-host-fallback", "allowHostFallback" in sandbox and 'fallback ?? "DENY"' in sandbox)
    check("host-not-sandboxed", "sandboxed: false" in sandbox and "sandboxed: true" not in read_utf8("packages/sandbox/src/host-backend.ts"))
    check("docker-pinned-image", "SANDBOX_IMAGE_NOT_PINNED" in docker and "@sha256:" in docker)
    for token in ("--read-only", "--cap-drop", "no-new-privileges", "--pids-limit", "--memory", "--mount"):
        check(f"docker-confinement:{token}", token in docker)
    check("docker-exact-label-prune", "label=openrill.managed=true" in docker and "label=openrill.profile=" in docker)
    check("process-integration-deferred", "@openrill/sandbox" not in process_tool)
    stage_source = runner[runner.index("STAGES:"):runner.index("def read_utf8")]
    check("no-browser-stage", not re.search(r"run_step014dr8_acceptance|chromium|playwright|browser-live|external-model-parallel-live|deterministic-nested-control-ui-live", stage_source, re.I))

    registry = read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    gates = read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(190, 197):
        issue = f"OR-ISSUE-{number}"
        check(f"registry:{issue}", issue in registry)
        check(f"issue-file:{issue}", (ROOT / (f"reference/validation/STEP015A_OR_ISSUE_{number}.md" if number in (194, 195, 196) else f"reference/validation/STEP014_OR_ISSUE_{number}.md")).is_file())
    check("independent-dimension-gate", "Independent acceptance dimensions" in gates)
    check("stop-loss-gate", "One-correction stop-loss" in gates)
    check("time-ledger-gate", "Failure asset time fields" in gates)

    manifest = json.loads(read_utf8("PACKAGE_MANIFEST.json"))
    check("manifest-current-step", manifest.get("step") == STEP)
    check("manifest-current-version", manifest.get("version") == VERSION)

    for name, command, timeout in STAGES:
        ok, output, elapsed = run_utf8(name, command, timeout)
        automated_seconds += elapsed
        if name == "focused-sandbox":
            ok = ok and tap_pass(output, 12)
        elif name == "focused-validation-governance":
            ok = ok and tap_pass(output, 7)
        elif name == "canonical-suite":
            match = re.search(r"OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0", output)
            ok = ok and bool(match) and match.group(3) == match.group(4)
        check(name, ok, "" if ok else output[-12000:])

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    marker = (
        f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} "
        "previous_product=STEP014_PRODUCT_CORE_ACCEPTED validation=PROFILE_BASED browser=NOT_RUN "
        "backend=HOST_DOCKER_CONTRACT workspace=ONE_ROOT authority=MONOTONIC binds=EXTRA_DENIED "
        "docker_socket=DENIED network=NONE_DEFAULT fallback=EXPLICIT image=DIGEST_PINNED "
        "host_sandbox_claim=FALSE docker_live=DEFERRED_TO_STEP015B "
        f"automated_run_seconds={automated_seconds:.3f}"
    )
    lines = [marker]
    for name, ok, detail in checks:
        if not ok:
            lines.append(f"OPENRILL_STEP015A_FAILURE check={name}")
            if detail:
                lines.append(detail)
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines), flush=True)
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
