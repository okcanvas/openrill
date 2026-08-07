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
STEP = "STEP016AR1_WINDOWS_DPAPI_ENCODED_COMMAND_ARGUMENT_TRANSPORT_ALIGNMENT"
VERSION = "0.16.1-step016ar1"
SCHEMA = 15
ACCEPTED_PRODUCT_BASELINE = "STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT"
ACCEPTED_CHECKS = "WINDOWS_DOCKER_64/64"
ACCEPTED_SHA = "1990b189166a2547e0ae5aa81479591914b302e816bb088fd56e4a44f9ffd4db"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP016AR1_ACCEPTANCE_REPORT.txt")
STAGE_LOG_DIR = REPORT.parent / "STEP016AR1_STAGES"

BASE_STAGES: list[tuple[str, list[str], int]] = [
    ("source-version-alignment", ["python", "scripts/verify_source_version_alignment.py"], 60),
    ("workspace-lock-alignment", ["python", "scripts/verify_workspace_lock_alignment.py"], 60),
    ("workspace-module-links", ["python", "scripts/verify_workspace_module_links.py"], 60),
    ("source-root-boundary", ["python", "scripts/check_source_root_boundary.py"], 60),
    ("package-manifest-initial", ["python", "scripts/verify_package_manifest.py"], 120),
    ("workspace-build", ["node", "scripts/workspace-runner.mjs", "build"], 300),
    ("focused-step016ar1-product", [
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap",
        "tests/unit/os-secret-provider-step016a.test.mjs",
        "tests/unit/local-setup-doctor-step016a.test.mjs",
        "tests/unit/windows-dpapi-argument-transport-step016ar1.test.mjs",
    ], 180),
    ("affected-cli-config-regression", [
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap",
        "tests/unit/cli-foundation.test.mjs",
        "tests/unit/cli-host-foundation-step002.test.mjs",
        "tests/unit/cli-config-step003.test.mjs",
        "tests/unit/config-step003.test.mjs",
    ], 240),
    ("focused-validation-governance", [
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap",
        "tests/unit/validation-governance-step015a.test.mjs",
        "tests/unit/validation-governance-step015b.test.mjs",
        "tests/unit/docker-container-id-evidence-step015bh1.test.mjs",
        "tests/unit/validation-governance-step016a.test.mjs",
        "tests/unit/windows-dpapi-argument-transport-step016ar1.test.mjs",
        "tests/unit/windows-dpapi-live-entrypoint-step016ar1h1.test.mjs",
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
    parser = argparse.ArgumentParser(description="Run OpenRill STEP016AR1 source/package acceptance")
    parser.add_argument("--require-windows-dpapi-live", action="store_true")
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
    check("root-description", "STEP016AR1" in package.get("description", ""))
    check("acceptance-script", scripts.get("acceptance:step016ar1") == "python scripts/run_step016ar1_acceptance.py")
    check("live-acceptance-script", scripts.get("acceptance:step016ar1:live") == "python scripts/run_step016ar1_acceptance.py --require-windows-dpapi-live")
    check("live-script", scripts.get("windows-dpapi-live:step016ar1") == "node scripts/run-step016ar1-windows-dpapi-live.mjs")
    check("package-script", scripts.get("package:step016ar1") == "python scripts/package_step016ar1.py --output ../openrill-step016ar1-windows-dpapi-encoded-command-argument-transport-alignment-v1.zip")
    check("harness-package-script", scripts.get("package:step016ar1:h1") == "python scripts/package_step016ar1.py --output ../openrill-step016ar1-h1-current-live-entrypoint-marker-alignment-v1.zip")

    required = [
        "packages/config/src/os-secrets.ts",
        "apps/agent-cli/src/operational.ts",
        "tests/unit/os-secret-provider-step016a.test.mjs",
        "tests/unit/local-setup-doctor-step016a.test.mjs",
        "tests/unit/validation-governance-step016a.test.mjs",
        "tests/unit/windows-dpapi-argument-transport-step016ar1.test.mjs",
        "scripts/run-step016ar1-windows-dpapi-live.mjs",
        "reference/validation/STEP016AR1_OR_ISSUE_206.md",
        "reference/validation/STEP016AR1_OR_ISSUE_207.md",
        "reference/validation/STEP016AR1_WINDOWS_DPAPI_LIVE_ATTEMPT_1.md",
        "tests/unit/windows-dpapi-live-entrypoint-step016ar1h1.test.mjs",
        "docs/plans/STEP016AR1_WINDOWS_DPAPI_ENCODED_COMMAND_ARGUMENT_TRANSPORT_ALIGNMENT.md",
        "reference/validation/STEP015B_WINDOWS_DOCKER_LIVE_ACCEPTANCE.md",
        "reference/validation/STEP016A_OR_ISSUE_204.md",
        "reference/validation/STEP016A_OR_ISSUE_205.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    accepted = json.loads(read_utf8("config/current-accepted-baseline.json"))
    check("accepted-baseline", accepted.get("step") == ACCEPTED_PRODUCT_BASELINE)
    check("accepted-checks", accepted.get("checks") == ACCEPTED_CHECKS)
    check("accepted-sha", accepted.get("zipSha256") == ACCEPTED_SHA)
    check("accepted-dimensional", accepted.get("acceptanceModel") == "DIMENSIONAL")

    cli = read_utf8("apps/agent-cli/src/index.ts")
    operational = read_utf8("apps/agent-cli/src/operational.ts")
    os_secrets = read_utf8("packages/config/src/os-secrets.ts")
    secrets = read_utf8("packages/config/src/secrets.ts")
    runner = read_utf8("scripts/run_step016ar1_acceptance.py")
    plan = read_utf8("docs/plans/STEP016AR1_WINDOWS_DPAPI_ENCODED_COMMAND_ARGUMENT_TRANSPORT_ALIGNMENT.md")

    check("setup-command", '"setup"' in cli and "runSetupCommand" in cli)
    check("doctor-command", '"doctor"' in cli and "runDoctorCommand" in cli)
    check("no-literal-api-key-option", not re.search(r'--api-key(?:[=\\s\"] )?', cli.replace("--api-key-stdin", "")))
    check("stdin-secret-option", "--api-key-stdin" in cli)
    check("explicit-endpoint", "setup requires --endpoint" in operational)
    check("explicit-model", "setup requires --model" in operational)
    check("workspace-before-secret", operational.index("createWorkspaceCatalog") < operational.index("secretProvider.inspect"))
    check("secret-rollback", "priorValue" in operational and "OS secret rollback" in operational)
    check("dpapi-protected-data", "ProtectedData" in os_secrets)
    check("dpapi-current-user", "DataProtectionScope]::CurrentUser" in os_secrets)
    check("dpapi-encoded-command", '"-EncodedCommand"' in os_secrets and '"-Command"' not in os_secrets)
    check("dpapi-metadata-env", "OPENRILL_DPAPI_OPERATION" in os_secrets and "OPENRILL_DPAPI_PATH" in os_secrets)
    check("dpapi-bounded-failure-evidence", "commandFailureDetail" in os_secrets)
    check("interactive-secure-string", "Read-Host -Prompt $prompt -AsSecureString" in os_secrets)
    check("stdin-not-argv", "[Console]::In.ReadToEnd()" in os_secrets and "actual-secret-value" not in os_secrets)
    check("interactive-not-noninteractive", '...(interactive ? [] : ["-NonInteractive"])' in os_secrets)
    check("os-resolution-wired", 'return await osProvider({ ...options, env }).get(reference.key)' in secrets)
    for token in ("config.source", "config.recovery", "model.providers", "secret.provider", "workspaces", "execution.backend"):
        check(f"doctor:{token}", token in operational)
    check("doctor-no-model-call", "model network" not in operational.lower() and "responses.create" not in operational)
    stage_source = runner[runner.index("BASE_STAGES:"):runner.index("def read_utf8")]
    check("no-browser-stage", not re.search(r"chromium|playwright|control-ui|browser-live", stage_source, re.I))
    check("no-external-model-stage", not re.search(r"external-model|openai-live|model-connectivity", stage_source, re.I))
    check("connector-deferred", "no Mattermost or Connector SDK" in plan)
    check("schema-retained", "state_schema=15" in plan)
    check("human-time-not-invented", "human_work_minutes=NOT_RECORDED" in plan)
    registry = read_utf8("docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    gates = read_utf8("docs/testing/RECURRENCE_PREVENTION_GATES.md")
    handoff = read_utf8("HANDOFF.md")
    check("issue-204-registered", all("OR-ISSUE-204" in body for body in (registry, gates, handoff)))
    check("issue-205-registered", all("OR-ISSUE-205" in body for body in (registry, gates, handoff)))
    check("issue-207-registered", all("OR-ISSUE-207" in body for body in (registry, gates, handoff)))
    check("current-live-entrypoint", "scripts/run-step016ar1-windows-dpapi-live.mjs" in runner and "scripts/run-step016a-windows-dpapi-live.mjs" not in runner[runner.index("if args.require_windows_dpapi_live"):])

    manifest = json.loads(read_utf8("PACKAGE_MANIFEST.json"))
    check("manifest-current-step", manifest.get("step") == STEP)
    check("manifest-current-version", manifest.get("version") == VERSION)

    stages = list(BASE_STAGES)
    live_state = "PENDING_ENV"
    if args.require_windows_dpapi_live:
        if os.name != "nt":
            check("windows-dpapi-environment", False, "Windows is required")
            live_state = "UNSUPPORTED_ENV"
        else:
            stages.append(("windows-dpapi-live", ["node", "scripts/run-step016ar1-windows-dpapi-live.mjs"], 180))
            live_state = "RUNNING"

    for name, command, timeout in stages:
        ok, output, elapsed = run_utf8(name, command, timeout)
        automated_seconds += elapsed
        if name == "focused-step016ar1-product":
            ok = ok and tap_pass(output, 11)
        elif name == "affected-cli-config-regression":
            ok = ok and tap_pass(output, 8)
        elif name == "focused-validation-governance":
            ok = ok and tap_pass(output, 36)
        elif name == "canonical-suite":
            match = re.search(r"OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0", output)
            ok = ok and bool(match) and match.group(3) == match.group(4)
        elif name == "windows-dpapi-live":
            ok = ok and bool(re.search(rf"^{STEP} checks=(\d+)/(\1) state=PASSED version={re.escape(VERSION)} schema={SCHEMA} .*browser=NOT_RUN cleanup=QUIESCENT$", output, re.MULTILINE))
            live_state = "PASSED" if ok else "FAILED"
        check(name, ok, "" if ok else output[-12000:])

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    promotion = "READY" if live_state == "PASSED" and state == "PASSED" else "WINDOWS_DPAPI_LIVE_PENDING" if state == "PASSED" else "BLOCKED"
    marker = (
        f"{STEP} checks={passed}/{len(checks)} state={state} version={VERSION} schema={SCHEMA} "
        f"accepted_product_baseline={ACCEPTED_PRODUCT_BASELINE} accepted_checks={ACCEPTED_CHECKS} "
        "source=ACCEPTED_PROFILE package=CANDIDATE local_setup=IMPLEMENTED doctor=IMPLEMENTED "
        "os_secret=WINDOWS_DPAPI_ENCODED_COMMAND_SOURCE_ACCEPTED secret_persistence=REFERENCE_ONLY model_network=NOT_RUN "
        f"browser=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM windows_dpapi_live={live_state} live_harness=STEP016AR1_H1_CURRENT_LIVE_ENTRYPOINT_MARKER_ALIGNMENT promotion={promotion} automated_run_seconds={automated_seconds:.3f}"
    )
    lines = [marker]
    for name, ok, detail in checks:
        if not ok:
            lines.append(f"OPENRILL_STEP016AR1_FAILURE check={name}")
            if detail:
                lines.append(detail)
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines), flush=True)
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
