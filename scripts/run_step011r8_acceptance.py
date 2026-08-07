from __future__ import annotations

import ast
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP011R8_APPROVAL_CREATION_NOTICE_AND_UI_LIST_REFRESH"
VERSION = "0.11.8-step011r8"
SCHEMA = 7
REPORT = ROOT / "reference/validation/STEP011R8_ACCEPTANCE_REPORT.txt"


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


def implicit_text_io() -> list[str]:
    failures: list[str] = []
    for path in sorted((ROOT / "scripts").glob("*.py")):
        tree = ast.parse(read_utf8(path), filename=path.as_posix())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            if node.func.attr not in {"read_text", "write_text"}:
                continue
            if not any(keyword.arg == "encoding" for keyword in node.keywords):
                failures.append(f"{path.name}:{node.lineno}:{node.func.attr}")
    return failures


def extract_tap_failure(output: str) -> str:
    lines = output.splitlines()
    failure_index = next((index for index, line in enumerate(lines) if line.startswith("not ok ")), None)
    if failure_index is None:
        return output[-16000:]
    start = failure_index
    if start > 0 and lines[start - 1].startswith("# Subtest:"):
        start -= 1
    while start > 0 and lines[start - 1].startswith("# Error:"):
        start -= 1
    end = len(lines)
    for index in range(failure_index + 1, len(lines)):
        if lines[index].startswith("# Subtest:"):
            end = index
            break
    summary = [
        line for line in lines
        if line.startswith(("1..", "# tests ", "# pass ", "# fail ", "# cancelled ", "# skipped ", "# todo ", "# duration_ms "))
    ][-8:]
    return "\n".join(["OPENRILL_TAP_FAILURE_BEGIN", *lines[start:end], "OPENRILL_TAP_FAILURE_END", *summary])[-24000:]


