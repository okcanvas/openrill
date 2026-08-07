from __future__ import annotations

import ast
import hashlib
import json
import re
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP010A_ACCEPTANCE_REPORT.txt"
VERSION = "0.10.3-step010ar1"
STEP = "STEP010A_CONTROL_UI_FRAMEWORK_SELECTION"
PACKAGE_STEP = "STEP010AR1_WINDOWS_UNIT_SUITE_DETERMINISM_AND_FAILURE_EVIDENCE"
SCHEMA = 7
FIXTURE_ID = "openrill-control-ui-step010a-v1"
FIXTURE_SHA256 = "45ca6118a68277140ef84c9f0ccaa6fd8fd978e38ac5565741fa46066650cd57"
MATRIX_SHA256 = "0fe6066ad50a6b69513157b7a1cc89be083f12c6cc3fdab9710d847c3d7d5579"


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


def canonical(value: object) -> str:
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False, separators=(",", ":")) + ":" + canonical(value[key])
            for key in sorted(value)
        ) + "}"
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def extract_tap_failure(output: str) -> str:
    """Preserve the first TAP failure block regardless of its position in the suite output."""
    lines = output.splitlines()
    failure_index = next((index for index, line in enumerate(lines) if line.startswith("not ok ")), None)
    if failure_index is None:
        return output[-12000:]
    start = failure_index
    if failure_index > 0 and lines[failure_index - 1].startswith("# Subtest:"):
        start = failure_index - 1
    end = len(lines)
    for index in range(failure_index + 1, len(lines)):
        if lines[index].startswith("# Subtest:"):
            end = index
            break
    block = lines[start:end]
    summary = [
        line
        for line in lines
        if line.startswith(("1..", "# tests ", "# pass ", "# fail ", "# cancelled ", "# skipped ", "# todo ", "# duration_ms "))
    ][-8:]
    return "\n".join(["OPENRILL_TAP_FAILURE_BEGIN", *block, "OPENRILL_TAP_FAILURE_END", *summary])[-20000:]


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check("step010a-script", scripts.get("acceptance:step010a") == "python scripts/run_step010a_acceptance.py")
    check(
        "step010a-package-script",
        scripts.get("package:step010a")
        == "python scripts/package_step010a.py --output ../openrill-step010a-control-ui-framework-selection-v1.zip",
    )

    required = [
        "config/ui-framework.json",
        "apps/agent-web/src/control-ui-projection.ts",
        "apps/agent-web/spikes/shared/fixture.json",
        "apps/agent-web/spikes/shared/workload.mjs",
        "apps/agent-web/spikes/shared/dom-contract.mjs",
        "apps/agent-web/spikes/shared/styles.css",
        "apps/agent-web/spikes/frameworks.lock.json",
        "apps/agent-web/spikes/decision-matrix.json",
        "apps/agent-web/spikes/vue/index.html",
        "apps/agent-web/spikes/vue/app.mjs",
        "apps/agent-web/spikes/lit/index.html",
        "apps/agent-web/spikes/lit/app.mjs",
        "tests/unit/control-ui-framework-step010a.test.mjs",
        "scripts/run-step010a-spikes.mjs",
        "scripts/run_step010a_acceptance.py",
        "scripts/sh_run_step010a_acceptance.cmd",
        "scripts/sh_run_step010a_acceptance.sh",
        "scripts/package_step010a.py",
        "docs/ui/FRAMEWORK_EVALUATION.md",
        "docs/adrs/ADR-0027-CONTROL_UI_FRAMEWORK_VUE3.md",
        "docs/plans/STEP010A_CONTROL_UI_FRAMEWORK_SELECTION.md",
        "reference/openclaw/CONTROL_UI_FRAMEWORK_SELECTION.md",
        "reference/validation/STEP010A_UI_FRAMEWORK_ARCHITECTURE_DECISION_DRIFT.md",
        "reference/validation/STEP010A_SCHEMA_OWNER_FILE_ASSERTION.md",
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
        check(f"package-manifest-{label}-step", f'STEP = "{PACKAGE_STEP}"' in source)
        check(f"package-manifest-{label}-version", f'VERSION = "{VERSION}"' in source)
    check(
        "package-manifest-generated-identity",
        generated.get("step") == PACKAGE_STEP and generated.get("version") == VERSION,
        f"{generated.get('step')} {generated.get('version')}",
    )

    state_index = read_utf8(ROOT / "packages/state/src/index.ts")
    state_migrations = read_utf8(ROOT / "packages/state/src/migrations.ts")
    check("schema-owner-version-seven", "OPENRILL_STATE_SCHEMA_VERSION = 7 as const" in state_migrations)
    check("schema-public-export", "OPENRILL_STATE_SCHEMA_VERSION" in state_index)

    framework = json.loads(read_utf8(ROOT / "config/ui-framework.json"))
    check("framework-config-schema", framework.get("schemaVersion") == 1)
    check("framework-config-selection", framework.get("selection") == "VUE_3")
    check("framework-config-decision-step", framework.get("decisionStep") == STEP)
    check("framework-config-runtime-step", framework.get("runtimeIntroductionStep") == "STEP011_CONTROL_UI_VERTICAL_SLICE")
    check("framework-config-production-absent", framework.get("productionRuntimeDependencyPresent") is False)
    check("framework-config-adr", framework.get("adr") == "docs/adrs/ADR-0027-CONTROL_UI_FRAMEWORK_VUE3.md")

    web_index = read_utf8(ROOT / "apps/agent-web/src/index.ts")
    check("web-contract-version", f'PACKAGE_VERSION = "{VERSION}"' in web_index)
    check("web-contract-framework", 'UI_FRAMEWORK_SELECTION = "VUE_3"' in web_index)
    check("web-contract-decision-step", 'UI_FRAMEWORK_DECISION_STEP = "STEP010A"' in web_index)
    check("web-contract-runtime-step", 'UI_RUNTIME_INTRODUCTION_STEP = "STEP011"' in web_index)
    for export_name in (
        "createControlUiProjection",
        "applyControlUiNotice",
        "applyControlUiSnapshot",
        "getControlUiReconnectPlan",
        "moveControlUiCardSelection",
    ):
        check(f"web-projection-export:{export_name}", export_name in web_index)

    projection = read_utf8(ROOT / "apps/agent-web/src/control-ui-projection.ts")
    for token in (
        '"APPLIED"',
        '"DUPLICATE"',
        '"GAP"',
        '"SNAPSHOT_RESYNC"',
        '"CURSOR_RESUME"',
        '"unknown"',
        "structuredClone",
    ):
        check(f"projection-contract:{token}", token in projection)

    lock = json.loads(read_utf8(ROOT / "apps/agent-web/spikes/frameworks.lock.json"))
    check("finalists-count", set(lock.get("finalists", {})) == {"vue", "lit"})
    check("vue-version", lock["finalists"]["vue"].get("version") == "3.5.40")
    check("lit-version", lock["finalists"]["lit"].get("version") == "3.3.3")
    check("spike-runtime-external", lock.get("runtimePackaging") == "EXTERNAL_SPIKE_ONLY")
    check("production-runtime-step011", lock.get("productionDependencyIntroduction") == "STEP011")
    check("vue-production-esm", "vue.runtime.esm-browser.prod.js" in lock["finalists"]["vue"].get("module", ""))
    check("lit-core-esm", "lit-core.min.js" in lock["finalists"]["lit"].get("module", ""))

    fixture = json.loads(read_utf8(ROOT / "apps/agent-web/spikes/shared/fixture.json"))
    fixture_hash = hashlib.sha256(canonical(fixture).encode("utf-8")).hexdigest()
    check("fixture-id", fixture.get("fixtureId") == FIXTURE_ID)
    check("fixture-hash", fixture_hash == FIXTURE_SHA256, fixture_hash)
    check("fixture-notices", len(fixture.get("notices", [])) == 9, str(len(fixture.get("notices", []))))
    check("fixture-final-cursor", fixture.get("expected", {}).get("finalCursor") == 109)
    check("fixture-card-kinds", fixture.get("expected", {}).get("cardKinds") == ["text", "tool", "approval", "artifact", "unknown"])

    matrix = json.loads(read_utf8(ROOT / "apps/agent-web/spikes/decision-matrix.json"))
    signature = matrix.pop("matrixSha256", None)
    calculated_matrix = hashlib.sha256(canonical(matrix).encode("utf-8")).hexdigest()
    check("matrix-signature", signature == MATRIX_SHA256 == calculated_matrix, calculated_matrix)
    check("matrix-decision", matrix.get("decision") == "VUE_3")
    check("matrix-weight-total", sum(matrix.get("weights", {}).values()) == 100)
    vue_total = sum(matrix["weights"][key] * matrix["scores"]["vue"][key] for key in matrix["weights"]) / 100
    lit_total = sum(matrix["weights"][key] * matrix["scores"]["lit"][key] for key in matrix["weights"]) / 100
    check("matrix-vue-score", vue_total == 4.7, str(vue_total))
    check("matrix-lit-score", lit_total == 4.15, str(lit_total))
    check("matrix-selects-higher", vue_total > lit_total)

    vue_source = read_utf8(ROOT / "apps/agent-web/spikes/vue/app.mjs")
    lit_source = read_utf8(ROOT / "apps/agent-web/spikes/lit/app.mjs")
    shared_source = read_utf8(ROOT / "apps/agent-web/spikes/shared/workload.mjs")
    dom_source = read_utf8(ROOT / "apps/agent-web/spikes/shared/dom-contract.mjs")
    check("vue-api:createApp", "createApp" in vue_source)
    check("vue-api:ref", "ref" in vue_source)
    check("vue-api:nextTick", "nextTick" in vue_source)
    check("lit-api:LitElement", "LitElement" in lit_source)
    check("lit-api:html", "html" in lit_source)
    check("lit-api:customElements", "customElements.define" in lit_source)
    for candidate, source in (("vue", vue_source), ("lit", lit_source)):
        check(f"candidate-shared-workload:{candidate}", "../shared/workload.mjs" in source)
        check(f"candidate-shared-dom:{candidate}", "../shared/dom-contract.mjs" in source)
        check(f"candidate-approval:{candidate}", "resolveApprovalLocally" in source)
        check(f"candidate-keyboard:{candidate}", "moveCardSelection" in source)
        check(f"candidate-a11y-banner:{candidate}", "OpenRill Control UI" in source)
        check(f"candidate-a11y-log:{candidate}", "Conversation transcript" in source)
    for token in (
        "createProjection",
        "applyNotice",
        "reconnectPlan",
        "createLongTranscript",
        "virtualWindow",
        "moveCardSelection",
        "resolveApprovalLocally",
    ):
        check(f"shared-workload:{token}", f"function {token}" in shared_source)
    for token in ("banner", "main", "log", "status", "assertAccessibleDescriptor"):
        check(f"shared-dom:{token}", token in dom_source)

    production_runtime_deps: list[str] = []
    runtime_names = {"vue", "lit", "react", "react-dom", "svelte", "solid-js", "preact", "@angular/core"}
    for path in package_manifests:
        data = json.loads(read_utf8(path))
        for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            for dep in data.get(key, {}):
                if dep in runtime_names:
                    production_runtime_deps.append(f"{path.relative_to(ROOT)}:{key}:{dep}")
    check("production-framework-dependencies-zero", not production_runtime_deps, json.dumps(production_runtime_deps))
    lock_text = read_utf8(ROOT / "pnpm-lock.yaml")
    check("lock-framework-importers-zero", not any(re.search(rf"^\s{{6}}{re.escape(name)}:", lock_text, re.MULTILINE) for name in runtime_names))

    protocol_client = read_utf8(ROOT / "apps/agent-web/src/api/local-protocol-client.ts")
    check("protocol-client-framework-import-zero", re.search(r'(?:from|import\()\s*["\'](?:vue|lit|react|svelte|solid-js)', protocol_client) is None)
    architecture = read_utf8(ROOT / "scripts/check_architecture.py")
    check("architecture-canonical-config", 'config/ui-framework.json' in architecture)
    check("architecture-old-literal-zero", "ui_framework=DEFERRED" not in architecture)
    check("architecture-selection-marker", "UI_FRAMEWORK['selection']" in architecture)

    tests = read_utf8(ROOT / "tests/unit/control-ui-framework-step010a.test.mjs")
    for title in (
        "shared fixture has stable identity and hash",
        "stream tool approval artifact and unknown event project in sequence",
        "duplicates are ignored and sequence gaps require snapshot resync",
        "ten-thousand-row transcript uses a bounded virtual window",
        "keyboard navigation and accessibility descriptor are deterministic",
        "Vue and Lit finalists consume the same fixture and DOM contracts",
        "decision matrix is hash-bound and selects Vue 3",
        "spike projection matches the exported framework-neutral package contract",
        "framework code does not leak into Local Protocol client",
    ):
        check(f"unit-fixture:{title}", f'test("{title}"' in tests)

    evaluation = read_utf8(ROOT / "docs/ui/FRAMEWORK_EVALUATION.md")
    for heading in (
        "## Decision summary",
        "## Repository workload",
        "## Candidate reduction",
        "## Exact finalist versions",
        "## Measured spike results",
        "## Decision matrix",
        "## Why Vue 3 was selected",
        "## Why Lit was not selected",
        "## Reproducibility",
    ):
        check(f"evaluation-heading:{heading}", heading in evaluation)
    for token in (FIXTURE_SHA256, MATRIX_SHA256, "Vue=4.70", "Lit=4.15", "STEP011"):
        check(f"evaluation-contract:{token}", token in evaluation)
    check("evaluation-no-browser-overclaim", "does not claim an offline framework-engine execution" in evaluation)

    adr = read_utf8(ROOT / "docs/adrs/ADR-0027-CONTROL_UI_FRAMEWORK_VUE3.md")
    check("adr-status-accepted", "- Status: Accepted" in adr)
    check("adr-select-vue", "Select **Vue 3**" in adr)
    check("adr-production-step011", "Do not introduce the production Vue dependency in STEP010A" in adr)
    check("adr-rejected-lit", "### Lit 3" in adr)
    old_adr = read_utf8(ROOT / "docs/adrs/ADR-0014-DEFER_CONTROL_UI_FRAMEWORK_SELECTION.md")
    check("defer-adr-superseded", "- Status: Superseded" in old_adr and "ADR-0027" in old_adr)

    evidence = json.loads(read_utf8(ROOT / "reference/openclaw/EVIDENCE_INDEX.json"))
    evidence_report = json.loads(read_utf8(ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json"))
    check("evidence-count", len(evidence) == 122, str(len(evidence)))
    check("evidence-report", evidence_report.get("allVerified") is True and evidence_report.get("verifiedCount") == 122, str(evidence_report.get("verifiedCount")))
    for evidence_id in ("OC-UI-001", "OC-UI-002", "OC-UI-003", "OC-UI-004", "OC-UI-005", "OC-UI-006"):
        check(f"evidence:{evidence_id}", any(item.get("id") == evidence_id for item in evidence))

    issue_registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(1, 37):
        check(f"issue-registry:OR-ISSUE-{number:03d}", f"OR-ISSUE-{number:03d}" in issue_registry)
    for issue_filename in (
        "STEP010A_UI_FRAMEWORK_ARCHITECTURE_DECISION_DRIFT.md",
        "STEP010A_SCHEMA_OWNER_FILE_ASSERTION.md",
        "STEP010A_WINDOWS_UNIT_FAILURE_EVIDENCE_TRUNCATION.md",
        "STEP010A_UNIT_FILE_CONCURRENCY_UNDECLARED.md",
    ):
        issue_detail = read_utf8(ROOT / "reference/validation" / issue_filename)
        check(
            f"issue-detail:{issue_filename}",
            all(heading in issue_detail for heading in (
                "## Exact symptom",
                "## Code-confirmed root cause",
                "## Impact",
                "## Fix",
                "## Detailed evidence",
                "## Recurrence-prevention gate",
            )),
        )
    check("recurrence:ui-framework-coherence", "### UI framework decision coherence" in recurrence)
    check("recurrence:contract-owner-files", "### Contract owner-file assertions" in recurrence)
    check("recurrence:tap-failure-evidence", "### Position-independent TAP failure evidence" in recurrence)
    check("recurrence:unit-suite-concurrency", "### Deterministic unit-file concurrency" in recurrence)

    plan = read_utf8(ROOT / "docs/plans/STEP010A_CONTROL_UI_FRAMEWORK_SELECTION.md")
    for heading in (
        "## 목적",
        "## 기준선",
        "## Reference Evidence",
        "## 후보 축소",
        "## 구현 범위",
        "## 공통 fixture",
        "## 구현 상세",
        "## 공개 계약",
        "## 상태 전이",
        "## 측정 의미",
        "## 실패 및 복구",
        "## Acceptance",
        "## 반복 방지 기록",
        "## 패키징 산출물",
        "## 제외",
        "## 완료 선언",
    ):
        check(f"plan-heading:{heading}", heading in plan)

    baseline_files = ["README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"]
    for filename in baseline_files:
        text = read_utf8(ROOT / filename)
        check(f"baseline-step:{filename}", "STEP010AR1" in text and "STEP010A" in text)
        check(f"baseline-version:{filename}", VERSION in text or filename == "ROADMAP.md")
        check(f"baseline-previous-windows:{filename}", "STEP010R1" in text and "116/116" in text)
        check(f"baseline-step010a-failure:{filename}", "251/252" in text and "FAILED" in text)
        check(f"baseline-framework:{filename}", "VUE_3" in text)
        check(f"baseline-next:{filename}", "STEP011" in text)
    active_docs = "\n".join(read_utf8(ROOT / filename) for filename in baseline_files)
    check("step010ar1-windows-pending", "STEP010AR1 Windows live" in active_docs and "PENDING" in active_docs)

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    windows = (ROOT / "scripts/sh_run_step010a_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in windows and b"\n" not in windows.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in windows)
    check("posix-launcher", (ROOT / "scripts/sh_run_step010a_acceptance.sh").is_file())

    suite_runner = read_utf8(ROOT / "scripts/run-step001-suite.mjs")
    check("unit-suite-concurrency-one", 'UNIT_TEST_CONCURRENCY = 1' in suite_runner and '--test-concurrency=${UNIT_TEST_CONCURRENCY}' in suite_runner)
    check("unit-suite-concurrency-marker", 'reporter=TAP concurrency=${UNIT_TEST_CONCURRENCY}' in suite_runner)
    synthetic_tap = "# Subtest: early failure\nnot ok 1 - early failure\n  ---\n  error: expected true\n  ...\n" + ("x" * 12000) + "\n1..2\n# tests 2\n# pass 1\n# fail 1\n# skipped 0\n"
    synthetic_detail = extract_tap_failure(synthetic_tap)
    check("tap-failure-position-independent", "not ok 1 - early failure" in synthetic_detail and "# fail 1" in synthetic_detail)

    suite_ok, suite_output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    suite_contract_ok = (
        suite_ok
        and "OPENRILL_STEP001_SUITE_PASS unit_files=20 reporter=TAP concurrency=1" in suite_output
        and "# tests 117" in suite_output
        and "# pass 117" in suite_output
        and "# fail 0" in suite_output
        and "# skipped 0" in suite_output
        and "ui_framework=VUE_3" in suite_output
    )
    check("build-unit-architecture-exports", suite_contract_ok, "suite_pass" if suite_contract_ok else extract_tap_failure(suite_output))

    spike_ok, spike_output = run_utf8(["node", "scripts/run-step010a-spikes.mjs"], cwd=ROOT)
    spike_marker = (
        f"OPENRILL_STEP010A_SPIKE_PASS fixture={FIXTURE_ID} sha256={FIXTURE_SHA256} "
        "finalists=2 selected=VUE_3 transcript=10000 rendered<=30"
    )
    spike_contract_ok = spike_ok and spike_marker in spike_output
    check("step010a-spike-runner", spike_contract_ok, "spike_pass" if spike_contract_ok else spike_output[-8000:])
    spike_report_path = ROOT / ".artifacts/step010a/report.json"
    spike_report = json.loads(read_utf8(spike_report_path)) if spike_report_path.is_file() else {}
    check("spike-report-version", spike_report.get("version") == VERSION)
    check("spike-report-fixture", spike_report.get("fixture", {}).get("sha256") == FIXTURE_SHA256)
    check("spike-report-finalists", len(spike_report.get("candidates", [])) == 2)
    check("spike-report-selection", spike_report.get("decision", {}).get("selected") == "VUE_3")
    check("spike-report-virtualization", spike_report.get("scenarios", {}).get("maximumRenderedRows") == 30)
    check("spike-report-accessibility", spike_report.get("scenarios", {}).get("accessibility") == "PASS")
    check("spike-report-isolation", spike_report.get("scenarios", {}).get("frameworkIsolation") == "PASS")

    live_ok, live_output = run_utf8(["node", "scripts/run-step010-live.mjs"], cwd=ROOT)
    live_contract_ok = live_ok and "OPENRILL_STEP010_LIVE_PASS" in live_output and "schema=7" in live_output
    check("step010-skill-live-regression", live_contract_ok, "live_pass" if live_contract_ok else live_output[-8000:])

    credential_assignment = re.compile(r'(?i)(api[_-]?(?:key|secret)|process[_-]?secret)\s*=\s*["\'][^"\']+["\']')
    credential_hits: list[str] = []
    text_suffixes = {".ts", ".mjs", ".js", ".py", ".md", ".json", ".yaml", ".yml", ".txt", ".html", ".css"}
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.name == "PACKAGE_MANIFEST.json" or path.suffix.lower() not in text_suffixes:
            continue
        if any(part in {"node_modules", "dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts):
            continue
        if credential_assignment.search(read_utf8(path)):
            credential_hits.append(path.relative_to(ROOT).as_posix())
    check("credential-shaped-source-literal-zero", not credential_hits, json.dumps(credential_hits))

    check(
        "database-files-zero",
        not any(ROOT.rglob("*.db"))
        and not any(ROOT.rglob("*.db-wal"))
        and not any(ROOT.rglob("*.db-shm")),
    )
    check(
        "runtime-files-zero",
        not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")),
    )
    protected = [
        path
        for path in ROOT.rglob("*")
        if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})
    ]
    check("protected-payload-zero", not protected)
    report_text = read_utf8(REPORT) if REPORT.exists() else ""
    check(
        "secret-value-not-reported",
        "Bearer " not in report_text and re.search(r"(?i)(api[_-]?key|secret)\s*[:=]\s*\S+", report_text) is None,
    )

    clean()
    generated_paths = [
        path
        for path in ROOT.rglob("*")
        if "node_modules" not in path.relative_to(ROOT).parts
        and any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)
    ]
    check("generated-cleanup", not generated_paths, json.dumps([str(path.relative_to(ROOT)) for path in generated_paths[:20]]))

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, outcome, detail in checks]
    lines.append(f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} framework=VUE_3 finalists=2 fixture=SHARED")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
