from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP013B2_BROWSER_INTERACTIONS_NAVIGATION_STATE_AND_DIALOG_BLOCKER"
VERSION = "0.13.7-step013b2"
SCHEMA = 9
BASELINE = "STEP013B1A_WINDOWS_DETERMINISTIC_FOCUSED_TEST_REPORTER_ALIGNMENT"
BASELINE_SHA256 = "220009729163094365b1383fda1e059e2d9c5b69beb05f1476a162a608bd28ca"
OPENCLAW_SHA256 = "1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82"
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP013B2_ACCEPTANCE_REPORT.txt")
STAGE_LOG_DIR = REPORT.parent / "STEP013B2_STAGES"
FAILURE_EXCERPT_LIMIT = 20_000

STAGE_TIMEOUTS = {
    "source-version-alignment": 60,
    "workspace-lock-alignment": 60,
    "workspace-module-links": 60,
    "package-manifest-initial": 120,
    "focused-build": 300,
    "focused-browser-interactions": 180,
    "focused-browser-interaction-boundaries": 180,
    "focused-acceptance-stage-evidence": 120,
    "focused-test-reporter": 120,
    "focused-browser-observation": 180,
    "focused-browser-adapter-boundaries": 180,
    "focused-browser-runtime": 180,
    "focused-browser-boundaries": 180,
    "canonical-suite": 900,
    "architecture": 120,
    "exports": 180,
    "browser-live": 180,
    "package-manifest-final": 120,
}


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def stage_log_path(stage: str) -> Path:
    if not re.fullmatch(r"[a-z0-9-]+", stage):
        raise ValueError(f"invalid stage name: {stage}")
    return STAGE_LOG_DIR / f"{stage}.log"