def stable_failure(output: str) -> str:
    if "runtime_unavailable" in output:
        marker = re.search(r"STEP011_CONTROL_UI_VERTICAL_SLICE checks=\d+/\d+ state=FAILED[^\r\n]*", output)
        return f"{marker.group(0) if marker else 'STEP011 state=FAILED'} prerequisite=runtime_unavailable"
    start = output.find("OPENRILL_BROWSER_EVIDENCE_BEGIN")
    end = output.find("OPENRILL_BROWSER_EVIDENCE_END", start + 1) if start >= 0 else -1
    approval_end = output.find("OPENRILL_APPROVAL_WAIT_EVIDENCE_END", end + 1) if end >= 0 else -1
    if start >= 0 and approval_end >= 0:
        return output[start:approval_end + len("OPENRILL_APPROVAL_WAIT_EVIDENCE_END")][-24000:]
    if start >= 0 and end >= 0:
        return output[start:end + len("OPENRILL_BROWSER_EVIDENCE_END")][-24000:]
    if "not ok " in output:
        return extract_tap_failure(output)
    lines = output.splitlines()
    index = next((i for i, line in enumerate(lines) if line.startswith("[FAIL] ")), None)
    return "\n".join(lines[max(0, (index or 1) - 1):])[-24000:] if index is not None else output[-16000:]


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check("step011r8-script", scripts.get("acceptance:step011r8") == "python scripts/run_step011r8_acceptance.py")
    check("step011r8-package-script", scripts.get("package:step011r8") == "python scripts/package_step011r8.py --output ../openrill-step011r8-approval-creation-notice-ui-list-refresh-v1.zip")

    required = [
        "apps/agent-web/src/browser-app.ts",
        "apps/agent-web/public/index.html",
        "apps/agent-web/public/assets/favicon.svg",
        "scripts/vendor-vue-runtime.mjs",
        "scripts/run-step011-live.mjs",
        "scripts/run_step011_acceptance.py",
        "scripts/run_step011r8_acceptance.py",
        "scripts/sh_run_step011r8_acceptance.cmd",
        "scripts/sh_run_step011r8_acceptance.sh",
        "scripts/package_step011r8.py",
        "tests/unit/vue-csp-step011r4.test.mjs",
        "tests/unit/approval-timeout-separation-step011r5.test.mjs",
        "tests/unit/vue-proxy-projection-step011r6.test.mjs",
        "tests/unit/process-manager-close-step011r7.test.mjs",
        "tests/unit/approval-notice-propagation-step011r8.test.mjs",
        "docs/plans/STEP011R8_APPROVAL_CREATION_NOTICE_AND_UI_LIST_REFRESH.md",
        "reference/validation/STEP011R3_VUE_RUNTIME_COMPILER_CSP_MISMATCH.md",
        "reference/validation/STEP011R3_IMPLICIT_FAVICON_HTTP_FAILURE.md",
        "reference/validation/STEP011R3_APPROVAL_DEEP_LINK_REACTIVITY.md",
        "reference/validation/STEP011R4_APPROVAL_TTL_PROCESS_TIMEOUT_COUPLING.md",
        "reference/validation/STEP011R5_VUE_REACTIVE_PROXY_STRUCTURED_CLONE_FAILURE.md",
        "reference/validation/STEP011R6_WINDOWS_ASYNC_CHILD_FINALIZATION_AFTER_TEST.md",
        "reference/validation/STEP011R7_APPROVAL_CREATION_NOTICE_MISSING.md",
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

    browser = read_utf8(ROOT / "apps/agent-web/src/browser-app.ts")
    html = read_utf8(ROOT / "apps/agent-web/public/index.html")
    vendor = read_utf8(ROOT / "scripts/vendor-vue-runtime.mjs")
    runner = read_utf8(ROOT / "scripts/workspace-runner.mjs")
    live = read_utf8(ROOT / "scripts/run-step011-live.mjs")
    server = read_utf8(ROOT / "services/agent-host/src/control-server.ts")
    vendor_test = read_utf8(ROOT / "tests/unit/vue-runtime-vendor-step011.test.mjs")

    config_types = read_utf8(ROOT / "packages/config/src/types.ts")
    config_schema = read_utf8(ROOT / "packages/config/src/schema.ts")
    lifecycle = read_utf8(ROOT / "services/agent-host/src/lifecycle.ts")
    timeout_test = read_utf8(ROOT / "tests/unit/approval-timeout-separation-step011r5.test.mjs")

    check("config-approval-timeout-source", "readonly approvalTimeoutMs?: number" in config_types)
    check("config-approval-timeout-materialized", "readonly approvalTimeoutMs: number" in config_types and 'approvalTimeoutMs = 120_000' in config_schema)
    check("approval-timeout-host-wiring", "timeoutMs: options.config?.execution.approvalTimeoutMs ?? 120_000" in lifecycle)
    check("process-timeout-host-wiring", "defaultTimeoutMs: options.config.execution.defaultTimeoutMs" in lifecycle)
    check("old-timeout-coupling-zero", "timeoutMs: options.config?.execution.defaultTimeoutMs" not in lifecycle)
    check("live-independent-timeouts", "defaultTimeoutMs: 5000\\n  approvalTimeoutMs: 120000" in live)
    check("focused-timeout-contract", "host lifecycle wires approval and process clocks" in timeout_test)

    check("runtime-entry-only", 'package/dist/vue.runtime.global.prod.js' in vendor and 'package/dist/vue.global.prod.js' not in vendor)
    check("runtime-output-only", 'runtimeFile: "vue.runtime.global.prod.js"' in vendor and 'vue.runtime.global.prod.js' in runner and 'vue.runtime.global.prod.js' in live)
    check("runtime-vendor-test", 'package/dist/vue.runtime.global.prod.js' in vendor_test and 'package/dist/vue.global.prod.js' not in vendor_test)
    check("html-runtime-only", '/vendor/vue.runtime.global.prod.js' in html and '/vendor/vue.global.prod.js' not in html)
    check("render-function", 'return () => h("div", { class: "app-shell"' in browser and 'onBeforeUnmount, h } = vue' in browser)
    check("runtime-template-zero", re.search(r"\btemplate\s*:", browser) is None)
    check("runtime-eval-zero", "new Function" not in browser and re.search(r"\beval\s*\(", browser) is None)
    check("csp-unsafe-eval-zero", "unsafe-eval" not in server and "script-src 'self' 'sha256-" in server)
    check("explicit-favicon", 'href="/assets/favicon.svg"' in html and (ROOT / "apps/agent-web/public/assets/favicon.svg").stat().st_size > 100)
    check("route-hash-owner", "const routeHash = ref(location.hash)" in browser and "routeHash.value = location.hash" in browser)
    check("route-hash-dependency", "routeHash.value; return approvalRequestFromLocation()" in browser)
    check("feature-suite-current", '# tests 162' in read_utf8(ROOT / "scripts/run_step011_acceptance.py") and 'unit_files=30 reporter=TAP concurrency=1' in read_utf8(ROOT / "scripts/run_step011_acceptance.py"))

    registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    for issue in range(1, 55):
        check(f"issue-registry:OR-ISSUE-{issue:03d}", f"OR-ISSUE-{issue:03d}" in registry)
    for detail in (
        "STEP011R3_VUE_RUNTIME_COMPILER_CSP_MISMATCH.md",
        "STEP011R3_IMPLICIT_FAVICON_HTTP_FAILURE.md",
        "STEP011R3_APPROVAL_DEEP_LINK_REACTIVITY.md",
        "STEP011R4_APPROVAL_TTL_PROCESS_TIMEOUT_COUPLING.md",
        "STEP011R5_VUE_REACTIVE_PROXY_STRUCTURED_CLONE_FAILURE.md",
        "STEP011R6_WINDOWS_ASYNC_CHILD_FINALIZATION_AFTER_TEST.md",
        "STEP011R7_APPROVAL_CREATION_NOTICE_MISSING.md",
    ):
        text = read_utf8(ROOT / "reference/validation" / detail)
        check(f"issue-detail:{detail}", all(heading in text for heading in ("## Exact symptom", "## Code-confirmed root cause", "## Impact", "## Fix", "## Detailed evidence", "## Recurrence-prevention gate")))
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    check("recurrence:vue-runtime-csp", "### Vue runtime-only CSP alignment" in recurrence)
    check("recurrence:browser-assets", "### Explicit browser auxiliary assets" in recurrence)
    check("recurrence:route-hash", "### Same-route hash reactivity" in recurrence)
    check("recurrence:approval-process-timeout-separation", "### Approval TTL / process timeout separation" in recurrence)
    check("recurrence:vue-proxy-projection-boundary", "### Vue reactive Proxy / projection serialization boundary" in recurrence)
    check("recurrence:background-child-quiescence", "### Background child shutdown quiescence" in recurrence)
    check("recurrence:async-tap-evidence", "### Asynchronous TAP failure evidence" in recurrence)
    check("recurrence:approval-creation-domain-notice", "### Approval creation domain notice propagation" in recurrence)
    check("recurrence:approval-wait-ledger-evidence", "### Approval wait ledger evidence" in recurrence)

    coordinator = read_utf8(ROOT / "services/agent-host/src/run-coordinator.ts")
    approval_notice_test = read_utf8(ROOT / "tests/unit/approval-notice-propagation-step011r8.test.mjs")
    check("approval-request-run-event-preserved", 'publishNotice("run.event", event)' in coordinator)
    check("approval-request-domain-notice-created", 'publishNotice("approval.updated", { ...event.data, runId: event.runId })' in coordinator)
    check("approval-domain-notice-guarded", 'event.type !== "approval.requested"' in coordinator and 'typeof event.data.requestId !== "string"' in coordinator)
    check("ui-approval-list-domain-refresh", 'if (notice.topic === "approval.updated") await loadApprovals()' in browser)
    check("ui-run-event-not-coupled-to-approval-list", 'notice.topic === "run.event" &&' not in browser and 'run.event") await loadApprovals' not in browser)
    check("approval-wait-ledger-evidence", all(token in live for token in ("OPENRILL_APPROVAL_WAIT_EVIDENCE_BEGIN", "SELECT request_id requestId", "providerRequests", "OPENRILL_APPROVAL_WAIT_EVIDENCE_END")))
    check("focused-approval-notice-contract", "approval.requested publishes both run.event and approval.updated in order" in approval_notice_test and "explicit approval domain notice" in approval_notice_test)

    projection = read_utf8(ROOT / "apps/agent-web/src/control-ui-projection.ts")
    proxy_test = read_utf8(ROOT / "tests/unit/vue-proxy-projection-step011r6.test.mjs")
    check("transport-shallow-ref", all(f"const {owner} = shallowRef" in browser for owner in ("bootstrap", "workspaces", "conversations", "conversation", "approvals", "artifacts", "diagnostics")))
    check("projection-proxy-safe-copy", "function cloneProjectionValue(value: unknown): unknown" in projection and "structuredClone" not in projection)
    check("focused-proxy-contract", "Vue-style reactive Proxy snapshots" in proxy_test and "unknown Proxy notice payload" in proxy_test)

    process_source = read_utf8(ROOT / "packages/tools-process/src/index.ts")
    step009_test = read_utf8(ROOT / "tests/unit/process-approval-step009.test.mjs")
    close_test = read_utf8(ROOT / "tests/unit/process-manager-close-step011r7.test.mjs")
    check("process-close-returns-promise", "public close(): Promise<void>" in process_source and "#closePromise" in process_source)
    check("process-child-settlement-owned", "#backgroundSettlements" in process_source and 'child.once("close"' in process_source and "Promise.all(settlements)" in process_source)
    check("process-terminal-status-preserved", '!["STARTING", "RUNNING"].includes(current.status)' in process_source)
    coordinator_index = lifecycle.find("await runCoordinator?.close()")
    manager_index = lifecycle.find("await processManager?.close()")
    database_index = lifecycle.find('stateDatabase.close({ checkpointMode: "TRUNCATE" })')
    check("host-close-order", coordinator_index >= 0 and manager_index > coordinator_index and database_index > manager_index)
    check("step009-cleanup-awaits-manager", "await manager.close()" in step009_test and "await f.manager.close()" in step009_test and "removeTreeWithRetries" in step009_test)
    check("focused-close-contract", "ProcessManager.close waits for delayed background child quiescence" in close_test and "delayed child close preserves the durable CANCELLED terminal state" in close_test)
    synthetic_tap = "\n".join([
        "# Error: A resource generated asynchronous activity after the test ended. This activity created the error \"Error: database is closed\".",
        "# Subtest: tests\\\\unit\\\\process-approval-step009.test.mjs",
        "not ok 17 - tests\\\\unit\\\\process-approval-step009.test.mjs",
        "  ---",
        "  error: 'test failed'",
        "  ...",
        "1..156",
        "# tests 156",
        "# pass 155",
        "# fail 1",
        "# skipped 0",
    ])
    extracted_tap = extract_tap_failure(synthetic_tap)
    check("async-tap-diagnostic-preserved", "# Error: A resource generated asynchronous activity after the test ended." in extracted_tap and "not ok 17" in extracted_tap and "# tests 156" in extracted_tap)

    plan = read_utf8(ROOT / "docs/plans/STEP011R8_APPROVAL_CREATION_NOTICE_AND_UI_LIST_REFRESH.md")
    for heading in ("## 목적", "## 기준선", "## Windows 실패 증거", "## 코드 확인", "## 구현 범위", "## 공개 계약", "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 반복 방지 기록", "## 패키징 산출물", "## 제외", "## 완료 선언"):
        check(f"plan-heading:{heading}", heading in plan)

    for filename in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        text = read_utf8(ROOT / filename)
        check(f"baseline-step:{filename}", STEP in text)
        check(f"baseline-version:{filename}", VERSION in text)
        check(f"baseline-step011r7-failure:{filename}", "No approvals." in text and "approval.updated" in text)
        check(f"baseline-feature:{filename}", "STEP011_CONTROL_UI_VERTICAL_SLICE" in text)
        check(f"baseline-previous-windows:{filename}", "STEP010AR1" in text and "121/121" in text and "ACCEPTED" in text)
        check(f"baseline-next:{filename}", "STEP012_AUTOMATION_SCHEDULER" in text)

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    launcher = (ROOT / "scripts/sh_run_step011r8_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in launcher and b"\n" not in launcher.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b'%~dp0..' in launcher)
    check("posix-launcher", 'cd "$SCRIPT_DIR/.."' in read_utf8(ROOT / "scripts/sh_run_step011r8_acceptance.sh"))

    build_ok, build_output = run_utf8(["node", "scripts/workspace-runner.mjs", "build"])
    check("focused-build", build_ok and "OPENRILL_WORKSPACE_BUILD_PASS" in build_output, "build_pass" if build_ok else stable_failure(build_output))
    focused_ok, focused_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/approval-notice-propagation-step011r8.test.mjs"])
    focused_contract = bool(focused_ok and re.search(r"# tests 3(?:\r?\n)", focused_output) and re.search(r"# pass 3(?:\r?\n)", focused_output) and re.search(r"# fail 0(?:\r?\n)", focused_output) and re.search(r"# skipped 0(?:\r?\n)", focused_output))
    check("focused-approval-notice-tests", focused_contract, "approval_notice_tests_pass" if focused_contract else stable_failure(focused_output))

    suite_ok, suite_output = run_utf8(["node", "scripts/run-step001-suite.mjs"])
    suite_contract = bool(suite_ok and re.search(r"# tests 162(?:\r?\n)", suite_output) and re.search(r"# pass 162(?:\r?\n)", suite_output) and re.search(r"# fail 0(?:\r?\n)", suite_output) and re.search(r"# skipped 0(?:\r?\n)", suite_output) and "OPENRILL_STEP001_SUITE_PASS unit_files=30 reporter=TAP concurrency=1" in suite_output and "OPENRILL_ARCHITECTURE_PASS" in suite_output and "OPENRILL_PACKAGE_EXPORT_PASS" in suite_output)
    check("canonical-suite", suite_contract, "suite_pass" if suite_contract else extract_tap_failure(suite_output))

    regression_ok, regression_output = run_utf8(["python", "scripts/run_step011_acceptance.py"])
    marker = re.search(r"STEP011_CONTROL_UI_VERTICAL_SLICE checks=(\d+)/(\d+) state=PASSED schema=7 framework=VUE_3 browser=CHROMIUM", regression_output)
    regression_pass = bool(regression_ok and marker and marker.group(1) == marker.group(2))
    check("step011-full-regression", regression_pass, "step011_pass" if regression_pass else stable_failure(regression_output))

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [path for path in ROOT.rglob("*") if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})]
    check("protected-payload-zero", not protected)
    report_text = read_utf8(REPORT) if REPORT.exists() else ""
    check("secret-value-not-reported", "Bearer " not in report_text and re.search(r"(?i)(api[_-]?key|secret)\s*[:=]\s*\S+", report_text) is None)

    clean()
    generated = [path for path in ROOT.rglob("*") if "node_modules" not in path.relative_to(ROOT).parts and any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)]
    check("generated-cleanup", not generated, json.dumps([str(path.relative_to(ROOT)) for path in generated[:20]]))

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, outcome, detail in checks]
    lines.append(f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} approval_notice=CREATION_PUBLISHED ui_refresh=DOMAIN_NOTICE process_close=ASYNC child_quiescence=AWAITED transport=SHALLOW_REF projection=PROXY_SAFE approval_ttl=120000 process_timeout=5000 vue=RUNTIME_ONLY csp=NO_UNSAFE_EVAL browser=CHROMIUM")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
