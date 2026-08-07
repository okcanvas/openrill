from __future__ import annotations

import ast
import json
import re
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP009_ACCEPTANCE_REPORT.txt"
VERSION = "0.9.0-step009"
STEP = "STEP009_PROCESS_TOOL_AND_APPROVAL_RESUME"
SCHEMA = 6


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
    for pattern in ("apps/*/package.json", "services/*/package.json", "packages/*/package.json", "connectors/*/package.json", "skills/*/package.json"):
        result.extend(ROOT.glob(pattern))
    return sorted(result)


def implicit_text_io() -> list[str]:
    failures: list[str] = []
    for path in sorted((ROOT / "scripts").glob("*.py")):
        tree = ast.parse(read_utf8(path), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            if node.func.attr not in {"read_text", "write_text"}:
                continue
            if not any(keyword.arg == "encoding" for keyword in node.keywords):
                failures.append(f"{path.name}:{node.lineno}:{node.func.attr}")
    return failures


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check("step009-script", package.get("scripts", {}).get("acceptance:step009") == "python scripts/run_step009_acceptance.py")
    check("step009-package-script", "package_step009.py" in package.get("scripts", {}).get("package:step009", ""))

    required = [
        "packages/approval/src/index.ts",
        "packages/tools-process/src/index.ts",
        "packages/state/migrations/006_process_approval_resume.sql",
        "packages/state/src/approval-process-repository.ts",
        "packages/protocol/src/approval-operations.ts",
        "packages/agent-kernel/src/kernel.ts",
        "services/agent-host/src/lifecycle.ts",
        "services/agent-host/src/transport/operation-registry.ts",
        "tests/unit/process-approval-step009.test.mjs",
        "scripts/run-step009-live.mjs",
        "scripts/run_step009_acceptance.py",
        "scripts/sh_run_step009_acceptance.cmd",
        "scripts/sh_run_step009_acceptance.sh",
        "scripts/package_step009.py",
        "docs/contracts/PROCESS_TOOL.md",
        "docs/contracts/APPROVALS.md",
        "docs/adrs/ADR-0025-DURABLE_PROCESS_APPROVAL_RESUME.md",
        "docs/plans/STEP009_PROCESS_TOOL_AND_APPROVAL_RESUME.md",
        "reference/openclaw/PROCESS_TOOL_AND_APPROVAL_RESUME.md",
        "docs/governance/ENGINEERING_ISSUE_REGISTRY.md",
        "docs/testing/RECURRENCE_PREVENTION_GATES.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    package_manifests = manifests()
    versions = {json.loads(read_utf8(path)).get("version") for path in package_manifests}
    names = {json.loads(read_utf8(path)).get("name") for path in package_manifests}
    check("manifest-count", len(package_manifests) == 26, str(len(package_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))
    check("approval-package", "@openrill/approval" in names)
    check("tools-process-package", "@openrill/tools-process" in names)
    check("no-openclaw-dependency", not any("openclaw" in json.dumps(json.loads(read_utf8(path)).get("dependencies", {})).lower() for path in package_manifests))

    manifest_generator = read_utf8(ROOT / "scripts/generate_package_manifest.py")
    manifest_verifier = read_utf8(ROOT / "scripts/verify_package_manifest.py")
    generated_manifest = json.loads(read_utf8(ROOT / "PACKAGE_MANIFEST.json"))
    for label, source in (("generator", manifest_generator), ("verifier", manifest_verifier)):
        check(f"package-manifest-{label}-step", f'STEP = "{STEP}"' in source)
        check(f"package-manifest-{label}-version", f'VERSION = "{VERSION}"' in source)
    check("package-manifest-generated-identity", generated_manifest.get("step") == STEP and generated_manifest.get("version") == VERSION, f'{generated_manifest.get("step")} {generated_manifest.get("version")}')

    lock = read_utf8(ROOT / "pnpm-lock.yaml")
    agent_kernel_lock = lock.split("  packages/agent-kernel:", 1)[1].split("  packages/approval:", 1)[0]
    process_lock = lock.split("  packages/tools-process:", 1)[1].split("  packages/workspace:", 1)[0]
    host_lock = lock.split("  services/agent-host:", 1)[1].split("  skills/builtin:", 1)[0]
    check("lock-agent-kernel-approval", "'@openrill/approval':" in agent_kernel_lock)
    check("lock-process-approval", "'@openrill/approval':" in process_lock)
    check("lock-process-config", "'@openrill/config':" in process_lock)
    check("lock-process-state", "'@openrill/state':" in process_lock)
    check("lock-host-tools-process", "'@openrill/tools-process':" in host_lock)

    migrations = read_utf8(ROOT / "packages/state/src/migrations.ts")
    migration = read_utf8(ROOT / "packages/state/migrations/006_process_approval_resume.sql")
    check("schema-version-six", "OPENRILL_STATE_SCHEMA_VERSION = 6" in migrations)
    for token in (
        "CREATE TABLE tool_calls", "UNIQUE (run_id, tool_call_id)", "CREATE TABLE approval_requests",
        "version INTEGER NOT NULL DEFAULT 1", "CREATE TABLE approval_conversation_grants",
        "CREATE TABLE process_records", "idx_process_records_active",
        "FOREIGN KEY (attempt_id) REFERENCES run_attempts", "FOREIGN KEY (workspace_id) REFERENCES workspace_registrations",
    ):
        check(f"migration-contract:{token}", token in migration)

    repository = read_utf8(ROOT / "packages/state/src/approval-process-repository.ts")
    for token in (
        "class StateApprovalProcessRepository", "insertToolCall", "getToolCall", "insertApproval",
        "resolveApproval", "consumeApproval", "insertConversationGrant", "insertProcess",
        "listProcesses", "markActiveProcessesOrphaned",
    ):
        check(f"repository:{token}", token in repository)

    approval = read_utf8(ROOT / "packages/approval/src/index.ts")
    for token in (
        'ExecutionPolicyDecision = "DENY" | "PROMPT" | "ALLOW"', "matchExecutionPolicy",
        "approvalSha256", "ToolApprovalRequiredError", "authorizeOrRequest", "bindingDigest",
        "expectedVersion", "allow_for_conversation", "consumeApproval", "recordApprovalTerminalResult",
    ):
        check(f"approval-contract:{token}", token in approval)

    process = read_utf8(ROOT / "packages/tools-process/src/index.ts")
    exact_tools = ["process.run", "process.list", "process.tail", "process.cancel"]
    for tool in exact_tools:
        check(f"tool:{tool}", f'"{tool}"' in process)
    check("tool-count-source", len(re.findall(r'registry\.register\(tool\("process\.(?:run|list|tail|cancel)"', process)) == 4)
    for token in (
        'kind: "argv"', 'kind: "shell"', "shellInvocation", "resolveSecretReference",
        "this.options.workspaces.resolve", "ToolApprovalRequiredError", "executeApproved",
        "await mkdir(this.options.rootDirectory, { recursive: true", "finished(stdoutFile)",
        "background", "recoverOrphans", 'status: current?.status === "CANCELLED" ? "CANCELLED" : "EXITED"',
    ):
        check(f"process-contract:{token}", token in process)

    runtime = read_utf8(ROOT / "packages/tool-runtime/src/index.ts")
    check("approval-interrupt-passthrough", "error instanceof ToolRuntimeError || error instanceof ToolApprovalRequiredError" in runtime)
    kernel = read_utf8(ROOT / "packages/agent-kernel/src/kernel.ts")
    for token in ("WAITING_APPROVAL", "resumeExecution", "ToolApprovalRequiredError", "waitForApproval", "approval.requested"):
        check(f"kernel-resume:{token}", token in kernel)
    conversations = read_utf8(ROOT / "packages/conversations/src/service.ts")
    for token in ("waitForApproval", "resumeExecution", "appendApprovalToolResult", "approval-result:", "resumedFromApproval"):
        check(f"conversation-resume:{token}", token in conversations)

    protocol = read_utf8(ROOT / "packages/protocol/src/approval-operations.ts")
    validation = read_utf8(ROOT / "packages/protocol/src/validation.ts")
    registry = read_utf8(ROOT / "services/agent-host/src/transport/operation-registry.ts")
    for operation in ("approval.list", "approval.get", "approval.resolve", "approval.cancel"):
        check(f"protocol-operation:{operation}", operation in registry)
    for token in ("ApprovalResolveInput", "expectedVersion", '"allow_once" | "allow_for_conversation" | "deny"'):
        check(f"protocol-contract:{token}", token in protocol)
    for token in ("validateApprovalListInput", "validateApprovalGetInput", "validateApprovalResolveInput", "validateApprovalCancelInput"):
        check(f"protocol-validation:{token}", token in validation)

    lifecycle = read_utf8(ROOT / "services/agent-host/src/lifecycle.ts")
    for token in (
        "new ApprovalService", "new ProcessManager", "registerProcessTools", "recoverOrphans",
        "approvalHooks", "executeApproved", "appendApprovalToolResult", "runCoordinator?.resume",
        "approvalExpiryTimer", "processManager?.close()",
    ):
        check(f"host-integration:{token}", token in lifecycle)
    coordinator = read_utf8(ROOT / "services/agent-host/src/run-coordinator.ts")
    check("resume-after-active", "#pendingResume" in coordinator and "public resume(runId" in coordinator)

    state_test = read_utf8(ROOT / "tests/unit/state-step005.test.mjs")
    workspace_test = read_utf8(ROOT / "tests/unit/workspace-file-tools-step008.test.mjs")
    protocol_test = read_utf8(ROOT / "tests/unit/local-protocol-step004.test.mjs")
    check("migration-sequence-derived", "Array.from({ length: OPENRILL_STATE_SCHEMA_VERSION }" in state_test)
    check("future-version-derived", "OPENRILL_STATE_SCHEMA_VERSION + 1" in state_test)
    check("workspace-schema-derived", "assert.equal(state.schemaVersion, OPENRILL_STATE_SCHEMA_VERSION)" in workspace_test)
    check("protocol-current-approval-capabilities", all(name in protocol_test for name in ("approval.cancel", "approval.get", "approval.list", "approval.resolve")))

    live_source = read_utf8(ROOT / "scripts/run-step009-live.mjs")
    check("live-secrets-runtime-generated", live_source.count("randomBytes(32)") >= 2 and re.search(r'const\s+(?:apiSecret|processSecret)\s*=\s*["\']', live_source) is None)
    check("live-preapproval-zero-process", 'SELECT count(*) count FROM process_records' in live_source and 'process started before approval' in live_source)
    check("live-websocket-approval", '"approval.resolve"' in live_source and 'decision: "allow_once"' in live_source)
    check("live-secret-sqlite-zero", "secret literal leaked into SQLite" in live_source)
    forbidden_secret_literals = (
        "step009" + "-secret-",
        "OPENRILL_STEP009_API_" + "KEY=",
        "OPENRILL_STEP009_PROCESS_" + "SECRET=",
    )
    secret_literal_hits: list[str] = []
    text_suffixes = {".ts", ".mjs", ".js", ".py", ".md", ".json", ".yaml", ".yml", ".txt"}
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.name == "PACKAGE_MANIFEST.json" or path.suffix.lower() not in text_suffixes:
            continue
        if any(part in {"node_modules", "dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts):
            continue
        text = read_utf8(path)
        for literal in forbidden_secret_literals:
            if literal in text:
                secret_literal_hits.append(f"{path.relative_to(ROOT).as_posix()}:{literal}")
    check("synthetic-secret-literal-zero", not secret_literal_hits, json.dumps(secret_literal_hits))

    evidence = json.loads(read_utf8(ROOT / "reference/openclaw/EVIDENCE_INDEX.json"))
    evidence_report = json.loads(read_utf8(ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json"))
    check("evidence-count", len(evidence) == 119, str(len(evidence)))
    check("evidence-report", evidence_report.get("allVerified") is True and evidence_report.get("verifiedCount") == 119, str(evidence_report.get("verifiedCount")))
    for evidence_id in ("OC-APPROVAL-001", "OC-APPROVAL-002", "OC-APPROVAL-003", "OC-APPROVAL-004", "OC-APPROVAL-005"):
        check(f"evidence:{evidence_id}", any(item.get("id") == evidence_id for item in evidence))

    issue_registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(1, 24):
        check(f"issue-registry:OR-ISSUE-{number:03d}", f"OR-ISSUE-{number:03d}" in issue_registry)
    issue_files = [
        "STEP009_APPROVAL_INTERRUPT_WRAPPED_AS_TOOL_FAILURE.md",
        "STEP009_PROCESS_OUTPUT_STREAM_COMPLETION_RACE.md",
        "STEP009_EXTENSION_EXPECTATION_DRIFT.md",
        "STEP009_SYNTHETIC_SECRET_LITERAL_RECURRENCE.md",
    ]
    for filename in issue_files:
        text = read_utf8(ROOT / "reference/validation" / filename)
        check(f"issue-detail:{filename}", all(heading in text for heading in ("## Exact symptom", "## Code-confirmed root cause", "## Impact", "## Fix", "## Recurrence-prevention gate")))
    for heading in (
        "### Typed control-flow interrupts", "### Process output completion",
        "### Additive schema and protocol evolution", "### Durable approval exactly-once",
        "### Synthetic secret fixtures",
    ):
        check(f"recurrence:{heading}", heading in recurrence)

    plan = read_utf8(ROOT / "docs/plans/STEP009_PROCESS_TOOL_AND_APPROVAL_RESUME.md")
    for heading in (
        "## 목적", "## 기준선", "## Reference Evidence", "## OpenClaw 문제 분석",
        "## 구현 범위", "## 공개 계약", "## 상태 전이", "## 실패 및 복구",
        "## Acceptance", "## 반복 방지 기록", "## 패키징 산출물", "## 제외", "## 완료 선언",
    ):
        check(f"plan-heading:{heading}", heading in plan)

    baseline_files = ["README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"]
    for filename in baseline_files:
        text = read_utf8(ROOT / filename)
        check(f"baseline-step:{filename}", "STEP009_PROCESS_TOOL_AND_APPROVAL_RESUME" in text or "STEP009" in text)
        check(f"baseline-version:{filename}", VERSION in text or filename == "ROADMAP.md")
        check(f"baseline-previous-windows:{filename}", "STEP008" in text and ("ACCEPTED" in text or "accepted" in text))
        check(f"baseline-next:{filename}", "STEP010" in text or filename == "VALIDATION.md")
    active_docs = "\n".join(read_utf8(ROOT / filename) for filename in baseline_files)
    check("stale-step008-pending-zero", "STEP008 Windows live: `PENDING`" not in active_docs and "STEP008 Windows live acceptance is `PENDING`" not in active_docs)
    check("step009-windows-pending", "STEP009 Windows live" in active_docs and "PENDING" in active_docs)

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    windows = (ROOT / "scripts/sh_run_step009_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in windows and b"\n" not in windows.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in windows)
    check("posix-launcher", (ROOT / "scripts/sh_run_step009_acceptance.sh").is_file())

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    check(
        "build-unit-architecture-exports",
        ok and "OPENRILL_STEP001_SUITE_PASS unit_files=18 reporter=TAP" in output
        and "# tests 95" in output and "# pass 95" in output and "# fail 0" in output
        and "OPENRILL_ARCHITECTURE_PASS packages=25" in output
        and "OPENRILL_PACKAGE_EXPORT_PASS packages=25" in output,
        "suite_pass" if ok else output[-8000:],
    )
    for name, marker in (
        ("step006-ledger-regression", "OPENRILL_STEP006_LIVE_PASS schema=6 conversation=PERSISTED submission=IDEMPOTENT cancel=PASS restart=PASS"),
        ("step007-model-regression", "OPENRILL_STEP007_LIVE_PASS schema=6 provider=OPENAI_RESPONSES run=COMPLETED assistant=PERSISTED secret=POINT_OF_USE"),
        ("step008-workspace-regression", "OPENRILL_STEP008_LIVE_PASS schema=6 workspace=CONFINED tools=READ_WRITE_PATCH artifacts=3 modelCalls=4 toolCalls=3 unicode=PASS secret=POINT_OF_USE"),
        ("step009-live-process", "OPENRILL_STEP009_LIVE_PASS schema=6 approval=WAIT_RESUME decision=ALLOW_ONCE process=ARGV_FOREGROUND toolCalls=1 modelCalls=2 secret=POINT_OF_USE"),
    ):
        script = {"step006-ledger-regression":"run-step006-live.mjs", "step007-model-regression":"run-step007-live.mjs", "step008-workspace-regression":"run-step008-live.mjs", "step009-live-process":"run-step009-live.mjs"}[name]
        ok, output = run_utf8(["node", f"scripts/{script}"], cwd=ROOT)
        check(name, ok and marker in output, "live_pass" if ok else output[-8000:])

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [path for path in ROOT.rglob("*") if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})]
    check("protected-payload-zero", not protected)
    report_text = read_utf8(REPORT) if REPORT.exists() else ""
    check("secret-value-not-reported", "Bearer " not in report_text and re.search(r"(?i)(api[_-]?key|process[_-]?secret)\s*[:=]\s*\S+", report_text) is None)

    clean()
    generated = [path for path in ROOT.rglob("*") if "node_modules" not in path.relative_to(ROOT).parts and any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)]
    check("generated-cleanup", not generated, json.dumps([str(path.relative_to(ROOT)) for path in generated[:20]]))

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, outcome, detail in checks]
    lines.append(f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} policy=DURABLE process_tools=4 resume=WAITING_APPROVAL")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
