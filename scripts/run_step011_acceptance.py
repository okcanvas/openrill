from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = resolve_acceptance_report(ROOT, "reference/validation/STEP011_ACCEPTANCE_REPORT.txt")
VERSION = "0.12.7-step012dr1"
RELEASE_STEP = "STEP012DR1_HOST_READY_AND_UI_BOOTSTRAP_PHASE_ALIGNMENT"
STEP = "STEP011_CONTROL_UI_VERTICAL_SLICE"
SCHEMA = int(re.search(r"OPENRILL_STATE_SCHEMA_VERSION = (\d+) as const", (ROOT / "packages/state/src/migrations.ts").read_text(encoding="utf-8")).group(1))
VUE_VERSION = "3.5.40"
VUE_URL = "https://registry.npmjs.org/vue/-/vue-3.5.40.tgz"
VUE_INTEGRITY = "sha512-+8PJ4SJXdn/cHGImF4CKdxlWHIN5Dkt7DoufRREM6h6uVCx2m7QxgcEQmmzyOK8A9mcafg7sFbJFYsdFVubTig=="


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


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
        "apps/*/package.json",
        "services/*/package.json",
        "packages/*/package.json",
        "connectors/*/package.json",
        "skills/*/package.json",
    ):
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
        return output[-12000:]
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
    return "\n".join(["OPENRILL_TAP_FAILURE_BEGIN", *lines[start:end], "OPENRILL_TAP_FAILURE_END", *summary])[-20000:]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize_failure_evidence(output: str) -> str:
    normalized = output.replace(str(ROOT), "<ROOT>").replace(str(ROOT).replace("/", "\\"), "<ROOT>")
    normalized = re.sub(r"https?://(?:127\.0\.0\.1|localhost):\d+", "<LOOPBACK>", normalized)
    normalized = re.sub(r"(?i)[A-Z]:\\[^\r\n'\"]*?(?:AppData\\Local\\Temp|Temp)\\[^\r\n'\"]+", "<TEMP>", normalized)
    normalized = re.sub(r"/tmp/[^\s'\"]+", "<TEMP>", normalized)
    normalized = re.sub(r"# duration_ms \d+(?:\.\d+)?", "# duration_ms <DURATION>", normalized)
    return normalized


