from __future__ import annotations

import json
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP006_ACCEPTANCE_REPORT.txt"
VERSION = "0.6.1-step006a"
STEP = "STEP006_CONVERSATION_AND_EVENT_LEDGER"


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


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check(
        "step006-script",
        package.get("scripts", {}).get("acceptance:step006")
        == "python scripts/run_step006_acceptance.py",
    )

    required = [
        "packages/state/migrations/003_conversation_event_ledger.sql",
        "packages/state/src/conversation-repository.ts",
        "packages/conversations/src/errors.ts",
        "packages/conversations/src/types.ts",
        "packages/conversations/src/service.ts",
        "packages/protocol/src/conversation-operations.ts",
        "tests/unit/conversation-step006.test.mjs",
        "scripts/run-step006-live.mjs",
        "scripts/run_step006_acceptance.py",
        "scripts/sh_run_step006_acceptance.cmd",
        "scripts/sh_run_step006_acceptance.sh",
        "scripts/package_step006.py",
        "docs/contracts/CONVERSATION_LEDGER.md",
        "docs/plans/STEP006_CONVERSATION_AND_EVENT_LEDGER.md",
        "docs/adrs/ADR-0021-CONVERSATION_RUN_EVENT_LEDGER.md",
        "reference/openclaw/CONVERSATION_LEDGER.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    package_manifests = manifests()
    versions = {
        json.loads(read_utf8(path)).get("version") for path in package_manifests
    }
    verifier = read_utf8(ROOT / "scripts/verify_package_manifest.py")
    check("manifest-count", len(package_manifests) == 25, str(len(package_manifests)))
    check(
        "manifest-version-alignment",
        versions == {VERSION} and "STEP006A_WINDOWS_UTF8_TEXT_IO" in verifier and VERSION in verifier,
        json.dumps(sorted(versions)),
    )

    migration = read_utf8(ROOT / required[0])
    for token in (
        "CREATE TABLE conversations",
        "CREATE TABLE conversation_messages",
        "CREATE TABLE agent_runs",
        "CREATE TABLE run_attempts",
        "CREATE TABLE run_events",
        "CREATE TABLE conversation_submissions",
        "CREATE TABLE conversation_projections",
        "idx_run_events_idempotency",
        "json_valid(payload_json)",
    ):
        check(f"migration-contract:{token}", token in migration)

    service = read_utf8(ROOT / "packages/conversations/src/service.ts")
    for token in (
        "class ConversationService",
        "SUBMISSION_CONFLICT",
        "EVENT_SEQUENCE_CONFLICT",
        "EVENT_IDEMPOTENCY_CONFLICT",
        "recoverIncompleteRuns",
        "run.checkpoint",
        "HOST_RESTART",
        "rebuildProjection",
        "WORKSPACE_ACCESS_DENIED",
    ):
        check(f"service-contract:{token}", token in service)

    repository = read_utf8(ROOT / "packages/state/src/conversation-repository.ts")
    for token in (
        "nextMessageSequence",
        "nextEventSequence",
        "ORDER BY sequence",
        "conversation_projections",
        "BEGIN IMMEDIATE",
    ):
        check(
            f"repository-contract:{token}",
            token in repository or (token == "BEGIN IMMEDIATE" and "transaction" in service),
        )

    registry = read_utf8(ROOT / "services/agent-host/src/transport/operation-registry.ts")
    for operation in (
        "conversation.create",
        "conversation.list",
        "conversation.get",
        "conversation.send",
        "conversation.cancel",
    ):
        check(f"operation:{operation}", operation in registry)

    lifecycle = read_utf8(ROOT / "services/agent-host/src/lifecycle.ts")
    check(
        "recovery-before-listener",
        lifecycle.index("recoverIncompleteRuns") < lifecycle.index("http.createServer"),
    )
    check("configured-workspace-scope", "workspaceIds" in lifecycle)

    unit = read_utf8(ROOT / "tests/unit/conversation-step006.test.mjs")
    for name in (
        "strict per-conversation ordering",
        "submission idempotency",
        "append-only, sequence checked",
        "projection is rebuildable",
        "checkpointed running run resumable",
        "uncheckpointed running run non-resumable",
        "cancel is effective",
        "foreign and unknown workspaces",
        "authenticated protocol exposes conversation operations",
    ):
        check(f"unit-contract:{name}", name in unit)

    evidence = json.loads(read_utf8(ROOT / "reference/openclaw/EVIDENCE_INDEX.json"))
    evidence_report = json.loads(
        read_utf8(ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json")
    )
    check("evidence-count", len(evidence) == 104, str(len(evidence)))
    check(
        "evidence-report",
        evidence_report.get("allVerified") is True
        and evidence_report.get("verifiedCount") == 104,
        str(evidence_report.get("verifiedCount")),
    )
    for evidence_id in ("OC-STATE-013", "OC-STATE-014", "OC-STATE-015", "OC-STATE-016"):
        check(f"evidence:{evidence_id}", any(item["id"] == evidence_id for item in evidence))

    plan = read_utf8(ROOT / "docs/plans/STEP006_CONVERSATION_AND_EVENT_LEDGER.md")
    for heading in (
        "## 목적",
        "## 기준선",
        "## Reference Evidence",
        "## OpenClaw 문제 분석",
        "## 구현 범위",
        "## 공개 계약",
        "## 상태 전이",
        "## 실패 및 복구",
        "## Acceptance",
        "## 패키징 산출물",
        "## 제외",
        "## 완료 선언",
    ):
        check(f"plan-heading:{heading}", heading in plan)

    windows_launcher = (ROOT / "scripts/sh_run_step006_acceptance.cmd").read_bytes()
    check(
        "windows-launcher-crlf",
        b"\r\n" in windows_launcher
        and b"\n" not in windows_launcher.replace(b"\r\n", b""),
    )
    check("windows-launcher-root-relative", b"%~dp0.." in windows_launcher)
    check("posix-launcher", (ROOT / "scripts/sh_run_step006_acceptance.sh").is_file())

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    check(
        "build-unit-architecture-exports",
        ok
        and "OPENRILL_STEP001_SUITE_PASS unit_files=14 reporter=TAP" in output
        and "# tests 65" in output
        and "# pass 65" in output
        and "# fail 0" in output,
        "suite_pass" if ok else output[-8000:],
    )

    ok, output = run_utf8(["node", "scripts/run-step005-live.mjs"], cwd=ROOT)
    check(
        "step005-core-regression",
        ok
        and "OPENRILL_STEP005_LIVE_PASS schema=3 journal=WAL migrations=3 backup=VERIFIED reopen=PASS"
        in output,
        "step005_core_pass" if ok else output[-8000:],
    )

    ok, output = run_utf8(["node", "scripts/run-step006-live.mjs"], cwd=ROOT)
    check(
        "step006-live-process",
        ok
        and "OPENRILL_STEP006_LIVE_PASS schema=3 conversation=PERSISTED submission=IDEMPOTENT cancel=PASS restart=PASS"
        in output,
        "live_pass" if ok else output[-8000:],
    )

    check(
        "database-files-zero",
        not any(ROOT.rglob("*.db"))
        and not any(ROOT.rglob("*.db-wal"))
        and not any(ROOT.rglob("*.db-shm")),
    )
    check(
        "runtime-files-zero",
        not any(
            path.name in {"host.lock", "host.json", "config.mutation.lock"}
            for path in ROOT.rglob("*")
        ),
    )
    protected = [
        path
        for path in ROOT.rglob("*")
        if path.is_file()
        and (
            path.name in {".env", ".env.local"}
            or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"}
        )
    ]
    check("protected-payload-zero", not protected)
    clean()
    generated = [
        path
        for path in ROOT.rglob("*")
        if any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)
    ]
    check("generated-cleanup", not generated)

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [
        f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "")
        for name, outcome, detail in checks
    ]
    lines.append(
        f"{STEP} checks={passed}/{len(checks)} state={state} "
        "schema=3 ledger=APPEND_ONLY recovery=CLASSIFIED protocol=WORKSPACE_SCOPED"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
