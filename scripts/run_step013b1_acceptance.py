from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP013B1_PLAYWRIGHT_ADAPTER_AND_READ_ONLY_BROWSER_OBSERVATION"
VERSION = "0.13.5-step013b1"
SCHEMA = 9
BASELINE = "STEP013AR4_ACCEPTANCE_STAGE_RUNNER_FIXTURE_IMPORT_ALIGNMENT"
BASELINE_SHA256 = "4ea292f9e68b6774a7828565e1e7e8d5df7b4c778b36ad5891e1ea6adf2fc61e"
OPENCLAW_SHA256 = "1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP013B1_ACCEPTANCE_REPORT.txt")

STAGE_TIMEOUTS = {
    "source-version-alignment": 60,
    "workspace-lock-alignment": 60,
    "workspace-module-links": 60,
    "package-manifest-initial": 120,
    "focused-build": 300,
    "focused-browser-observation": 180,
    "focused-browser-adapter-boundaries": 180,
    "focused-browser-runtime": 180,
    "focused-browser-boundaries": 180,
    "canonical-suite": 480,
    "browser-live": 120,
    "package-manifest-final": 120,
}


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


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
    check("acceptance-script", scripts.get("acceptance:step013b1") == "python scripts/run_step013b1_acceptance.py")
    check("package-script", scripts.get("package:step013b1") == "python scripts/package_step013b1.py --output ../openrill-step013b1-playwright-adapter-read-only-browser-observation-v1.zip")

    required = [
        "packages/browser-playwright/package.json",
        "packages/browser-playwright/src/executable.ts",
        "packages/browser-playwright/src/driver.ts",
        "packages/browser-playwright/src/errors.ts",
        "packages/browser-playwright/src/index.ts",
        "packages/browser-runtime/src/types.ts",
        "packages/browser-runtime/src/runtime.ts",
        "packages/browser-runtime/src/tools.ts",
        "services/agent-host/src/lifecycle.ts",
        "scripts/run-step013b1-live.mjs",
        "scripts/run_step013b1_acceptance.py",
        "scripts/package_step013b1.py",
        "tests/unit/browser-observation-step013b1.test.mjs",
        "tests/unit/browser-playwright-boundaries-step013b1.test.mjs",
        "docs/contracts/BROWSER.md",
        "docs/plans/STEP013B1_PLAYWRIGHT_ADAPTER_AND_READ_ONLY_BROWSER_OBSERVATION.md",
        "docs/validation/STEP013B1_BROWSER_OBSERVATION_FAILURE_PREVENTION_AUDIT.md",
        "reference/validation/STEP013B1_OPENCLAW_BROWSER_OBSERVATION_REFERENCE_AUDIT.md",
        "reference/validation/STEP013B1_PROVIDER_NEUTRAL_DRIVER_METADATA_WIDENING.md",
        "reference/validation/STEP013B1_PLAYWRIGHT_PROCESS_RETENTION_AFTER_NORMAL_CLOSE.md",
        "reference/validation/STEP013B1_LATE_PLAYWRIGHT_LAUNCH_AFTER_ABORT_ORPHAN_RISK.md",
        "reference/validation/STEP013B1_LATEST_ACCEPTED_BASELINE_HISTORICAL_TEST_FREEZE.md",
        "reference/validation/STEP013B1_WORKSPACE_IMPORTER_COUNT_HARDCODE_DRIFT.md",
        "reference/validation/STEP013B1_ADAPTER_LAUNCH_CAUSE_DIAGNOSTIC_MASKING.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    package_manifests = manifests()
    versions = {json.loads(read_utf8(path)).get("version") for path in package_manifests}
    check("manifest-count", len(package_manifests) == 27, str(len(package_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))

    migrations = read_utf8(ROOT / "packages/state/src/migrations.ts")
    operation_registry = read_utf8(ROOT / "services/agent-host/src/transport/operation-registry.ts")
    runtime_manifest = json.loads(read_utf8(ROOT / "packages/browser-runtime/package.json"))
    adapter_manifest = json.loads(read_utf8(ROOT / "packages/browser-playwright/package.json"))
    adapter_driver = read_utf8(ROOT / "packages/browser-playwright/src/driver.ts")
    adapter_executable = read_utf8(ROOT / "packages/browser-playwright/src/executable.ts")
    tools = read_utf8(ROOT / "packages/browser-runtime/src/tools.ts")
    lifecycle = read_utf8(ROOT / "services/agent-host/src/lifecycle.ts")
    live = read_utf8(ROOT / "scripts/run-step013b1-live.mjs")

    check("schema-9", "OPENRILL_STATE_SCHEMA_VERSION = 9 as const" in migrations)
    check("migration-010-zero", not any(path.name.startswith("010_") for path in (ROOT / "packages/state/migrations").glob("*")))
    check("browser-protocol-zero", "browser." not in operation_registry)
    check("runtime-playwright-dependency-zero", not any("playwright" in name.lower() for section in ("dependencies", "devDependencies", "optionalDependencies") for name in runtime_manifest.get(section, {})))
    check("adapter-playwright-exact", adapter_manifest.get("dependencies", {}).get("playwright-core") == "1.62.0")
    registered_browser_tools = [match.group(1) for match in re.finditer(r'registry\.register\(tool\(\s*"(browser\.[a-z]+)"', tools)]
    check("browser-tools-six", registered_browser_tools[:6] == ["browser.status", "browser.open", "browser.list", "browser.navigate", "browser.snapshot", "browser.close"])
    check("closed-tool-schemas", tools.count("additionalProperties: false") >= 6)
    check("stale-ref", "BROWSER_STALE_REF" in read_utf8(ROOT / "packages/browser-runtime/src/errors.ts") and "assertElementRefCurrent" in read_utf8(ROOT / "packages/browser-runtime/src/runtime.ts"))
    check("document-generation", all(token in read_utf8(ROOT / "packages/browser-runtime/src/types.ts") for token in ("documentGeneration", "BrowserPageObservation", "BrowserPageSnapshot")))
    check("limited-discovery", "resolveChromiumExecutable" in adapter_executable and "OPENRILL_CHROMIUM_EXECUTABLE_NOT_FOUND" in adapter_executable)
    check("no-browser-download", not re.search(r"playwright\s+install|installBrowsersForNpmInstall|downloadBrowser", adapter_driver + adapter_executable, re.I))
    check("late-launch-cleanup", "closeLateLaunch" in adapter_driver and "lateBrowser.close()" in adapter_driver)
    check("process-retirement", "#retire(): void" in adapter_driver and "activeProcessCount" in adapter_driver)
    check("concrete-metadata-before-widening", lifecycle.index("const defaultBrowserDriver = createPlaywrightBrowserDriver") < lifecycle.index("defaultBrowserDriver.executable.executablePath") and "resolvedBrowserDriver.executable" not in lifecycle)
    check("tool-registration", "registerBrowserTools(tools, browserRuntime)" in lifecycle)
    check("live-local-fixture", "startFixtureServer" in live and "BROWSER_STALE_REF" in live)
    check("live-orphan-zero", "markerProcessIds" in live and "chromium_orphan=0" in live and "activeProcessCount" in live)

    baseline_report = read_utf8(ROOT / "reference/validation/STEP013AR4_ACCEPTANCE_REPORT.txt")
    check("accepted-baseline-report", "checks=190/190 state=PASSED" in baseline_report)
    for relative in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        text = read_utf8(ROOT / relative)
        check(f"root-current:{relative}", STEP in text and VERSION in text)
        check(f"root-baseline:{relative}", BASELINE in text and "190/190" in text and BASELINE_SHA256 in text)
    audit = read_utf8(ROOT / "reference/validation/STEP013B1_OPENCLAW_BROWSER_OBSERVATION_REFERENCE_AUDIT.md")
    check("openclaw-audit", OPENCLAW_SHA256 in audit and all(value in audit for value in (
        "fb2daff41c8131aea17b17a95646633829a1fb14f51b6845cbfc9a3fac66978f",
        "ec297d58e0597e7c70a6e2ef716e933ea7a613d872280fe795b4888415631b12",
        "06744e61c8ca9c006b0343f7873ccdd6b5004535b17d444dbfd508e97065bb43",
        "8ced9c3f8acfbca4bf9cb4331145d0a6ca92ec76fc2f1cbaf2f4ed7d87a4cc83",
        "e6b5ea2c0c49e43ea035b37d41728e1d660a4a267fee22d61aa7fe53dc4e2163",
        "13555887e13580fb1e9106b966307fb05de73f25d0e834965563c3f61c4c9d81",
    )))
    registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for issue in range(90, 96):
        token = f"OR-ISSUE-{issue:03d}"
        check(f"issue-registry-{issue}", token in registry)
        check(f"issue-recurrence-{issue}", token in recurrence)

    stages = [
        ("source-version-alignment", ["python", "scripts/verify_source_version_alignment.py"], lambda output: "OPENRILL_SOURCE_VERSION_ALIGNMENT_PASS version=0.13.5-step013b1 manifests=27 sources=26 host_literals=3" in output),
        ("workspace-lock-alignment", ["python", "scripts/verify_workspace_lock_alignment.py"], lambda output: "OPENRILL_WORKSPACE_LOCK_ALIGNMENT_PASS importers=27 dependencies=67" in output),
        ("workspace-module-links", ["python", "scripts/verify_workspace_module_links.py"], lambda output: "OPENRILL_WORKSPACE_MODULE_LINKS_PASS" in output),
        ("package-manifest-initial", ["python", "scripts/verify_package_manifest.py"], lambda output: "OPENRILL_PACKAGE_MANIFEST_PASS" in output and "changed=0" in output),
        ("focused-build", ["node", "scripts/workspace-runner.mjs", "build"], lambda output: "OPENRILL_WORKSPACE_BUILD_PASS" in output),
        ("focused-browser-observation", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-observation-step013b1.test.mjs"], lambda output: tap_pass(output, 5)),
        ("focused-browser-adapter-boundaries", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-playwright-boundaries-step013b1.test.mjs"], lambda output: tap_pass(output, 5)),
        ("focused-browser-runtime", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-runtime-step013a.test.mjs"], lambda output: tap_pass(output, 13)),
        ("focused-browser-boundaries", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-runtime-boundaries-step013a.test.mjs"], lambda output: tap_pass(output, 8)),
        ("canonical-suite", ["node", "scripts/run-step001-suite.mjs"], lambda output: "OPENRILL_STEP001_SUITE_PASS" in output and tap_pass(output)),
        ("browser-live", ["node", "scripts/run-step013b1-live.mjs"], lambda output: "OPENRILL_STEP013B1_LIVE_PASS" in output and "process_count=0 chromium_orphan=0" in output),
        ("package-manifest-final", ["python", "scripts/verify_package_manifest.py"], lambda output: "OPENRILL_PACKAGE_MANIFEST_PASS" in output and "changed=0" in output),
    ]
    for stage, command, predicate in stages:
        ok, output = run_utf8(stage=stage, command=command)
        check(stage, ok and predicate(output), output[-16000:] if not (ok and predicate(output)) else "pass")

    passed = sum(1 for _, ok, _ in checks if ok)
    lines = [f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, ok, detail in checks]
    state = "PASSED" if passed == len(checks) else "FAILED"
    marker = (
        f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} baseline=STEP013AR4 "
        "adapter=PLAYWRIGHT_CORE tools=READ_ONLY_6 refs=DOCUMENT_GENERATION_SCOPED "
        "stale_ref=BROWSER_STALE_REF process_count=0 chromium_orphan=0"
    )
    lines.append(marker)
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print(marker)
    if state != "PASSED":
        for name, ok, detail in checks:
            if not ok:
                print(f"OPENRILL_STEP013B1_FAILURE check={name}\n{detail[-8000:]}")
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
