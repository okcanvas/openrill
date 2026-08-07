from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION"
VERSION = "0.12.10-step012dr4"
SCHEMA = int(re.search(r"OPENRILL_STATE_SCHEMA_VERSION = (\d+) as const", (ROOT / "packages/state/src/migrations.ts").read_text(encoding="utf-8")).group(1))
ACCEPTED_STEP = "STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP"
ACCEPTED_SHA256 = "3f2a47484f6341be98c00f189c12e2df7ec0e14e308de382d6bafddc90117062"
ACCEPTED_MARKER = (
    "STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP checks=101/101 state=PASSED schema=9 "
    "feature=STEP012C protocol=CREATE_LIST_GET_UPDATE_RUN_NOW_HISTORY manual_idempotency=DURABLE "
    "run_link=PRE_EXECUTION_LEASE_GUARDED executor=CONVERSATION_RUN notices=DOMAIN_EXPLICIT "
    "shutdown=ABORT_QUIESCENT browser_scope=HISTORICAL_DELEGATED "
    "browser_regression=ACCEPTED_BASELINE_NO_IMPACT ui=DEFERRED_NEXT_STEP012D"
)
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP012DR4_ACCEPTANCE_REPORT.txt")
PACKAGED_REPORT = ROOT / "reference/validation/STEP012DR4_ACCEPTANCE_REPORT.txt"
VUE_VERSION = "3.5.40"
VUE_URL = "https://registry.npmjs.org/vue/-/vue-3.5.40.tgz"
VUE_INTEGRITY = "sha512-+8PJ4SJXdn/cHGImF4CKdxlWHIN5Dkt7DoufRREM6h6uVCx2m7QxgcEQmmzyOK8A9mcafg7sFbJFYsdFVubTig=="


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def run_utf8(command: list[str], *, env: dict[str, str] | None = None) -> tuple[bool, str]:
    process_env = os.environ.copy()
    process_env.update({"PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", "NO_COLOR": "1", "NODE_DISABLE_COLORS": "1", "TERM": "dumb"})
    if env:
        process_env.update(env)
    completed = subprocess.run(command, cwd=ROOT, env=process_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return completed.returncode == 0, completed.stdout.decode("utf-8", errors="replace")


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
    for pattern in ("apps/*/package.json", "services/*/package.json", "packages/*/package.json", "connectors/*/package.json", "skills/*/package.json"):
        result.extend(ROOT.glob(pattern))
    return sorted(result)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def implicit_text_io() -> list[str]:
    failures: list[str] = []
    for path in sorted((ROOT / "scripts").glob("*.py")):
        tree = ast.parse(read_utf8(path), filename=path.as_posix())
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in {"read_text", "write_text"}:
                if not any(keyword.arg == "encoding" for keyword in node.keywords):
                    failures.append(f"{path.name}:{node.lineno}:{node.func.attr}")
    return failures


def stable_failure(output: str) -> str:
    lines = output.splitlines()
    if "not ok " in output:
        index = next((i for i, line in enumerate(lines) if line.startswith("not ok ")), 0)
        return "\n".join(lines[max(0, index - 2):])[-24000:]
    index = next((i for i, line in enumerate(lines) if line.startswith("[FAIL] ")), None)
    if index is not None:
        return "\n".join(lines[max(0, index - 1):])[-24000:]
    return output[-16000:]


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []
    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check("step012dr4-script", scripts.get("acceptance:step012dr4") == "python scripts/run_step012dr4_acceptance.py")
    check("step012dr4-package-script", scripts.get("package:step012dr4") == "python scripts/package_step012dr4.py --output ../openrill-step012dr4-automation-history-row-selector-isolation-v1.zip")

    required = [
        "apps/agent-web/src/browser-app.ts", "apps/agent-web/public/assets/app.css",
        "scripts/run-step012d-live.mjs", "scripts/live-host-ready.mjs", "scripts/live-vue-static.mjs", "scripts/run_step012dr4_acceptance.py",
        "scripts/sh_run_step012dr4_acceptance.cmd", "scripts/sh_run_step012dr4_acceptance.sh", "scripts/package_step012dr4.py",
        "tests/unit/automation-control-ui-step012d.test.mjs", "tests/unit/live-host-ready-step012dr1.test.mjs", "tests/unit/vue-static-serving-step012dr2.test.mjs",
        "tests/unit/process-approval-step009.test.mjs", "tests/unit/background-process-observation-step012dr3.test.mjs",
        "tests/unit/automation-history-row-selector-step012dr4.test.mjs",
        "docs/plans/STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION.md",
        "docs/validation/STEP012D_FAILURE_PREVENTION_AUDIT.md",
        "reference/validation/STEP012CR1_WINDOWS_LIVE_ACCEPTED.md",
        "reference/validation/STEP012D_AUTOMATION_INTERVAL_ANCHOR_EDIT_DRIFT.md",
        "reference/validation/STEP012D_HISTORICAL_BROWSER_OWNER_CUTOVER_DRIFT.md",
        "reference/validation/STEP012D_HISTORICAL_ROOT_DOCUMENT_EXPECTATION_DRIFT.md",
        "reference/validation/STEP012D_PROTOCOL_IDEMPOTENCY_MASKS_DURABLE_MANUAL_REPLAY.md",
        "reference/validation/STEP012D_ACCEPTED_BASELINE_VERSION_STALE_FALSE_POSITIVE.md",
        "reference/validation/STEP012D_WINDOWS_UI_CONNECTION_WAIT_BEFORE_HOST_READY_AND_PHASE_COLLAPSE.md",
        "reference/validation/STEP012DR1_HISTORICAL_FEATURE_AND_CURRENT_RELEASE_IDENTITY_CONFLATION.md",
        "reference/validation/STEP012DR1_WINDOWS_VUE_VENDOR_NOT_MATERIALIZED_IN_STATIC_ROOT.md",
        "reference/validation/STEP012DR2_WINDOWS_BACKGROUND_PROCESS_STDOUT_FIXED_SLEEP_RACE.md",
        "reference/validation/STEP012DR3_WINDOWS_AUTOMATION_HISTORY_SELECTOR_PREFIX_COLLISION.md",
        "reference/validation/STEP012DR4_ACCEPTANCE_REPORT.txt",
        "docs/governance/ENGINEERING_ISSUE_REGISTRY.md", "docs/testing/RECURRENCE_PREVENTION_GATES.md",
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

    browser = read_utf8(ROOT / "apps/agent-web/src/browser-app.ts")
    css = read_utf8(ROOT / "apps/agent-web/public/assets/app.css")
    live = read_utf8(ROOT / "scripts/run-step012d-live.mjs")
    step011_live = read_utf8(ROOT / "scripts/run-step011-live.mjs")
    ready_helper = read_utf8(ROOT / "scripts/live-host-ready.mjs")
    browser_evidence = read_utf8(ROOT / "scripts/browser-page-evidence.mjs")
    vue_static = read_utf8(ROOT / "scripts/live-vue-static.mjs")
    acceptance_source = read_utf8(ROOT / "scripts/run_step012dr4_acceptance.py")
    process_test_source = read_utf8(ROOT / "tests/unit/process-approval-step009.test.mjs")
    history_selector_test_source = read_utf8(ROOT / "tests/unit/automation-history-row-selector-step012dr4.test.mjs")
    check("automation-route", '"automations"' in browser and 'data-testid": `nav-${item}`' in browser)
    for operation in ("automation.create", "automation.list", "automation.get", "automation.update", "automation.run_now", "automation.history"):
        check(f"ui-operation:{operation}", operation in browser)
    for testid in ("automation-new", "automation-save", "automation-toggle", "automation-run-now", "automation-replay-run", "automation-history"):
        check(f"ui-testid:{testid}", testid in browser)
    check("job-notice-refresh", 'notice.topic === "automation.job.updated"' in browser and "await loadAutomations()" in browser)
    check("run-notice-refresh", 'notice.topic === "automation.run.updated"' in browser and "await loadAutomationHistory()" in browser)
    check("revision-update", "expectedRevision: job.revision" in browser)
    check("interval-anchor-preserved", 'currentSchedule?.kind === "interval"' in browser and "currentSchedule.anchorMs" in browser)
    check("interval-anchor-unconditional-zero", "everyMs: intervalEveryMs, anchorMs: Date.now()" not in browser)
    check("manual-replay-transport-key-separated", 'automation.run_now", { jobId: job.jobId, requestKey }, requestKey' not in browser and 'automation.run_now", { jobId: job.jobId, requestKey })' in browser)
    check("responsive-automation-layout", ".automation-layout" in css and "@media (max-width: 900px)" in css and "@media (max-width: 620px)" in css)
    check("live-automation-enabled", "automation:\\n  enabled: true" in live)
    check("live-durable-replay", "RUN_REPLAYED" in live and "providerRequests !== 1" in live and "runs.length !== 1" in live)
    check("live-ledger-link", "automation_runs" in live and "agent_runs" in live and "conversation_messages" in live)
    check("live-secret-boundary", "dbBytes.includes(Buffer.from(apiSecret))" in live)
    check("live-marker", "OPENRILL_STEP012D_LIVE_PASS" in live)
    check("host-ready-helper-contract", 'metadata?.state === "READY"' in ready_helper and "metadata?.readiness === true" in ready_helper and "metadata.port > 0" in ready_helper)
    check("step011-host-ready-owned", "waitForReadyHostMetadata" in step011_live)
    check("step012d-host-ready-owned", "waitForReadyHostMetadata" in live)
    check("ui-startup-phases", all(token in browser for token in ("FETCH_BOOTSTRAP", "CONNECT_PROTOCOL", "LOAD_AUTOMATIONS", "LOAD_HOST_STATUS", "READY", "FAILED")))
    check("ui-connection-phase-separated", 'data-testid": "connection-state"' in browser and 'data-testid": "startup-phase"' in browser)
    check("browser-evidence-startup-phase", "startupPhase:" in browser_evidence and "startup-phase" in browser_evidence)
    check("live-waits-connected-and-ready", "Automation UI ready" in live and "startup-phase" in live and "textContent === 'READY'" in live)
    check("live-startup-evidence", "OPENRILL_STEP012D_STARTUP_EVIDENCE_BEGIN" in live and "OPENRILL_STEP012D_STARTUP_EVIDENCE_END" in live and "bootstrapToken" not in live)
    check("vendor-aware-build-owned", 'run_utf8(["node", "scripts/workspace-runner.mjs", "build"], env=runtime_env)' in acceptance_source)
    check("vendor-dist-byte-verification", "dist_vendor_root" in acceptance_source and all(name in acceptance_source for name in ("vue.runtime.global.prod.js", "vue.runtime.lock.json", "LICENSE.vue.txt")))
    check("live-vue-static-preflight", "verifyServedVueRuntime" in live and "OPENRILL_VUE_STATIC_EVIDENCE_BEGIN" in vue_static)
    check("live-vue-static-before-browser", live.index("verifyServedVueRuntime") < live.index("launchBrowser(`${base}/#/automations`)"))

    registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    check("issue-registry-067", "OR-ISSUE-067" in registry)
    check("issue-registry-068", "OR-ISSUE-068" in registry)
    check("issue-registry-069", "OR-ISSUE-069" in registry)
    check("issue-registry-070", "OR-ISSUE-070" in registry)
    check("issue-registry-071", "OR-ISSUE-071" in registry)
    check("issue-registry-072", "OR-ISSUE-072" in registry)
    check("issue-registry-073", "OR-ISSUE-073" in registry)
    check("issue-registry-074", "OR-ISSUE-074" in registry)
    check("issue-registry-075", "OR-ISSUE-075" in registry)
    check("issue-registry-076", "OR-ISSUE-076" in registry)
    check("issue-detail-067", "anchorMs" in read_utf8(ROOT / "reference/validation/STEP012D_AUTOMATION_INTERVAL_ANCHOR_EDIT_DRIFT.md"))
    check("issue-detail-068", "OPENRILL_HISTORICAL_BROWSER_NO_IMPACT_FAIL" in read_utf8(ROOT / "reference/validation/STEP012D_HISTORICAL_BROWSER_OWNER_CUTOVER_DRIFT.md"))
    check("issue-detail-069", "mutable current root" in read_utf8(ROOT / "reference/validation/STEP012D_HISTORICAL_ROOT_DOCUMENT_EXPECTATION_DRIFT.md"))
    check("issue-detail-070", "Local Protocol connection-level idempotency cache" in read_utf8(ROOT / "reference/validation/STEP012D_PROTOCOL_IDEMPOTENCY_MASKS_DURABLE_MANUAL_REPLAY.md"))
    check("issue-detail-071", "context-free stale literal scan" in read_utf8(ROOT / "reference/validation/STEP012D_ACCEPTED_BASELINE_VERSION_STALE_FALSE_POSITIVE.md"))
    issue_072 = read_utf8(ROOT / "reference/validation/STEP012D_WINDOWS_UI_CONNECTION_WAIT_BEFORE_HOST_READY_AND_PHASE_COLLAPSE.md")
    check("issue-detail-072", "browser wait timeout: Automation UI connected" in issue_072 and "LISTENING" in issue_072 and "READY" in issue_072 and "전체 browser evidence" in issue_072)
    issue_073 = read_utf8(ROOT / "reference/validation/STEP012DR1_HISTORICAL_FEATURE_AND_CURRENT_RELEASE_IDENTITY_CONFLATION.md")
    check("issue-detail-073", "current release identity" in issue_073 and "retained feature identity" in issue_073 and "PACKAGE_MANIFEST.json" in issue_073)
    issue_074 = read_utf8(ROOT / "reference/validation/STEP012DR1_WINDOWS_VUE_VENDOR_NOT_MATERIALIZED_IN_STATIC_ROOT.md")
    check("issue-detail-074", "404" in issue_074 and "vue.runtime.global.prod.js" in issue_074 and "workspace-runner.mjs" in issue_074 and "OR-ISSUE-074" in issue_074)
    issue_075 = read_utf8(ROOT / "reference/validation/STEP012DR2_WINDOWS_BACKGROUND_PROCESS_STDOUT_FIXED_SLEEP_RACE.md")
    check("issue-detail-075", "actual first tail" in issue_075.lower() or "Input: ''" in issue_075)
    issue_076 = read_utf8(ROOT / "reference/validation/STEP012DR3_WINDOWS_AUTOMATION_HISTORY_SELECTOR_PREFIX_COLLISION.md")
    check("issue-detail-076", "automation-run-now" in issue_076 and "automation-history-row" in issue_076 and "OR-ISSUE-076" in issue_076)
    check("history-row-namespace", "automation-history-row-${run.automationRunId}" in browser)
    check("history-row-broad-prefix-zero", "querySelectorAll('[data-testid^=\"automation-run-\"]')" not in live)
    check("history-row-durable-ledger", "runs.length !== 1" in live and "providerRequests !== 1" in live)
    check("background-output-bounded-poll", "async function waitForProcessText" in process_test_source and "setTimeout(resolve, 100)" not in process_test_source)
    check("background-output-delayed-fixture", "setTimeout(()=>console.log('ready'),250)" in process_test_source)
    check("background-output-timeout-evidence", "status=${lastStatus}; tail=${JSON.stringify(lastText)}" in process_test_source)
    check("recurrence-vue-static-serving", "### Vue vendor build and static serving alignment" in recurrence)
    check("historical-current-release-dynamic", 'JSON.parse(await source("PACKAGE_MANIFEST.json"))' in read_utf8(ROOT / "tests/unit/historical-acceptance-baseline-scope-step012br1.test.mjs"))
    check("recurrence-step012dr1", "STEP012DR1 Host READY와 UI bootstrap phase 추가 의무" in recurrence)
    check("recurrence-step012dr2", "STEP012DR2 Vue vendor build/static serving 추가 의무" in recurrence)
    check("recurrence-step012dr3", "STEP012DR3 background process output observation 추가 의무" in recurrence)
    check("recurrence-step012dr4", "STEP012DR4 Automation history selector isolation 추가 의무" in recurrence)
    check("recurrence-step012d", "STEP012D Automation Control UI 추가 의무" in recurrence)
    check("failure-prevention-audit", "domain mutation" in read_utf8(ROOT / "docs/validation/STEP012D_FAILURE_PREVENTION_AUDIT.md"))

    accepted = read_utf8(ROOT / "reference/validation/STEP012CR1_WINDOWS_LIVE_ACCEPTED.md")
    check("accepted-step-evidence", ACCEPTED_STEP in accepted and "101/101" in accepted and "WINDOWS_LIVE_ACCEPTED" in accepted)
    check("accepted-artifact-sha", ACCEPTED_SHA256 in accepted)
    check("accepted-marker-exact", ACCEPTED_MARKER in accepted)

    plan = read_utf8(ROOT / "docs/plans/STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION.md")
    for heading in ("## 목적", "## 기준선", "## 코드 확인", "## 구현 범위", "## 공개 계약", "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 반복 방지 기록", "## 패키징 산출물", "## 제외", "## 완료 선언"):
        check(f"plan-heading:{heading}", heading in plan)
    for filename in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        text = read_utf8(ROOT / filename)
        check(f"baseline-current-step:{filename}", STEP in text)
        check(f"baseline-current-version:{filename}", VERSION in text)
        check(f"baseline-accepted-step:{filename}", ACCEPTED_STEP in text and "101/101" in text)
        check(f"baseline-accepted-sha:{filename}", ACCEPTED_SHA256 in text)
        check(f"baseline-browser-owner:{filename}", "actual" in text.lower() and "Chromium" in text)
        check(f"baseline-stale-zero:{filename}", "current_candidate=STEP012CR1" not in text and "current_candidate=STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP" not in text)

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    cmd_bytes = (ROOT / "scripts/sh_run_step012dr4_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd_bytes and b"\n" not in cmd_bytes.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd_bytes)
    check("posix-launcher", 'cd "$SCRIPT_DIR/.."' in read_utf8(ROOT / "scripts/sh_run_step012dr4_acceptance.sh"))

    initial_manifest_ok, initial_manifest_output = run_utf8(["python", "scripts/verify_package_manifest.py"])
    check("package-manifest-initial", initial_manifest_ok and "OPENRILL_PACKAGE_MANIFEST_PASS" in initial_manifest_output, initial_manifest_output.strip())

    build_ok, build_output = run_utf8(["node", "scripts/workspace-runner.mjs", "build"])
    check("focused-build", build_ok and "OPENRILL_WORKSPACE_BUILD_PASS" in build_output, "build_pass" if build_ok else stable_failure(build_output))

    process_ok, process_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/process-approval-step009.test.mjs"])
    process_contract = bool(process_ok and re.search(r"# tests 12(?:\r?\n)", process_output) and re.search(r"# pass 12(?:\r?\n)", process_output) and re.search(r"# fail 0(?:\r?\n)", process_output) and re.search(r"# skipped 0(?:\r?\n)", process_output))
    check("focused-step009-process-approval", process_contract, "process_approval_tests_pass" if process_contract else stable_failure(process_output))

    observation_ok, observation_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/background-process-observation-step012dr3.test.mjs"])
    observation_contract = bool(observation_ok and re.search(r"# tests 4(?:\r?\n)", observation_output) and re.search(r"# pass 4(?:\r?\n)", observation_output) and re.search(r"# fail 0(?:\r?\n)", observation_output) and re.search(r"# skipped 0(?:\r?\n)", observation_output))
    check("focused-background-output-observation", observation_contract, "background_output_observation_pass" if observation_contract else stable_failure(observation_output))

    selector_ok, selector_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/automation-history-row-selector-step012dr4.test.mjs"])
    selector_contract = bool(selector_ok and re.search(r"# tests 4(?:\r?\n)", selector_output) and re.search(r"# pass 4(?:\r?\n)", selector_output) and re.search(r"# fail 0(?:\r?\n)", selector_output) and re.search(r"# skipped 0(?:\r?\n)", selector_output))
    check("focused-history-row-selector", selector_contract, "history_row_selector_pass" if selector_contract else stable_failure(selector_output))

    repeat_failures: list[str] = []
    for index in range(5):
        repeated_ok, repeated_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/process-approval-step009.test.mjs"])
        repeated_contract = bool(repeated_ok and re.search(r"# tests 12(?:\r?\n)", repeated_output) and re.search(r"# pass 12(?:\r?\n)", repeated_output) and re.search(r"# fail 0(?:\r?\n)", repeated_output) and re.search(r"# skipped 0(?:\r?\n)", repeated_output))
        if not repeated_contract:
            repeat_failures.append(f"run={index + 1}:" + stable_failure(repeated_output))
            break
    check("focused-step009-repeat-5", not repeat_failures, "5/5_pass" if not repeat_failures else "|".join(repeat_failures))

    ui_ok, ui_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/automation-control-ui-step012d.test.mjs"])
    ui_contract = bool(ui_ok and re.search(r"# tests 6(?:\r?\n)", ui_output) and re.search(r"# pass 6(?:\r?\n)", ui_output) and re.search(r"# fail 0(?:\r?\n)", ui_output) and re.search(r"# skipped 0(?:\r?\n)", ui_output))
    check("focused-step012d-ui-bootstrap", ui_contract, "step012d_ui_bootstrap_tests_pass" if ui_contract else stable_failure(ui_output))

    ready_ok, ready_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/live-host-ready-step012dr1.test.mjs"])
    ready_contract = bool(ready_ok and re.search(r"# tests 2(?:\r?\n)", ready_output) and re.search(r"# pass 2(?:\r?\n)", ready_output) and re.search(r"# fail 0(?:\r?\n)", ready_output) and re.search(r"# skipped 0(?:\r?\n)", ready_output))
    check("focused-host-ready", ready_contract, "host_ready_tests_pass" if ready_contract else stable_failure(ready_output))

    static_ok, static_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/vue-static-serving-step012dr2.test.mjs"])
    static_contract = bool(static_ok and re.search(r"# tests 4(?:\r?\n)", static_output) and re.search(r"# pass 4(?:\r?\n)", static_output) and re.search(r"# fail 0(?:\r?\n)", static_output) and re.search(r"# skipped 0(?:\r?\n)", static_output))
    check("focused-vue-static-serving", static_contract, "vue_static_serving_tests_pass" if static_contract else stable_failure(static_output))

    integration_ok, integration_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/automation-protocol-step012c.test.mjs"])
    integration_contract = bool(integration_ok and re.search(r"# tests 5(?:\r?\n)", integration_output) and re.search(r"# pass 5(?:\r?\n)", integration_output) and re.search(r"# fail 0(?:\r?\n)", integration_output) and re.search(r"# skipped 0(?:\r?\n)", integration_output))
    check("focused-step012c-integration", integration_contract, "step012c_integration_tests_pass" if integration_contract else stable_failure(integration_output))

    suite_ok, suite_output = run_utf8(["node", "scripts/run-step001-suite.mjs"])
    tests_match = re.search(r"# tests (\d+)(?:\r?\n)", suite_output)
    pass_match = re.search(r"# pass (\d+)(?:\r?\n)", suite_output)
    current_unit_files = len(list((ROOT / "tests/unit").glob("*.test.mjs")))
    suite_contract = bool(suite_ok and tests_match and pass_match and tests_match.group(1) == pass_match.group(1) and int(tests_match.group(1)) >= 230 and re.search(r"# fail 0(?:\r?\n)", suite_output) and re.search(r"# skipped 0(?:\r?\n)", suite_output) and f"OPENRILL_STEP001_SUITE_PASS unit_files={current_unit_files} reporter=TAP concurrency=1" in suite_output and "OPENRILL_ARCHITECTURE_PASS" in suite_output and "OPENRILL_PACKAGE_EXPORT_PASS" in suite_output)
    check("canonical-suite", suite_contract, "suite_pass" if suite_contract else stable_failure(suite_output))

    vendor_temp = Path(tempfile.mkdtemp(prefix="openrill-step012dr4-vue-"))
    vendor_root = vendor_temp / "vendor"
    archive_output = vendor_temp / "vue-3.5.40.tgz"
    archive_input = os.environ.get("OPENRILL_VUE_ARCHIVE")
    vendor_command = ["node", "scripts/vendor-vue-runtime.mjs"]
    vendor_command.extend(["--archive", archive_input] if archive_input else ["--download"])
    vendor_command.extend(["--output-root", str(vendor_root), "--archive-output", str(archive_output)])
    vendor_ok, vendor_output = run_utf8(vendor_command)
    browser_contract = False
    browser_detail = "runtime_unavailable"
    if vendor_ok:
        vendor_failures: list[str] = []
        try:
            lock = json.loads(read_utf8(vendor_root / "vue.runtime.lock.json"))
            runtime = vendor_root / "vue.runtime.global.prod.js"
            license_path = vendor_root / "LICENSE.vue.txt"
            vendor_predicates = {
                "version": lock.get("version") == VUE_VERSION,
                "source": lock.get("source") == VUE_URL,
                "integrity": lock.get("packageIntegrity") == VUE_INTEGRITY,
                "runtime-bytes": runtime.stat().st_size == lock.get("fileBytes") and runtime.stat().st_size > 80_000,
                "runtime-sha256": sha256(runtime) == lock.get("fileSha256"),
                "archive-sha256": sha256(archive_output) == lock.get("packageSha256"),
                "license": "MIT License" in read_utf8(license_path),
            }
            vendor_failures.extend(name for name, outcome in vendor_predicates.items() if not outcome)
            verify_root = vendor_temp / "verify"
            verify_archive = vendor_temp / "verify.tgz"
            verify_ok, verify_output = run_utf8(["node", "scripts/vendor-vue-runtime.mjs", "--archive", str(archive_output), "--output-root", str(verify_root), "--archive-output", str(verify_archive)])
            if not verify_ok:
                vendor_failures.append("reextract:" + stable_failure(verify_output))
            elif (verify_root / "vue.runtime.global.prod.js").read_bytes() != runtime.read_bytes() or (verify_root / "LICENSE.vue.txt").read_bytes() != license_path.read_bytes():
                vendor_failures.append("reextract-byte-drift")
            runtime_env = {"OPENRILL_VUE_RUNTIME_VENDOR_DIR": str(vendor_root)}
            if not vendor_failures and suite_contract:
                vendor_build_ok, vendor_build_output = run_utf8(["node", "scripts/workspace-runner.mjs", "build"], env=runtime_env)
                if not vendor_build_ok:
                    vendor_failures.append("vendor-aware-build:" + stable_failure(vendor_build_output))
                else:
                    dist_vendor_root = ROOT / "apps/agent-web/dist/public/vendor"
                    for file_name in ("vue.runtime.global.prod.js", "vue.runtime.lock.json", "LICENSE.vue.txt"):
                        source_path = vendor_root / file_name
                        built_path = dist_vendor_root / file_name
                        if not built_path.is_file() or built_path.read_bytes() != source_path.read_bytes():
                            vendor_failures.append(f"dist-vendor-byte-drift:{file_name}")
            if not vendor_failures and suite_contract:
                live_ok, live_output = run_utf8(["node", "scripts/run-step012d-live.mjs"], env=runtime_env)
                live_marker = f"OPENRILL_STEP012D_LIVE_PASS schema={SCHEMA} framework=VUE_3 automation=CREATE_UPDATE_ENABLE_DISABLE_RUN_NOW_HISTORY replay=DURABLE notices=JOB_RUN_REFRESH conversation=COMPLETED browser=CHROMIUM mobile=PASS modelCalls=1 secret=POINT_OF_USE"
                browser_contract = bool(live_ok and live_marker in live_output)
                browser_detail = "live_pass" if browser_contract else stable_failure(live_output)
            elif vendor_failures:
                browser_detail = "vendor_contract_failed:" + "|".join(vendor_failures)
            else:
                browser_detail = "canonical_suite_failed"
        except Exception as cause:
            browser_detail = f"vendor_contract_exception:{type(cause).__name__}:{cause}"
    check("step012dr4-exact-vue-actual-chromium", browser_contract, browser_detail)

    final_manifest_ok, final_manifest_output = run_utf8(["python", "scripts/verify_package_manifest.py"])
    check("package-manifest-final", final_manifest_ok and "OPENRILL_PACKAGE_MANIFEST_PASS" in final_manifest_output, final_manifest_output.strip())
    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [path for path in ROOT.rglob("*") if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})]
    check("protected-payload-zero", not protected)
    report_text = read_utf8(PACKAGED_REPORT) if PACKAGED_REPORT.exists() else ""
    check("secret-value-not-reported", "Bearer " not in report_text and re.search(r"(?i)(api[_-]?key|secret)\s*[:=]\s*\S+", report_text) is None)

    shutil.rmtree(vendor_temp, ignore_errors=True)
    clean()
    generated_paths = [path for path in ROOT.rglob("*") if "node_modules" not in path.relative_to(ROOT).parts and any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)]
    check("generated-cleanup", not generated_paths, json.dumps([str(path.relative_to(ROOT)) for path in generated_paths[:20]]))

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, outcome, detail in checks]
    lines.append(f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} history_selector=ISOLATED durable_ledger=ONE_RUN process_output=BOUNDED_POLLING host_ready=AWAITED startup=PHASED vendor_build=ALIGNED static_serving=BYTE_VERIFIED evidence=STARTUP_BOUNDED ui=AUTOMATION_CRUD_RUN_HISTORY browser=CHROMIUM mobile=PASS")
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