def extract_browser_failure(output: str) -> str:
    if output == "runtime_unavailable" or "runtime_unavailable" in output:
        return "runtime_unavailable"
    start_marker = "OPENRILL_BROWSER_EVIDENCE_BEGIN"
    end_marker = "OPENRILL_BROWSER_EVIDENCE_END"
    start = output.find(start_marker)
    end = output.find(end_marker, start + len(start_marker)) if start >= 0 else -1
    if start >= 0 and end >= 0:
        evidence = output[start:end + len(end_marker)]
        marker = re.search(r"STEP011_CONTROL_UI_VERTICAL_SLICE checks=\d+/\d+ state=(?:PASSED|FAILED)[^\r\n]*", output)
        combined = evidence + ("\n" + marker.group(0) if marker else "")
        return normalize_failure_evidence(combined)[-20000:]
    failure = re.search(r"(?ms)^\[FAIL\] step011-real-chromium-live :: (.*?)(?=^\[PASS\] step010-skill-live-regression|^STEP011_CONTROL_UI_VERTICAL_SLICE)", output)
    if failure:
        return normalize_failure_evidence(failure.group(1).strip())[-16000:]
    return normalize_failure_evidence(output[-16000:])


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check("step011-script", scripts.get("acceptance:step011") == "python scripts/run_step011_acceptance.py")
    check(
        "step011-package-script",
        scripts.get("package:step011") == "python scripts/package_step011.py --output ../openrill-step011-control-ui-vertical-slice-v1.zip",
    )
    check("step011-vendor-script", scripts.get("vendor:vue-runtime") == "node scripts/vendor-vue-runtime.mjs --download")

    required = [
        "apps/agent-web/src/browser-app.ts",
        "apps/agent-web/src/control-ui-projection.ts",
        "apps/agent-web/src/api/local-protocol-client.ts",
        "apps/agent-web/public/index.html",
        "apps/agent-web/public/assets/app.css",
        "packages/protocol/src/control-ui-operations.ts",
        "services/agent-host/src/control-ui-service.ts",
        "services/agent-host/src/control-server.ts",
        "services/agent-host/src/transport/operation-registry.ts",
        "tests/unit/control-ui-step011.test.mjs",
        "tests/unit/vue-runtime-vendor-step011.test.mjs",
        "tests/unit/vue-proxy-projection-step011r6.test.mjs",
        "tests/unit/process-manager-close-step011r7.test.mjs",
        "tests/unit/approval-notice-propagation-step011r8.test.mjs",
        "scripts/vendor-vue-runtime.mjs",
        "scripts/run-step011-live.mjs",
        "scripts/run_step011_acceptance.py",
        "scripts/sh_run_step011_acceptance.cmd",
        "scripts/sh_run_step011_acceptance.sh",
        "scripts/package_step011.py",
        "docs/contracts/CONTROL_UI.md",
        "docs/adrs/ADR-0028-CONTROL_UI_VERTICAL_SLICE.md",
        "docs/plans/STEP011_CONTROL_UI_VERTICAL_SLICE.md",
        "reference/validation/STEP011_LIVE_PROGRESS_ENVELOPE_VOCABULARY_DRIFT.md",
        "reference/validation/STEP011_NOTICE_GAP_CURSOR_ADVANCE.md",
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
    generated = json.loads(read_utf8(ROOT / "PACKAGE_MANIFEST.json"))
    for label, source in (("generator", generator), ("verifier", verifier)):
        check(f"package-manifest-{label}-step", f'STEP = "{RELEASE_STEP}"' in source)
        check(f"package-manifest-{label}-version", f'VERSION = "{VERSION}"' in source)
    check(
        "package-manifest-generated-identity",
        generated.get("step") == RELEASE_STEP and generated.get("version") == VERSION,
        f"{generated.get('step')} {generated.get('version')}",
    )

    state_owner = read_utf8(ROOT / "packages/state/src/migrations.ts")
    check("schema-owner-current", f"OPENRILL_STATE_SCHEMA_VERSION = {SCHEMA} as const" in state_owner and SCHEMA >= 8)

    framework = json.loads(read_utf8(ROOT / "config/ui-framework.json"))
    check("framework-selection", framework.get("selection") == "VUE_3")
    check("framework-runtime-step", framework.get("runtimeIntroductionStep") == STEP)
    check("framework-production-present", framework.get("productionRuntimeDependencyPresent") is True)

    web_index = read_utf8(ROOT / "apps/agent-web/src/index.ts")
    check("web-version", f'PACKAGE_VERSION = "{VERSION}"' in web_index)
    check("web-framework", 'UI_FRAMEWORK_SELECTION = "VUE_3"' in web_index)
    check("web-runtime-step", 'UI_RUNTIME_INTRODUCTION_STEP = "STEP011"' in web_index)

    vendor_source = read_utf8(ROOT / "scripts/vendor-vue-runtime.mjs")
    for label, token in (
        ("version", f'VUE_RUNTIME_VERSION = "{VUE_VERSION}"'),
        ("url", "registry.npmjs.org/vue/-/vue-"),
        ("integrity", VUE_INTEGRITY),
        ("runtime-entry", "package/dist/vue.runtime.global.prod.js"),
        ("license-entry", "package/LICENSE"),
        ("archive-bound", "MAX_ARCHIVE_BYTES"),
        ("unpacked-bound", "MAX_UNPACKED_BYTES"),
    ):
        check(f"vue-vendor:{label}", token in vendor_source)

    workspace_runner = read_utf8(ROOT / "scripts/workspace-runner.mjs")
    check("build-external-vendor-root", "OPENRILL_VUE_RUNTIME_VENDOR_DIR" in workspace_runner)
    for name in ("vue.runtime.global.prod.js", "LICENSE.vue.txt", "vue.runtime.lock.json"):
        check(f"build-vendor-file:{name}", name in workspace_runner)

    html = read_utf8(ROOT / "apps/agent-web/public/index.html")
    check("html-vue-before-app", html.index("/vendor/vue.runtime.global.prod.js") < html.index("/assets/web/browser-app.js"))
    check("html-same-origin-vue", 'src="/vendor/vue.runtime.global.prod.js"' in html)
    check("html-importmap", 'type="importmap"' in html and '"@openrill/protocol"' in html)
    check("html-no-cdn", not re.search(r"https?://", html))

    browser_app = read_utf8(ROOT / "apps/agent-web/src/browser-app.ts")
    check("ui-render-function", 'return () => h("div", { class: "app-shell"' in browser_app)
    check("ui-runtime-template-zero", re.search(r"\btemplate\s*:", browser_app) is None)
    check("ui-runtime-eval-zero", "new Function" not in browser_app and re.search(r"\beval\s*\(", browser_app) is None)
    check("ui-route-hash-reactive", "const routeHash = ref(location.hash)" in browser_app and "routeHash.value = location.hash" in browser_app)
    check("ui-transport-shallow-ref", all(f"const {owner} = shallowRef" in browser_app for owner in ("bootstrap", "workspaces", "conversations", "conversation", "approvals", "artifacts", "diagnostics")))
    for route in ("conversations", "workspaces", "skills", "approvals", "artifacts", "settings", "diagnostics"):
        check(f"ui-route:{route}", f'"{route}"' in browser_app)
    for test_id in (
        "app-shell", "connection-state", "composer", "send-message", "approval-allow-once",
        "artifact-file", "artifact-modal", "artifact-content",
    ):
        check(f"ui-testid:{test_id}", test_id in browser_app)
    for token in ("ui.snapshot", "conversation.send", "approval.resolve", "artifact.list", "workspace.list"):
        check(f"ui-operation:{token}", token in browser_app)
    check("ui-token-memory-only", "localStorage.setItem" in browser_app and "protocol.token" not in re.findall(r"localStorage\.setItem\([^\n]+", browser_app).__str__())
    check("ui-card-bound", "MAX_RENDERED_CARDS = 40" in browser_app)
    check("ui-mobile-smoke-source", "390" in read_utf8(ROOT / "scripts/run-step011-live.mjs"))

    projection = read_utf8(ROOT / "apps/agent-web/src/control-ui-projection.ts")
    check("projection-live-envelope", 'eventType === "model.text_delta"' in projection and "data.delta" in projection)
    check("projection-unknown", 'kind: "unknown"' in projection)
    check("projection-proxy-safe-clone", "function cloneProjectionValue(value: unknown): unknown" in projection and "structuredClone" not in projection)
    client = read_utf8(ROOT / "apps/agent-web/src/api/local-protocol-client.ts")
    check("client-gap-no-advance", "RESYNC_REQUIRED" in client and "const expected = this.cursor + 1" in client and "this.cursor = frame.sequence" in client)
    notice_window = read_utf8(ROOT / "services/agent-host/src/transport/notice-window.ts")
    check("server-replay-base-cursor", "cursor," in notice_window and "resyncRequired: false" in notice_window and "cursor: this.#cursor" not in notice_window)

    operations = read_utf8(ROOT / "services/agent-host/src/transport/operation-registry.ts")
    for operation in ("ui.snapshot", "workspace.list", "artifact.list", "artifact.get"):
        check(f"protocol-operation:{operation}", operation in operations)

    control_server = read_utf8(ROOT / "services/agent-host/src/control-server.ts")
    for token in ("/ui/bootstrap", r"^\/ui\/artifacts\/", "content-security-policy", "x-forwarded-host", "no-store"):
        check(f"host-ui-boundary:{token}", token in control_server)
    check("host-ui-no-direct-sqlite", "node:sqlite" not in browser_app)
    check("host-ui-no-private-path", "canonicalRoot" not in browser_app and "storagePath" not in browser_app)

    issue_registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for issue in range(1, 53):
        check(f"issue-registry:OR-ISSUE-{issue:03d}", f"OR-ISSUE-{issue:03d}" in issue_registry)
    for issue_filename in (
        "STEP011_LIVE_PROGRESS_ENVELOPE_VOCABULARY_DRIFT.md",
        "STEP011_NOTICE_GAP_CURSOR_ADVANCE.md",
        "STEP011R3_VUE_RUNTIME_COMPILER_CSP_MISMATCH.md",
        "STEP011R3_IMPLICIT_FAVICON_HTTP_FAILURE.md",
        "STEP011R3_APPROVAL_DEEP_LINK_REACTIVITY.md",
        "STEP011R4_APPROVAL_TTL_PROCESS_TIMEOUT_COUPLING.md",
        "STEP011R5_VUE_REACTIVE_PROXY_STRUCTURED_CLONE_FAILURE.md",
    ):
        detail = read_utf8(ROOT / "reference/validation" / issue_filename)
        check(
            f"issue-detail:{issue_filename}",
            all(heading in detail for heading in (
                "## Exact symptom", "## Code-confirmed root cause", "## Impact", "## Fix",
                "## Detailed evidence", "## Recurrence-prevention gate",
            )),
        )
    check("recurrence:live-progress-envelope", "### Live progress envelope coherence" in recurrence)
    check("recurrence:notice-gap-cursor", "### Notice gap and replay cursor integrity" in recurrence)
    check("recurrence:real-browser", "### Packaged browser runtime and real vertical slice" in recurrence)
    check("recurrence:vue-runtime-csp", "### Vue runtime-only CSP alignment" in recurrence)
    check("recurrence:explicit-browser-assets", "### Explicit browser auxiliary assets" in recurrence)
    check("recurrence:route-hash-reactivity", "### Same-route hash reactivity" in recurrence)
    check("recurrence:approval-process-timeout-separation", "### Approval TTL / process timeout separation" in recurrence)
    check("recurrence:vue-proxy-projection-boundary", "### Vue reactive Proxy / projection serialization boundary" in recurrence)

    plan = read_utf8(ROOT / "docs/plans/STEP011_CONTROL_UI_VERTICAL_SLICE.md")
    for heading in (
        "## 목적", "## 기준선", "## Reference Evidence", "## OpenClaw 문제 분석", "## 구현 범위",
        "## 공개 계약", "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 반복 방지 기록",
        "## 패키징 산출물", "## 제외", "## 완료 선언",
    ):
        check(f"plan-heading:{heading}", heading in plan)

    # Historical feature acceptance must not own mutable root baseline/next-cut wording.
    # The current release acceptance owns those documents; STEP011 only verifies that
    # current release identity is coherent and that STEP011 remains retained history.
    baseline_files = ["README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"]
    stale_step011_current_claims = (
        "current_candidate=STEP011_CONTROL_UI_VERTICAL_SLICE",
        "official_accepted_baseline=STEP011_CONTROL_UI_VERTICAL_SLICE",
        "STEP011_CONTROL_UI_VERTICAL_SLICE is the current candidate",
    )
    for filename in baseline_files:
        text = read_utf8(ROOT / filename)
        check(f"baseline-current-release-step:{filename}", RELEASE_STEP in text)
        check(f"baseline-current-release-version:{filename}", VERSION in text or filename == "ROADMAP.md")
        check(f"baseline-step011-history:{filename}", "STEP011R8" in text and "198/198" in text)
        check(
            f"baseline-step011-current-claim-zero:{filename}",
            not any(pattern in text for pattern in stale_step011_current_claims),
        )

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    windows = (ROOT / "scripts/sh_run_step011_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in windows and b"\n" not in windows.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in windows)
    check("posix-launcher", (ROOT / "scripts/sh_run_step011_acceptance.sh").is_file())

    vendor_temp = Path(tempfile.mkdtemp(prefix="openrill-step011-vue-"))
    vendor_root = vendor_temp / "vendor"
    archive_output = vendor_temp / "vue-3.5.40.tgz"
    archive_input = os.environ.get("OPENRILL_VUE_ARCHIVE")
    vendor_command = ["node", "scripts/vendor-vue-runtime.mjs"]
    if archive_input:
        vendor_command.extend(["--archive", archive_input])
    else:
        vendor_command.append("--download")
    vendor_command.extend(["--output-root", str(vendor_root), "--archive-output", str(archive_output)])
    vendor_ok, vendor_output = run_utf8(vendor_command, cwd=ROOT)
    check("vue-runtime-acquisition", vendor_ok and "OPENRILL_VUE_RUNTIME_VENDOR_PASS version=3.5.40" in vendor_output, "vendor_pass" if vendor_ok else "runtime_unavailable")

    runtime_env = {"OPENRILL_VUE_RUNTIME_VENDOR_DIR": str(vendor_root)}
    if vendor_ok:
        runtime = vendor_root / "vue.runtime.global.prod.js"
        license_path = vendor_root / "LICENSE.vue.txt"
        lock_path = vendor_root / "vue.runtime.lock.json"
        lock = json.loads(read_utf8(lock_path))
        check("vue-runtime-version", lock.get("version") == VUE_VERSION)
        check("vue-runtime-source", lock.get("source") == VUE_URL)
        check("vue-runtime-integrity", lock.get("packageIntegrity") == VUE_INTEGRITY)
        check("vue-runtime-bytes", runtime.stat().st_size == lock.get("fileBytes") and runtime.stat().st_size > 80_000, str(runtime.stat().st_size))
        check("vue-runtime-sha256", sha256(runtime) == lock.get("fileSha256"), sha256(runtime))
        check("vue-archive-sha256", sha256(archive_output) == lock.get("packageSha256"), sha256(archive_output))
        check("vue-license-mit", "MIT License" in read_utf8(license_path))

        verify_root = vendor_temp / "verify"
        verify_archive = vendor_temp / "verify.tgz"
        verify_ok, verify_output = run_utf8(
            ["node", "scripts/vendor-vue-runtime.mjs", "--archive", str(archive_output), "--output-root", str(verify_root), "--archive-output", str(verify_archive)],
            cwd=ROOT,
        )
        check("vue-runtime-reextract", verify_ok, "reextract_pass" if verify_ok else verify_output[-12000:])
        check("vue-runtime-byte-identical", verify_ok and (verify_root / "vue.runtime.global.prod.js").read_bytes() == runtime.read_bytes())
        check("vue-license-byte-identical", verify_ok and (verify_root / "LICENSE.vue.txt").read_bytes() == license_path.read_bytes())
    else:
        for name in (
            "vue-runtime-version", "vue-runtime-source", "vue-runtime-integrity", "vue-runtime-bytes",
            "vue-runtime-sha256", "vue-archive-sha256", "vue-license-mit", "vue-runtime-reextract",
            "vue-runtime-byte-identical", "vue-license-byte-identical",
        ):
            check(name, False, "runtime_unavailable")

    suite_ok, suite_output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT, env=runtime_env if vendor_ok else None)
    tests_match = re.search(r"# tests (\d+)(?:\r?\n)", suite_output)
    pass_match = re.search(r"# pass (\d+)(?:\r?\n)", suite_output)
    current_unit_files = len(list((ROOT / "tests/unit").glob("*.test.mjs")))
    suite_contract_ok = bool(
        suite_ok
        and tests_match
        and pass_match
        and int(tests_match.group(1)) >= 176
        and tests_match.group(1) == pass_match.group(1)
        and re.search(r"# fail 0(?:\r?\n)", suite_output)
        and re.search(r"# skipped 0(?:\r?\n)", suite_output)
        and f"OPENRILL_STEP001_SUITE_PASS unit_files={current_unit_files} reporter=TAP concurrency=1" in suite_output
        and "OPENRILL_ARCHITECTURE_PASS" in suite_output
        and "OPENRILL_PACKAGE_EXPORT_PASS" in suite_output
    )
    check("build-unit-architecture-exports", suite_contract_ok, "suite_pass" if suite_contract_ok else extract_tap_failure(suite_output))

    live_ok = False
    live_output = "runtime_unavailable"
    if vendor_ok and suite_contract_ok:
        live_ok, live_output = run_utf8(["node", "scripts/run-step011-live.mjs"], cwd=ROOT, env=runtime_env)
    live_marker = f"OPENRILL_STEP011_LIVE_PASS schema={SCHEMA} framework=VUE_3 ui=VERTICAL_SLICE approval=ALLOW_ONCE artifact=OPENED reconnect=CURSOR_RESUME mobile=PASS modelCalls=3 toolCalls=2 secret=POINT_OF_USE"
    check("step011-real-chromium-live", live_ok and live_marker in live_output, "live_pass" if live_ok and live_marker in live_output else extract_browser_failure(live_output))

    regression_ok, regression_output = run_utf8(["node", "scripts/run-step010-live.mjs"], cwd=ROOT)
    check("step010-skill-live-regression", regression_ok and "OPENRILL_STEP010_LIVE_PASS" in regression_output, "live_pass" if regression_ok else regression_output[-12000:])

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [
        path for path in ROOT.rglob("*") if path.is_file()
        and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})
    ]
    check("protected-payload-zero", not protected)
    report_text = read_utf8(REPORT) if REPORT.exists() else ""
    check("secret-value-not-reported", "Bearer " not in report_text and re.search(r"(?i)(api[_-]?key|secret)\s*[:=]\s*\S+", report_text) is None)

    shutil.rmtree(vendor_temp, ignore_errors=True)
    clean()
    generated_paths = [
        path for path in ROOT.rglob("*")
        if "node_modules" not in path.relative_to(ROOT).parts
        and any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)
    ]
    check("generated-cleanup", not generated_paths, json.dumps([str(path.relative_to(ROOT)) for path in generated_paths[:20]]))

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, outcome, detail in checks]
    lines.append(f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} framework=VUE_3 browser=CHROMIUM")
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
