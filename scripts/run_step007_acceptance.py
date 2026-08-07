from __future__ import annotations

import ast
import json
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP007_ACCEPTANCE_REPORT.txt"
VERSION = "0.7.0-step007"
STEP = "STEP007_AGENT_KERNEL_AND_MODEL_ADAPTER"


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
    check("step007-script", package.get("scripts", {}).get("acceptance:step007") == "python scripts/run_step007_acceptance.py")
    check("step007-package-script", "package_step007.py" in package.get("scripts", {}).get("package:step007", ""))

    required = [
        "packages/model-adapter/src/types.ts",
        "packages/model-adapter/src/scripted.ts",
        "packages/model-openai-responses/src/index.ts",
        "packages/tool-runtime/src/index.ts",
        "packages/agent-kernel/src/kernel.ts",
        "packages/state/migrations/004_agent_model_execution.sql",
        "services/agent-host/src/model-resolver.ts",
        "services/agent-host/src/run-coordinator.ts",
        "tests/unit/agent-kernel-step007.test.mjs",
        "tests/unit/model-openai-responses-step007.test.mjs",
        "scripts/run-step007-live.mjs",
        "scripts/run_step007_acceptance.py",
        "scripts/sh_run_step007_acceptance.cmd",
        "scripts/sh_run_step007_acceptance.sh",
        "scripts/package_step007.py",
        "docs/contracts/MODEL_ADAPTER.md",
        "docs/contracts/AGENT_KERNEL.md",
        "docs/governance/ENGINEERING_ISSUE_REGISTRY.md",
        "docs/testing/RECURRENCE_PREVENTION_GATES.md",
        "docs/plans/STEP007_AGENT_KERNEL_AND_MODEL_ADAPTER.md",
        "docs/adrs/ADR-0023-PROVIDER_NEUTRAL_AGENT_KERNEL.md",
        "reference/openclaw/AGENT_KERNEL_AND_MODEL_ADAPTER.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    package_manifests = manifests()
    versions = {json.loads(read_utf8(path)).get("version") for path in package_manifests}
    check("manifest-count", len(package_manifests) == 26, str(len(package_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))
    check("new-provider-package", any(json.loads(read_utf8(path)).get("name") == "@openrill/model-openai-responses" for path in package_manifests))
    check("no-openclaw-dependency", not any("openclaw" in json.dumps(json.loads(read_utf8(path)).get("dependencies", {})).lower() for path in package_manifests))

    migration = read_utf8(ROOT / "packages/state/migrations/004_agent_model_execution.sql")
    for token in ("ALTER TABLE run_attempts ADD COLUMN provider_id", "CREATE TABLE model_invocations", "UNIQUE (run_id, request_number)", "idx_model_invocations_attempt"):
        check(f"migration-contract:{token}", token in migration)
    migrations = read_utf8(ROOT / "packages/state/src/migrations.ts")
    check("schema-version-four", "OPENRILL_STATE_SCHEMA_VERSION = 4" in migrations)

    model = read_utf8(ROOT / "packages/model-adapter/src/types.ts")
    for token in ("interface ModelAdapter", "interface ModelAdapterResolver", 'type: "text_delta"', 'type: "tool_call"', 'type: "completed"'):
        check(f"model-contract:{token}", token in model)
    provider = read_utf8(ROOT / "packages/model-openai-responses/src/index.ts")
    for token in ("createOpenAIResponsesAdapter", "text/event-stream", "response.function_call_arguments.delta", "response.completed", "store: false"):
        check(f"provider-contract:{token}", token in provider)
    kernel = read_utf8(ROOT / "packages/agent-kernel/src/kernel.ts")
    for token in ("executeAgentRun", "model.requested", "model.retry", "tool.replayed", 'execution: "SEQUENTIAL"', "AGENT_MODEL_CALL_BUDGET_EXCEEDED"):
        check(f"kernel-contract:{token}", token in kernel)
    check("kernel-http-import-zero", "node:http" not in kernel and "fetch(" not in kernel)
    check("kernel-sqlite-import-zero", "node:sqlite" not in kernel and "@openrill/state" not in kernel)

    resolver = read_utf8(ROOT / "services/agent-host/src/model-resolver.ts")
    check("secret-point-of-use", "resolveSecretReference" in resolver and "createOpenAIResponsesAdapter" in resolver)
    coordinator = read_utf8(ROOT / "services/agent-host/src/run-coordinator.ts")
    check("active-run-abort", "AbortController" in coordinator and "Promise.allSettled" in coordinator)
    operations = read_utf8(ROOT / "services/agent-host/src/transport/operation-registry.ts")
    check("new-send-schedules-once", "if (!output.replayed) runHooks?.schedule" in operations)
    check("cancel-aborts-active", "runHooks?.cancel(output.run.runId)" in operations)

    config_types = read_utf8(ROOT / "packages/config/src/types.ts")
    for token in ("maxOutputTokens", "maxRetries", "readonly model?: string"):
        check(f"config-provider-contract:{token}", token in config_types)

    issue_registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(1, 13):
        check(f"issue-registry:OR-ISSUE-{number:03d}", f"OR-ISSUE-{number:03d}" in issue_registry)
    check("issue-close-contract", "신규 이슈 종료 조건" in issue_registry)
    check("step007-recurrence-heading", "## 반복 방지 기록" in read_utf8(ROOT / "docs/plans/STEP007_AGENT_KERNEL_AND_MODEL_ADAPTER.md"))
    check("recurrence-fresh-zip", "fresh ZIP extraction" in recurrence)
    state_test = read_utf8(ROOT / "tests/unit/state-step005.test.mjs")
    check("migration-test-current-schema-derived", "Array.from({ length: OPENRILL_STATE_SCHEMA_VERSION }" in state_test and "OPENRILL_STATE_SCHEMA_VERSION + 1" in state_test)
    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))

    evidence = json.loads(read_utf8(ROOT / "reference/openclaw/EVIDENCE_INDEX.json"))
    evidence_report = json.loads(read_utf8(ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json"))
    check("evidence-count", len(evidence) == 113, str(len(evidence)))
    check("evidence-report", evidence_report.get("allVerified") is True and evidence_report.get("verifiedCount") == 113, str(evidence_report.get("verifiedCount")))
    for evidence_id in ("OC-AGENT-006", "OC-AGENT-007", "OC-AGENT-008", "OC-AGENT-009", "OC-MODEL-001", "OC-MODEL-002", "OC-MODEL-003", "OC-MODEL-004", "OC-MODEL-005"):
        check(f"evidence:{evidence_id}", any(item["id"] == evidence_id for item in evidence))

    plan = read_utf8(ROOT / "docs/plans/STEP007_AGENT_KERNEL_AND_MODEL_ADAPTER.md")
    for heading in ("## 목적", "## 기준선", "## Reference Evidence", "## OpenClaw 문제 분석", "## 구현 범위", "## 공개 계약", "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 반복 방지 기록", "## 패키징 산출물", "## 제외", "## 완료 선언"):
        check(f"plan-heading:{heading}", heading in plan)

    windows = (ROOT / "scripts/sh_run_step007_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in windows and b"\n" not in windows.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in windows)
    check("posix-launcher", (ROOT / "scripts/sh_run_step007_acceptance.sh").is_file())

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    check("build-unit-architecture-exports", ok and "OPENRILL_STEP001_SUITE_PASS unit_files=16 reporter=TAP" in output and "# tests 70" in output and "# pass 70" in output and "# fail 0" in output, "suite_pass" if ok else output[-8000:])
    ok, output = run_utf8(["node", "scripts/run-step006-live.mjs"], cwd=ROOT)
    check("step006-ledger-regression", ok and "OPENRILL_STEP006_LIVE_PASS schema=4 conversation=PERSISTED submission=IDEMPOTENT cancel=PASS restart=PASS" in output, "step006_pass" if ok else output[-8000:])
    ok, output = run_utf8(["node", "scripts/run-step007-live.mjs"], cwd=ROOT)
    check("step007-live-process", ok and "OPENRILL_STEP007_LIVE_PASS schema=4 provider=OPENAI_RESPONSES run=COMPLETED assistant=PERSISTED secret=POINT_OF_USE" in output, "live_pass" if ok else output[-8000:])

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [path for path in ROOT.rglob("*") if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})]
    check("protected-payload-zero", not protected)
    check("secret-value-not-reported", "live-secret-value" not in read_utf8(ROOT / "reference/validation/STEP007_ACCEPTANCE_REPORT.txt") if REPORT.exists() else True)
    clean()
    generated = [path for path in ROOT.rglob("*") if any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)]
    check("generated-cleanup", not generated)

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, outcome, detail in checks]
    lines.append(f"{STEP} checks={passed}/{len(checks)} state={state} schema=4 kernel=PROVIDER_NEUTRAL provider=OPENAI_RESPONSES ledger=MODEL_INVOCATIONS")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
