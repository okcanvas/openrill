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
STEP = "STEP013A_BROWSER_RUNTIME_LIFECYCLE_AND_POLICY_FOUNDATION"
VERSION = "0.13.0-step013a"
SCHEMA = 9
ACCEPTED_STEP = "STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION"
ACCEPTED_SHA256 = "46097b9ec753b46741705823a5a9a67ab191d6fe3350db43f64e43b516807658"
OPENCLAW_SHA256 = "1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP013A_ACCEPTANCE_REPORT.txt")
PACKAGED_REPORT = ROOT / "reference/validation/STEP013A_ACCEPTANCE_REPORT.txt"


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def run_utf8(command: list[str]) -> tuple[bool, str]:
    env = os.environ.copy()
    env.update({
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
        "NO_COLOR": "1",
        "NODE_DISABLE_COLORS": "1",
        "TERM": "dumb",
    })
    completed = subprocess.run(
        command,
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return completed.returncode == 0, completed.stdout.decode("utf-8", errors="replace")


def stable_failure(output: str) -> str:
    lines = output.splitlines()
    index = next((i for i, line in enumerate(lines) if line.startswith("not ok ")), None)
    if index is not None:
        return "\n".join(lines[max(0, index - 2):])[-24000:]
    return output[-16000:]


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
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in {"read_text", "write_text"}:
                if not any(keyword.arg == "encoding" for keyword in node.keywords):
                    failures.append(f"{path.name}:{node.lineno}:{node.func.attr}")
    return failures


def repository_runtime_files() -> list[str]:
    result: list[str] = []
    excluded = {"node_modules", "dist", ".artifacts", ".git"}
    for path in ROOT.rglob("*"):
        if not path.is_file() or any(part in excluded for part in path.relative_to(ROOT).parts):
            continue
        if path.suffix in {".db", ".sqlite", ".sqlite3", ".wal", ".shm"}:
            result.append(path.relative_to(ROOT).as_posix())
    return sorted(result)


def source_forbidden_dependencies() -> list[str]:
    failures: list[str] = []
    for path in manifests():
        data = json.loads(read_utf8(path))
        dependencies: dict[str, str] = {}
        for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            dependencies.update(data.get(key, {}))
        for dependency in dependencies:
            if re.search(r"playwright|puppeteer|openclaw", dependency, re.IGNORECASE):
                failures.append(f"{path.relative_to(ROOT).as_posix()}:{dependency}")
    return failures


def test_contract(output: str, expected: int) -> bool:
    return bool(
        re.search(rf"# tests {expected}(?:\r?\n)", output)
        and re.search(rf"# pass {expected}(?:\r?\n)", output)
        and re.search(r"# fail 0(?:\r?\n)", output)
        and re.search(r"# cancelled 0(?:\r?\n)", output)
        and re.search(r"# skipped 0(?:\r?\n)", output)
    )


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check("step013a-script", scripts.get("acceptance:step013a") == "python scripts/run_step013a_acceptance.py")
    check("step013a-package-script", scripts.get("package:step013a") == "python scripts/package_step013a.py --output ../openrill-step013a-browser-runtime-lifecycle-policy-foundation-v1.zip")

    required = [
        "packages/browser-runtime/src/types.ts",
        "packages/browser-runtime/src/errors.ts",
        "packages/browser-runtime/src/policy.ts",
        "packages/browser-runtime/src/runtime.ts",
        "packages/browser-runtime/src/index.ts",
        "packages/browser-runtime/README.md",
        "scripts/verify_source_version_alignment.py",
        "scripts/run_step013a_acceptance.py",
        "scripts/package_step013a.py",
        "scripts/sh_run_step013a_acceptance.cmd",
        "scripts/sh_run_step013a_acceptance.sh",
        "tests/unit/browser-runtime-step013a.test.mjs",
        "tests/unit/browser-runtime-boundaries-step013a.test.mjs",
        "docs/plans/STEP013A_BROWSER_RUNTIME_LIFECYCLE_AND_POLICY_FOUNDATION.md",
        "docs/validation/STEP013A_BROWSER_RUNTIME_FAILURE_PREVENTION_AUDIT.md",
        "reference/validation/STEP012DR4_WINDOWS_LIVE_ACCEPTED.md",
        "reference/validation/STEP013A_OPENCLAW_BROWSER_REFERENCE_AUDIT.md",
        "reference/validation/STEP012DR4_ACCEPTED_SOURCE_VERSION_IDENTITY_DRIFT.md",
        "reference/validation/STEP013A_BROWSER_DRIVER_PREFLIGHT_AFTER_STATE_LOCK_NEAR_MISS.md",
        "reference/validation/STEP013A_BROWSER_TIMEOUT_UNREF_LIVENESS_FAILURE.md",
        "reference/validation/STEP013A_HOST_SHUTDOWN_TEST_TURN_ASSUMPTION.md",
        "reference/validation/STEP013A_HISTORICAL_HOST_FIXTURE_BROWSER_CONFIG_AND_DRAIN_EXPECTATION_DRIFT.md",
        "reference/validation/STEP013A_HISTORICAL_ROOT_ACCEPTED_BASELINE_CUTOVER_OWNERSHIP_DRIFT.md",
        "reference/validation/STEP013A_ACCEPTANCE_REPORT.txt",
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
        check(f"package-manifest-{label}-step", f'STEP = "{STEP}"' in source)
        check(f"package-manifest-{label}-version", f'VERSION = "{VERSION}"' in source)
    check("package-manifest-generated-identity", generated.get("step") == STEP and generated.get("version") == VERSION, f"{generated.get('step')} {generated.get('version')}")

    migrations = read_utf8(ROOT / "packages/state/src/migrations.ts")
    migration_names = [path.name for path in (ROOT / "packages/state/migrations").glob("*") if path.is_file()]
    operation_registry = read_utf8(ROOT / "services/agent-host/src/transport/operation-registry.ts")
    lifecycle = read_utf8(ROOT / "services/agent-host/src/lifecycle.ts")
    runtime = read_utf8(ROOT / "packages/browser-runtime/src/runtime.ts")
    policy = read_utf8(ROOT / "packages/browser-runtime/src/policy.ts")
    config_schema = read_utf8(ROOT / "packages/config/src/schema.ts")
    config_types = read_utf8(ROOT / "packages/config/src/types.ts")

    check("schema-9", "OPENRILL_STATE_SCHEMA_VERSION = 9 as const" in migrations)
    check("migration-010-zero", not any(name.startswith("010_") for name in migration_names), json.dumps(migration_names))
    check("browser-protocol-zero", "browser." not in operation_registry)
    check("browser-tool-registration-zero", not re.search(r"registerBrowserTools|browser\.navigate|browser\.snapshot", lifecycle))
    check("external-product-dependency-zero", not source_forbidden_dependencies(), json.dumps(source_forbidden_dependencies()))
    check("provider-neutral-driver", "export interface BrowserDriver" in read_utf8(ROOT / "packages/browser-runtime/src/types.ts"))
    check("single-flight-launch", "#launchPromise" in runtime)
    check("generation-invalidation", "#generation += 1" in runtime and "BROWSER_STALE_HANDLE" in runtime)
    check("run-owner-four-tuple", all(token in read_utf8(ROOT / "packages/browser-runtime/src/types.ts") for token in ("workspaceId", "conversationId", "runId", "attemptId")))
    check("actor-limits-before-create", runtime.index("BROWSER_SESSION_LIMIT") < runtime.index("createContext") and runtime.index("BROWSER_PAGE_LIMIT") < runtime.index("newPage"))
    check("popup-download-deny", "page.popup_denied" in runtime and "page.download_denied" in runtime and "download.cancel()" in runtime)
    check("run-cancel-owned", "cancelRun(runId" in runtime and 'session.owner.runId === runId' in runtime)
    check("idle-sweep-owned", "sweepIdle" in runtime and "session.idle_closed" in runtime)
    check("bounded-operation-race", "Promise.race([operation, interruption])" in runtime and "BROWSER_LAUNCH_TIMEOUT" in runtime)
    check("close-before-await", runtime.index('this.#state = "CLOSING"') < runtime.index("await Promise.allSettled([...this.#operations])"))
    check("navigation-scheme-policy", 'SAFE_NON_NETWORK_URLS = new Set(["about:blank"])' in policy and 'new Set(["http:", "https:"])' in policy)
    check("navigation-credential-policy", "parsed.username || parsed.password" in policy)
    check("navigation-private-policy", "isPrivateNetworkAddress" in policy and "resolved.some" in policy)
    check("navigation-final-policy", "assertBrowserNavigationResultAllowed" in runtime)
    check("config-browser-closed", '"browser"' in config_schema and "BROWSER_KEYS" in config_schema)
    check("config-default-disabled", "let browserEnabled = false" in config_schema and "let browserHeadless = true" in config_schema)
    check("config-no-persistence-path", "persistentProfile" not in config_types and "downloadPath" not in config_types)
    preflight = lifecycle.index("browser.enabled && !options.browserDriver")
    lock = lifecycle.index("const lock = await acquireHostLock")
    browser_drain = lifecycle.index("browserRuntime?.close()")
    process_drain = lifecycle.index("processManager?.close()", browser_drain)
    database_close = lifecycle.index('stateDatabase.close({ checkpointMode: "TRUNCATE" })', browser_drain)
    check("driver-preflight-before-lock", preflight >= 0 and preflight < lock)
    check("browser-process-drain-before-db", browser_drain >= 0 and process_drain >= 0 and database_close > browser_drain and database_close > process_drain)

    accepted = read_utf8(ROOT / "reference/validation/STEP012DR4_WINDOWS_LIVE_ACCEPTED.md")
    check("accepted-step-evidence", ACCEPTED_STEP in accepted and "180/180" in accepted and "WINDOWS_LIVE_ACCEPTED" in accepted)
    check("accepted-artifact-sha", ACCEPTED_SHA256 in accepted)
    reference = read_utf8(ROOT / "reference/validation/STEP013A_OPENCLAW_BROWSER_REFERENCE_AUDIT.md")
    check("openclaw-reference-sha", OPENCLAW_SHA256 in reference)
    check("openclaw-reference-role", "REFERENCE_ANSWER_SHEET_NOT_PRODUCT_DEPENDENCY" in reference)
    check("openclaw-reference-file-hashes", all(token in reference for token in (
        "ff05731045d75a5c72f00d508eba85f78722e99816583025c9effd6bd687cd56",
        "234d6e522fd68ae28c4268d8c572ed8ba1deade6cad2abcce91cb83253e49c44",
        "337b547ab0fa0a1e3f28402e124ff8b287b03c78004575d4a8ad23b243425b00",
    )))
    check("openclaw-deliberate-differences", "Deliberate OpenRill differences" in reference)

    registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for issue in range(77, 83):
        issue_id = f"OR-ISSUE-{issue:03d}"
        check(f"issue-registry-{issue:03d}", issue_id in registry)
        check(f"issue-recurrence-{issue:03d}", issue_id in recurrence or "STEP013A" in recurrence)
    issue_details = {
        "077": "reference/validation/STEP012DR4_ACCEPTED_SOURCE_VERSION_IDENTITY_DRIFT.md",
        "078": "reference/validation/STEP013A_BROWSER_DRIVER_PREFLIGHT_AFTER_STATE_LOCK_NEAR_MISS.md",
        "079": "reference/validation/STEP013A_BROWSER_TIMEOUT_UNREF_LIVENESS_FAILURE.md",
        "080": "reference/validation/STEP013A_HOST_SHUTDOWN_TEST_TURN_ASSUMPTION.md",
        "081": "reference/validation/STEP013A_HISTORICAL_HOST_FIXTURE_BROWSER_CONFIG_AND_DRAIN_EXPECTATION_DRIFT.md",
        "082": "reference/validation/STEP013A_HISTORICAL_ROOT_ACCEPTED_BASELINE_CUTOVER_OWNERSHIP_DRIFT.md",
    }
    for issue, relative in issue_details.items():
        detail = read_utf8(ROOT / relative)
        check(f"issue-detail-{issue}", f"OR-ISSUE-{issue}" in detail and "Root cause" in detail or "원인" in detail)

    plan = read_utf8(ROOT / "docs/plans/STEP013A_BROWSER_RUNTIME_LIFECYCLE_AND_POLICY_FOUNDATION.md")
    for heading in (
        "## 목적", "## 기준선", "## OpenClaw 참조", "## 코드 확인", "## 구현 범위", "## 공개 계약",
        "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 반복 방지 기록", "## 패키징 산출물", "## 제외", "## 완료 선언",
    ):
        check(f"plan-heading:{heading}", heading in plan)
    audit = read_utf8(ROOT / "docs/validation/STEP013A_BROWSER_RUNTIME_FAILURE_PREVENTION_AUDIT.md")
    check("failure-prevention-audit", all(token in audit for token in ("single-flight", "final URL", "OR-ISSUE-081", "STEP013B")))
    for filename in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        text = read_utf8(ROOT / filename)
        check(f"baseline-current-step:{filename}", STEP in text)
        check(f"baseline-current-version:{filename}", VERSION in text)
        check(f"baseline-accepted-step:{filename}", ACCEPTED_STEP in text and "180/180" in text)
        check(f"baseline-accepted-sha:{filename}", ACCEPTED_SHA256 in text)
        check(f"next-step013b:{filename}", "STEP013B" in text or filename == "ROADMAP.md")

    version_ok, version_output = run_utf8(["python", "scripts/verify_source_version_alignment.py"])
    check("source-version-alignment", version_ok and "manifests=26 sources=25 host_literals=3" in version_output, version_output.strip())
    text_io = implicit_text_io()
    check("python-text-io-explicit", not text_io, json.dumps(text_io))
    cmd_bytes = (ROOT / "scripts/sh_run_step013a_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd_bytes and b"\n" not in cmd_bytes.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd_bytes)
    check("posix-launcher", 'cd "$SCRIPT_DIR/.."' in read_utf8(ROOT / "scripts/sh_run_step013a_acceptance.sh"))

    initial_ok, initial_output = run_utf8(["python", "scripts/verify_package_manifest.py"])
    check("package-manifest-initial", initial_ok and "OPENRILL_PACKAGE_MANIFEST_PASS" in initial_output, initial_output.strip())

    build_ok, build_output = run_utf8(["node", "scripts/workspace-runner.mjs", "build"])
    check("focused-build", build_ok and "OPENRILL_WORKSPACE_BUILD_PASS" in build_output, "build_pass" if build_ok else stable_failure(build_output))

    runtime_ok, runtime_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-runtime-step013a.test.mjs"])
    runtime_contract = runtime_ok and test_contract(runtime_output, 13)
    check("focused-browser-runtime", runtime_contract, "browser_runtime_tests_pass" if runtime_contract else stable_failure(runtime_output))

    boundary_ok, boundary_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-runtime-boundaries-step013a.test.mjs"])
    boundary_contract = boundary_ok and test_contract(boundary_output, 8)
    check("focused-browser-boundaries", boundary_contract, "browser_boundary_tests_pass" if boundary_contract else stable_failure(boundary_output))

    historical_ok, historical_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/automation-scheduler-step012b.test.mjs", "tests/unit/process-manager-close-step011r7.test.mjs"])
    historical_contract = historical_ok and test_contract(historical_output, 14)
    check("focused-historical-host-fixtures", historical_contract, "historical_host_fixtures_pass" if historical_contract else stable_failure(historical_output))

    canonical_ok, canonical_output = run_utf8(["node", "scripts/run-step001-suite.mjs"])
    canonical_contract = canonical_ok and all(token in canonical_output for token in (
        "# tests 251", "# pass 251", "# fail 0", "# cancelled 0", "# skipped 0",
        "OPENRILL_ARCHITECTURE_PASS packages=25 edges=62 sources=105 ui_framework=VUE_3",
        "OPENRILL_PACKAGE_EXPORT_PASS packages=25",
        "OPENRILL_STEP001_SUITE_PASS unit_files=44 reporter=TAP concurrency=1",
    ))
    check("canonical-suite", canonical_contract, "suite_pass" if canonical_contract else stable_failure(canonical_output))

    final_ok, final_output = run_utf8(["python", "scripts/verify_package_manifest.py"])
    check("package-manifest-final", final_ok and "OPENRILL_PACKAGE_MANIFEST_PASS" in final_output, final_output.strip())
    runtime_files = repository_runtime_files()
    check("runtime-database-files-zero", not runtime_files, json.dumps(runtime_files))
    for path in ROOT.rglob("__pycache__"):
        shutil.rmtree(path, ignore_errors=True)
    for path in ROOT.rglob("*.py[co]"):
        path.unlink(missing_ok=True)
    check("generated-cleanup", not list(ROOT.rglob("*.py[co]")), json.dumps([path.relative_to(ROOT).as_posix() for path in ROOT.rglob("*.py[co]")]))

    passed = sum(1 for _, outcome, _ in checks if outcome)
    total = len(checks)
    state = "PASSED" if passed == total else "FAILED"
    lines: list[str] = []
    for name, outcome, detail in checks:
        line = f"[{'PASS' if outcome else 'FAIL'}] {name}"
        if detail:
            line += f" :: {detail}"
        lines.append(line)
    marker = (
        f"{STEP} checks={passed}/{total} state={state} schema={SCHEMA} baseline=STEP012DR4 "
        "openclaw_reference=PINNED lifecycle=RUN_OWNED_GENERATION_GUARDED navigation=PRE_POST_POLICY "
        "popup=DENY download=DENY shutdown=QUIESCENT tools=DEFERRED_STEP013B adapter=INJECTED"
    )
    lines.append(marker)
    report_text = "\n".join(lines) + "\n"
    write_acceptance_report(REPORT, report_text)
    print(report_text, end="")
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