def persist_stage_output(stage: str, output: str) -> Path:
    path = stage_log_path(stage)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(output, encoding="utf-8")
    return path


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def failure_excerpt(stage: str, output: str) -> str:
    log_path = stage_log_path(stage)
    lines = output.splitlines()
    anchor_pattern = re.compile(
        r"^(?:not ok\b|# fail [1-9][0-9]*\b|\s*(?:AssertionError|Error(?: \[[^]]+\])?:|Traceback \(most recent call last\):)|.*OPENRILL_[A-Z0-9_]*(?:FAIL|FAILED))"
    )
    intervals: list[tuple[int, int]] = []
    for index, line in enumerate(lines):
        if anchor_pattern.search(line):
            intervals.append((max(0, index - 3), min(len(lines), index + 45)))

    merged: list[tuple[int, int]] = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    evidence = "\n".join(
        "\n".join(lines[start:end])
        for start, end in merged
    )
    tail = output[-8_000:]
    if not evidence:
        evidence = output[:8_000]
    combined = (
        f"full_stage_log={display_path(log_path)} bytes={len(output.encode('utf-8'))}\n"
        f"OPENRILL_STAGE_FAILURE_EVIDENCE_BEGIN name={stage}\n"
        f"{evidence}\n"
        f"OPENRILL_STAGE_FAILURE_EVIDENCE_END name={stage}\n"
        f"OPENRILL_STAGE_OUTPUT_TAIL_BEGIN name={stage}\n"
        f"{tail}\n"
        f"OPENRILL_STAGE_OUTPUT_TAIL_END name={stage}"
    )
    if len(combined) <= FAILURE_EXCERPT_LIMIT:
        return combined
    prefix = combined[: FAILURE_EXCERPT_LIMIT - 8_000]
    return prefix + "\nOPENRILL_STAGE_EXCERPT_TRUNCATED\n" + combined[-7_960:]


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
    log_path = persist_stage_output(stage, result.output)
    print(
        f"OPENRILL_ACCEPTANCE_STAGE_LOG name={stage} path={display_path(log_path)} "
        f"bytes={len(result.output.encode('utf-8'))}",
        flush=True,
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
    check("acceptance-script", scripts.get("acceptance:step013b2") == "python scripts/run_step013b2_acceptance.py")
    check("package-script", scripts.get("package:step013b2") == "python scripts/package_step013b2.py --output ../openrill-step013b2-browser-interactions-navigation-state-dialog-blocker-v1.zip")

    required = [
        "packages/browser-playwright/package.json",
        "packages/browser-playwright/src/driver.ts",
        "packages/browser-playwright/src/errors.ts",
        "packages/browser-runtime/src/types.ts",
        "packages/browser-runtime/src/errors.ts",
        "packages/browser-runtime/src/runtime.ts",
        "packages/browser-runtime/src/tools.ts",
        "services/agent-host/src/lifecycle.ts",
        "scripts/run-step013b2-live.mjs",
        "scripts/run_step013b2_acceptance.py",
        "scripts/package_step013b2.py",
        "scripts/sh_run_step013b2_acceptance.cmd",
        "scripts/sh_run_step013b2_acceptance.sh",
        "tests/unit/browser-interactions-step013b2.test.mjs",
        "tests/unit/browser-interaction-boundaries-step013b2.test.mjs",
        "tests/unit/acceptance-stage-evidence-step013b2.test.mjs",
        "docs/contracts/BROWSER.md",
        "docs/contracts/BROWSER_INTERACTION.md",
        "docs/plans/STEP013B2_BROWSER_INTERACTIONS_NAVIGATION_STATE_AND_DIALOG_BLOCKER.md",
        "docs/validation/STEP013B2_BROWSER_INTERACTION_FAILURE_PREVENTION_AUDIT.md",
        "reference/validation/STEP013B1A_ACCEPTANCE_REPORT.txt",
        "reference/validation/STEP013B1A_WINDOWS_LIVE_ACCEPTANCE.md",
        "reference/validation/STEP013B2_OPENCLAW_BROWSER_INTERACTION_REFERENCE_AUDIT.md",
        "reference/validation/STEP013B2_LOCAL_VALIDATION.md",
        "reference/validation/STEP013B2_HISTORICAL_BROWSER_TOOL_INVENTORY_FREEZE.md",
        "reference/validation/STEP013B2_READ_ONLY_AX_ID_ACTION_LOCATOR_GAP.md",
        "reference/validation/STEP013B2_ACTION_NAVIGATION_PRE_DISPATCH_POLICY_GAP.md",
        "reference/validation/STEP013B2_MODAL_DIALOG_ACTION_TIMEOUT_RISK.md",
        "reference/validation/STEP013B2_HISTORICAL_REPORTER_TEST_RELEASE_VERSION_FREEZE.md",
        "reference/validation/STEP013B2_CANONICAL_ACCEPTED_BASELINE_OWNER_GAP.md",
        "reference/validation/STEP013B2_ACCEPTANCE_STAGE_FAILURE_EVIDENCE_TRUNCATION.md",
        "config/current-accepted-baseline.json",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    package_manifests = manifests()
    versions = {json.loads(read_utf8(path)).get("version") for path in package_manifests}
    check("manifest-count", len(package_manifests) == 27, str(len(package_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))

    types = read_utf8(ROOT / "packages/browser-runtime/src/types.ts")
    errors = read_utf8(ROOT / "packages/browser-runtime/src/errors.ts")
    runtime = read_utf8(ROOT / "packages/browser-runtime/src/runtime.ts")
    tools = read_utf8(ROOT / "packages/browser-runtime/src/tools.ts")
    driver = read_utf8(ROOT / "packages/browser-playwright/src/driver.ts")
    adapter_manifest = json.loads(read_utf8(ROOT / "packages/browser-playwright/package.json"))
    runtime_manifest = json.loads(read_utf8(ROOT / "packages/browser-runtime/package.json"))
    migrations = read_utf8(ROOT / "packages/state/src/migrations.ts")
    operation_registry = read_utf8(ROOT / "services/agent-host/src/transport/operation-registry.ts")
    lifecycle = read_utf8(ROOT / "services/agent-host/src/lifecycle.ts")
    live = read_utf8(ROOT / "scripts/run-step013b2-live.mjs")
    historical_runner = read_utf8(ROOT / "scripts/run_step013b1_acceptance.py")
    corrective_runner = read_utf8(ROOT / "scripts/run_step013b1a_acceptance.py")

    registered = [match.group(1) for match in re.finditer(r'registry\.register\(tool\(\s*"(browser\.[a-z]+)"', tools)]
    expected_tools = [
        "browser.status", "browser.open", "browser.list", "browser.navigate", "browser.snapshot", "browser.close",
        "browser.click", "browser.type", "browser.press", "browser.select", "browser.fill", "browser.wait",
    ]
    check("schema-9", "OPENRILL_STATE_SCHEMA_VERSION = 9 as const" in migrations)
    check("migration-010-zero", not any(path.name.startswith("010_") for path in (ROOT / "packages/state/migrations").glob("*")))
    check("browser-protocol-zero", "browser." not in operation_registry)
    check("browser-ledger-zero", not any(token in migrations.lower() for token in ("browser_action", "browser_ledger")))
    check("runtime-provider-neutral", not any("playwright" in name.lower() or "puppeteer" in name.lower() for section in ("dependencies", "devDependencies", "optionalDependencies") for name in runtime_manifest.get(section, {})))
    check("adapter-playwright-exact", adapter_manifest.get("dependencies", {}).get("playwright-core") == "1.62.0")
    check("browser-tools-twelve", registered == expected_tools, json.dumps(registered))
    check("retained-tools-prefix", registered[:6] == expected_tools[:6])
    check("closed-tool-schemas", tools.count("additionalProperties: false") >= 12, str(tools.count("additionalProperties: false")))
    check("action-union", all(token in types for token in ('kind: "click"', 'kind: "type"', 'kind: "press"', 'kind: "select"', 'kind: "fill"', 'kind: "wait-time"', 'kind: "wait-element"', 'kind: "wait-url"')))
    check("page-handle-act", "act(action: BrowserPageAction" in types)
    check("context-navigation-guard", "assertNavigationAllowed: (url: string) => Promise<void>" in types)
    check("dialog-policy", 'dialog: "BLOCK_AND_DISMISS"' in types and 'dialog: "BLOCK_AND_DISMISS"' in lifecycle)
    check("typed-action-errors", all(code in errors for code in ("BROWSER_ACTION_FAILED", "BROWSER_DIALOG_BLOCKED", "BROWSER_STALE_REF")))
    check("stale-recovery-snapshot", "recoverySnapshot" in runtime and "use recoverySnapshot refs and retry" in runtime)
    check("stale-no-auto-dispatch", tools.index("resolveOwnedElementRef") < tools.index("runtime.actOwned", tools.index("resolveOwnedElementRef")))
    check("action-navigation-page-state", "pageState" in runtime and '"action.navigation_completed"' in runtime)
    check("dialog-runtime-block", '"BROWSER_DIALOG_BLOCKED"' in runtime and '"action.dialog_blocked"' in runtime)
    check("ai-aria-snapshot", 'ariaSnapshot({ mode: "ai"' in driver and 'elementId: `aria:${ref}`' in driver)
    check("aria-ref-locator", 'page.locator(`aria-ref=${ref}`)' in driver)
    route_index = driver.find('context.route("**/*"')
    guard_index = driver.find("await options.assertNavigationAllowed(request.url())", route_index)
    continue_index = driver.find("await route.continue()", guard_index)
    abort_index = driver.find('await route.abort("blockedbyclient")', guard_index)
    check("pre-dispatch-navigation-order", -1 < route_index < guard_index < continue_index and guard_index < abort_index)
    check("top-level-navigation-only", "request.isNavigationRequest()" in driver and "frame.parentFrame() !== null" in driver)
    check("dialog-safe-dismiss", "const settled = dialog.dismiss()" in driver and "dialog: outcome.dialog.observation" in driver)
    check("historical-runner-additive-safe", "registered_browser_tools[:6]" in historical_runner and "registered_browser_tools[:6]" in corrective_runner)
    check("no-deferred-actions", not any(f'"browser.{name}"' in tools for name in ("evaluate", "batch", "hover", "drag", "screenshot", "pdf", "upload", "download")))
    check("tool-registration", "registerBrowserTools(tools, browserRuntime)" in lifecycle)
    check("live-tools-actions", all(token in live for token in ("browser.type", "browser.fill", "browser.select", "browser.click", "browser.press", "browser.wait")))
    check("live-navigation-policy", "BROWSER_NAVIGATION_BLOCKED" in live and "127.0.0.2" in live)
    check("live-stale-recovery", "BROWSER_STALE_REF" in live and "recoverySnapshot" in live)
    check("live-dialog-block", "BROWSER_DIALOG_BLOCKED" in live and "BLOCK_AND_DISMISS" in live)
    check("live-orphan-zero", "markerProcessIds" in live and "process_count=0" in live and "chromium_orphan=0" in live)

    baseline_report = read_utf8(ROOT / "reference/validation/STEP013B1A_ACCEPTANCE_REPORT.txt")
    accepted_record = json.loads(read_utf8(ROOT / "config/current-accepted-baseline.json"))
    check("accepted-baseline-report", "checks=106/106 state=PASSED" in baseline_report)
    check("accepted-baseline-identity", BASELINE in baseline_report and "process_count=0 chromium_orphan=0" in baseline_report)
    check("accepted-record-schema", accepted_record.get("schemaVersion") == 1)
    check("accepted-record-step", accepted_record.get("step") == BASELINE)
    check("accepted-record-version", accepted_record.get("version") == "0.13.6-step013b1a")
    check("accepted-record-checks", accepted_record.get("checks") == "106/106")
    check("accepted-record-sha", accepted_record.get("zipSha256") == BASELINE_SHA256)
    accepted_evidence = ROOT / str(accepted_record.get("evidence", ""))
    check("accepted-record-evidence", accepted_evidence.is_file() and BASELINE in read_utf8(accepted_evidence))
    for relative in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        text = read_utf8(ROOT / relative)
        check(f"root-doc-baseline:{relative}", BASELINE in text and BASELINE_SHA256 in text)
        check(f"root-doc-current:{relative}", STEP in text and VERSION in text)

    issue_registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(98, 105):
        token = f"OR-ISSUE-{number:03d}"
        check(f"issue-registry:{token}", token in issue_registry)
        check(f"recurrence-gate:{token}", token in recurrence)

    reference_audit = read_utf8(ROOT / "reference/validation/STEP013B2_OPENCLAW_BROWSER_INTERACTION_REFERENCE_AUDIT.md")
    check("openclaw-zip-sha", OPENCLAW_SHA256 in reference_audit)
    for digest in (
        "fb2daff41c8131aea17b17a95646633829a1fb14f51b6845cbfc9a3fac66978f",
        "cfad81292b126a9d5fa327faba5000c4750a406c1210e6215bdb6f2ba86ae712",
        "a7f6823514cc71ddf4f81b735b6858e3ae1a28172faf281a903870378b16a31e",
        "b6a76a0214c906873d7b589ffa3ad13e7df41df422fd40a757abf2cb3b5677e9",
        "06744e61c8ca9c006b0343f7873ccdd6b5004535b17d444dbfd508e97065bb43",
    ):
        check(f"openclaw-reference:{digest[:12]}", digest in reference_audit)

    active_focused_commands = [
        "focused-browser-interactions", "focused-browser-interaction-boundaries", "focused-acceptance-stage-evidence", "focused-test-reporter",
        "focused-browser-observation", "focused-browser-adapter-boundaries", "focused-browser-runtime", "focused-browser-boundaries",
    ]
    source_self = read_utf8(ROOT / "scripts/run_step013b2_acceptance.py")
    check("stage-output-full-log", "persist_stage_output(stage, result.output)" in source_self and "STEP013B2_STAGES" in source_self)
    check("stage-failure-anchor-excerpt", "failure_excerpt(stage, output)" in source_self and not re.search(r"check\(stage, contract_ok, output\[-?\d+:", source_self) and not re.search(r"detail\[-\d+:\]", source_self))
    for stage_name in active_focused_commands:
        line = next((line for line in source_self.splitlines() if f'("{stage_name}"' in line), "")
        check(f"tap-reporter:{stage_name}", "--test-reporter=tap" in line)

    stages = [
        ("source-version-alignment", ["python", "scripts/verify_source_version_alignment.py"], lambda output: f"OPENRILL_SOURCE_VERSION_ALIGNMENT_PASS version={VERSION} manifests=27 sources=26 host_literals=3" in output),
        ("workspace-lock-alignment", ["python", "scripts/verify_workspace_lock_alignment.py"], lambda output: "OPENRILL_WORKSPACE_LOCK_ALIGNMENT_PASS importers=27 dependencies=67" in output),
        ("workspace-module-links", ["python", "scripts/verify_workspace_module_links.py"], lambda output: "OPENRILL_WORKSPACE_MODULE_LINKS_PASS" in output),
        ("package-manifest-initial", ["python", "scripts/verify_package_manifest.py"], lambda output: "OPENRILL_PACKAGE_MANIFEST_PASS" in output and "changed=0" in output),
        ("focused-build", ["node", "scripts/workspace-runner.mjs", "build"], lambda output: "OPENRILL_WORKSPACE_BUILD_PASS" in output),
        ("focused-browser-interactions", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-interactions-step013b2.test.mjs"], lambda output: tap_pass(output, 5)),
        ("focused-browser-interaction-boundaries", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-interaction-boundaries-step013b2.test.mjs"], lambda output: tap_pass(output, 7)),
        ("focused-acceptance-stage-evidence", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/acceptance-stage-evidence-step013b2.test.mjs"], lambda output: tap_pass(output, 2)),
        ("focused-test-reporter", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/focused-test-reporter-step013b1a.test.mjs"], lambda output: tap_pass(output, 4)),
        ("focused-browser-observation", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-observation-step013b1.test.mjs"], lambda output: tap_pass(output, 5)),
        ("focused-browser-adapter-boundaries", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-playwright-boundaries-step013b1.test.mjs"], lambda output: tap_pass(output, 5)),
        ("focused-browser-runtime", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-runtime-step013a.test.mjs"], lambda output: tap_pass(output, 13)),
        ("focused-browser-boundaries", ["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-runtime-boundaries-step013a.test.mjs"], lambda output: tap_pass(output, 8)),
        ("canonical-suite", ["node", "scripts/run-step001-suite.mjs"], lambda output: "OPENRILL_STEP001_SUITE_PASS" in output and tap_pass(output)),
        ("architecture", ["python", "scripts/check_architecture.py"], lambda output: "OPENRILL_ARCHITECTURE_PASS" in output),
        ("exports", ["node", "scripts/check-exports.mjs"], lambda output: "OPENRILL_PACKAGE_EXPORT_PASS packages=26" in output),
        ("browser-live", ["node", "scripts/run-step013b2-live.mjs"], lambda output: "OPENRILL_STEP013B2_LIVE_PASS" in output and "tools=12 actions=6 navigation_state=INLINE stale_ref_recovery=SNAPSHOT dialog=BLOCK_AND_DISMISS process_count=0 chromium_orphan=0" in output),
        ("package-manifest-final", ["python", "scripts/verify_package_manifest.py"], lambda output: "OPENRILL_PACKAGE_MANIFEST_PASS" in output and "changed=0" in output),
    ]
    for stage, command, predicate in stages:
        ok, output = run_utf8(stage=stage, command=command)
        contract_ok = ok and predicate(output)
        check(stage, contract_ok, failure_excerpt(stage, output) if not contract_ok else "pass")

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, ok, detail in checks]
    marker = (
        f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} baseline=STEP013B1A "
        "adapter=PLAYWRIGHT_CORE tools=12 interactions=6 navigation_state=INLINE "
        "stale_ref_recovery=SNAPSHOT dialog=BLOCK_AND_DISMISS reporter=TAP process_count=0 chromium_orphan=0"
    )
    lines.append(marker)
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print(marker)
    if state != "PASSED":
        for name, ok, detail in checks:
            if not ok:
                print(f"OPENRILL_STEP013B2_FAILURE check={name}\n{detail}")
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
