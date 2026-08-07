from __future__ import annotations

import json
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP005_ACCEPTANCE_REPORT.txt"
VERSION = "0.6.1-step006a"
STEP = "STEP005_SQLITE_STATE_AND_MIGRATION_FOUNDATION"
EXPECTED_EVIDENCE = 104


def clean_generated() -> None:
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


def main() -> int:
    clean_generated()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: object, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1", str(package.get("packageManager")))
    check("step005-script", package.get("scripts", {}).get("acceptance:step005") == "python scripts/run_step005_acceptance.py")
    check("step005-package-script", "package_step005.py" in package.get("scripts", {}).get("package:step005", ""))

    required = [
        "packages/state/src/errors.ts", "packages/state/src/types.ts", "packages/state/src/paths.ts",
        "packages/state/src/transaction.ts", "packages/state/src/integrity.ts", "packages/state/src/migrations.ts",
        "packages/state/src/repository.ts", "packages/state/src/database.ts", "packages/state/src/index.ts",
        "packages/state/migrations/001_state_identity.sql", "packages/state/migrations/002_state_health_checks.sql", "packages/state/migrations/003_conversation_event_ledger.sql",
        "services/agent-host/src/control.ts", "tests/unit/state-step005.test.mjs",
        "scripts/run-step005-live.mjs", "scripts/run_step005_acceptance.py",
        "scripts/sh_run_step005_acceptance.cmd", "scripts/sh_run_step005_acceptance.sh", "scripts/package_step005.py",
        "docs/contracts/STATE_DATABASE.md", "docs/operations/SQLITE_RELIABILITY.md",
        "docs/plans/STEP005_SQLITE_STATE_AND_MIGRATION_FOUNDATION.md",
        "docs/adrs/ADR-0020-PROFILE_SCOPED_SQLITE_MIGRATION_LEDGER.md",
        "reference/openclaw/SQLITE_STATE.md",
    ]
    for rel in required:
        check(f"required:{rel}", (ROOT / rel).is_file())

    all_manifests = manifests()
    versions = {json.loads(path.read_text(encoding="utf-8")).get("version") for path in all_manifests}
    check("manifest-count", len(all_manifests) == 25, str(len(all_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))
    dependencies: dict[str, str] = {}
    for path in all_manifests:
        data = json.loads(path.read_text(encoding="utf-8"))
        for field in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            dependencies.update(data.get(field, {}))
    check("node-sqlite-built-in-only", not ({"sqlite3", "better-sqlite3", "@libsql/client", "sql.js"} & set(dependencies)))
    check("no-openclaw-dependency", not any(name == "openclaw" or name.startswith("@openclaw/") for name in dependencies))
    check("ui-framework-still-deferred", not ({"react", "vue", "lit", "svelte", "solid-js"} & set(dependencies)))

    state_package = json.loads((ROOT / "packages/state/package.json").read_text(encoding="utf-8"))
    check("state-config-dependency", state_package.get("dependencies", {}).get("@openrill/config") == "workspace:*")
    check("state-protocol-dependency", state_package.get("dependencies", {}).get("@openrill/protocol") == "workspace:*")
    check("host-state-dependency", json.loads((ROOT / "services/agent-host/package.json").read_text(encoding="utf-8")).get("dependencies", {}).get("@openrill/state") == "workspace:*")
    check("host-control-subpath", "./control" in json.loads((ROOT / "services/agent-host/package.json").read_text(encoding="utf-8")).get("exports", {}))

    paths_source = (ROOT / "packages/state/src/paths.ts").read_text(encoding="utf-8")
    for token in ('selectPathSemantics', 'platform === "win32" ? win32 : posix', '"state"', '"agent.db"', '"backups"'):
        check(f"state-path-contract:{token}", token in paths_source)

    database = (ROOT / "packages/state/src/database.ts").read_text(encoding="utf-8")
    for token in (
        'from "node:sqlite"', 'DEFAULT_STATE_BUSY_TIMEOUT_MS = 1500', 'STATE_WAL_AUTOCHECKPOINT_PAGES = 1000',
        'STATE_JOURNAL_SIZE_LIMIT_BYTES = 64 * 1024 * 1024', 'PRAGMA foreign_keys = ON',
        'PRAGMA trusted_schema = OFF', 'PRAGMA synchronous = NORMAL', 'PRAGMA journal_mode = WAL',
        'timeout: busyTimeoutMs', 'enableForeignKeyConstraints: true', 'allowExtension: false',
        'currentVersion > 0', 'assertStateIntegrity(database', 'checkpointMode ?? "TRUNCATE"',
        'await backup(', 'readOnly: true', 'full: true', 'createHash("sha256")',
    ):
        check(f"database-contract:{token}", token in database)
    check("database-extension-loading-zero", "loadExtension" not in database and "enableLoadExtension" not in database)

    migrations = (ROOT / "packages/state/src/migrations.ts").read_text(encoding="utf-8")
    for token in (
        'OPENRILL_STATE_SCHEMA_VERSION = 3', 'MIGRATION_FILE_PATTERN', 'createHash("sha256")',
        'CREATE TABLE IF NOT EXISTS schema_migrations', 'STATE_MIGRATION_DRIFT', 'STATE_SCHEMA_NEWER',
        'PRAGMA user_version', 'runImmediateStateTransaction', 'state_identity',
        'return rows.map((row) => ({', 'product: row.product',
    ):
        check(f"migration-contract:{token}", token in migrations)

    transaction = (ROOT / "packages/state/src/transaction.ts").read_text(encoding="utf-8")
    for token in ('BEGIN IMMEDIATE', 'STATE_TRANSACTION_ASYNC', 'COMMIT', 'ROLLBACK'):
        check(f"transaction-contract:{token}", token in transaction)

    integrity = (ROOT / "packages/state/src/integrity.ts").read_text(encoding="utf-8")
    for token in ('quick_check', 'integrity_check', 'PRAGMA foreign_key_check', 'STATE_INTEGRITY_FAILED'):
        check(f"integrity-contract:{token}", token in integrity)

    repository = (ROOT / "packages/state/src/repository.ts").read_text(encoding="utf-8")
    for token in ('class StateRepositories', 'return {', 'product: row.product', 'JSON.parse', 'BEGIN IMMEDIATE'):
        check(f"repository-contract:{token}", token in repository or (token == 'BEGIN IMMEDIATE' and 'runImmediateStateTransaction' in repository))

    state_index = (ROOT / "packages/state/src/index.ts").read_text(encoding="utf-8")
    check("raw-database-public-export-zero", "DatabaseSync" not in state_index)
    check("state-public-open", "openOpenRillStateDatabase" in state_index)
    check("state-public-diagnostics", "StateDatabaseDiagnostics" in state_index)

    migration1 = (ROOT / "packages/state/migrations/001_state_identity.sql").read_text(encoding="utf-8")
    migration2 = (ROOT / "packages/state/migrations/002_state_health_checks.sql").read_text(encoding="utf-8")
    for token in ("CREATE TABLE state_identity", "product = 'OpenRill'", "FOREIGN KEY (schema_version)", ") STRICT;"):
        check(f"migration001:{token}", token in migration1)
    for token in ("CREATE TABLE state_health_checks", "json_valid(details_json)", "CREATE INDEX idx_state_health_checks_status", ") STRICT;"):
        check(f"migration002:{token}", token in migration2)

    lifecycle = (ROOT / "services/agent-host/src/lifecycle.ts").read_text(encoding="utf-8")
    check("host-state-before-listener", lifecycle.index("openOpenRillStateDatabase") < lifecycle.index("http.createServer"))
    close_start = lifecycle.index("closeHost =")
    check(
        "host-state-close-before-lock",
        lifecycle.index('stateDatabase.close({ checkpointMode: "TRUNCATE" })', close_start)
        < lifecycle.index("lock.release()", close_start),
    )
    check("host-state-startup-rollback", 'stateDatabase.close({ checkpointMode: "TRUNCATE" })' in lifecycle and 'state database startup failed' in lifecycle)

    cli = (ROOT / "apps/agent-cli/src/index.ts").read_text(encoding="utf-8")
    check("cli-host-runtime-lazy", 'await import("@openrill/host")' in cli)
    check("cli-control-runtime-lazy", 'await import("@openrill/host/control")' in cli)
    check("cli-static-host-runtime-zero", 'from "@openrill/host";' not in "\n".join(line for line in cli.splitlines() if not line.startswith("import type")))

    unit = (ROOT / "tests/unit/state-step005.test.mjs").read_text(encoding="utf-8")
    unit_names = (
        "state paths are profile-scoped", "fresh open applies immutable migrations", "second open is a migration no-op",
        "sequential upgrade fixture", "checksum drift", "newer schema version", "foreign key enforcement",
        "transaction rolls back", "concurrent writer contention", "foreign key corruption",
        "online backup includes committed WAL state", "Host readiness requires migrated state",
    )
    for name in unit_names:
        check(f"unit-contract:{name}", name in unit)

    evidence = json.loads((ROOT / "reference/openclaw/EVIDENCE_INDEX.json").read_text(encoding="utf-8"))
    report = json.loads((ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json").read_text(encoding="utf-8"))
    check("evidence-count", len(evidence) == EXPECTED_EVIDENCE, str(len(evidence)))
    check("evidence-unique", len({item["id"] for item in evidence}) == len(evidence))
    check("evidence-report", report.get("allVerified") is True and report.get("verifiedCount") == EXPECTED_EVIDENCE, str(report.get("verifiedCount")))
    for evidence_id in ("OC-STATE-007", "OC-STATE-008", "OC-STATE-009", "OC-STATE-010", "OC-STATE-011", "OC-STATE-012"):
        check(f"evidence:{evidence_id}", any(item["id"] == evidence_id for item in evidence))

    plan = (ROOT / "docs/plans/STEP005_SQLITE_STATE_AND_MIGRATION_FOUNDATION.md").read_text(encoding="utf-8")
    for heading in (
        "## 목적", "## 기준선", "## Reference Evidence", "## OpenClaw 문제 분석", "## 구현 범위",
        "## 공개 계약", "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 패키징 산출물",
        "## 제외", "## 완료 선언",
    ):
        check(f"step005-heading:{heading}", heading in plan)
    check("plan-independent-redesign", "독립 계약" in plan and "OpenClaw table" in plan)
    check("state-contract-doc", (ROOT / "docs/contracts/STATE_DATABASE.md").is_file())
    check("sqlite-operations-doc", (ROOT / "docs/operations/SQLITE_RELIABILITY.md").is_file())
    check("state-adr", (ROOT / "docs/adrs/ADR-0020-PROFILE_SCOPED_SQLITE_MIGRATION_LEDGER.md").is_file())
    check("reference-study", (ROOT / "reference/openclaw/SQLITE_STATE.md").is_file())

    cmd = (ROOT / "scripts/sh_run_step005_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd and b"\n" not in cmd.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd and b"run_step005_acceptance.py" in cmd)
    check("posix-launcher", (ROOT / "scripts/sh_run_step005_acceptance.sh").is_file())

    ok, output = run_utf8(["python", "scripts/run_step004_acceptance.py"], cwd=ROOT)
    check("step004-regression", ok and "checks=142/142 state=PASSED" in output, "step004_pass" if ok else output[-8000:])

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    check(
        "build-unit-architecture-exports",
        ok and "OPENRILL_STEP001_SUITE_PASS unit_files=14 reporter=TAP" in output
        and "# tests 65" in output and "# pass 65" in output and "# fail 0" in output,
        "suite_pass" if ok else output[-8000:],
    )

    ok, output = run_utf8(["node", "scripts/run-step005-live.mjs"], cwd=ROOT)
    check(
        "step005-live-process",
        ok and "OPENRILL_STEP005_LIVE_PASS schema=3 journal=WAL migrations=3 backup=VERIFIED reopen=PASS" in output,
        "live_pass" if ok else output[-8000:],
    )

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [
        path for path in ROOT.rglob("*") if path.is_file()
        and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})
    ]
    check("protected-payload-zero", not protected, ",".join(path.name for path in protected[:5]))
    reports = "\n".join(path.read_text(encoding="utf-8", errors="replace") for path in (ROOT / "reference/validation").glob("*.txt"))
    check("state-path-value-not-reported", "OPENRILL_STATE_DATABASE_VALUE=" not in reports)

    clean_generated()
    generated = [
        path.relative_to(ROOT).as_posix() for path in ROOT.rglob("*")
        if any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)
    ]
    check("generated-cleanup", not generated, ",".join(generated[:5]))

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines: list[str] = []
    for name, ok, detail in checks:
        line = f"[{'PASS' if ok else 'FAIL'}] {name}"
        if detail:
            line += f" :: {detail}"
        lines.append(line)
    lines.append(
        f"{STEP} checks={passed}/{len(checks)} state={state} "
        "schema=3 journal=WAL migrations=CHECKSUMMED backup=VERIFIED"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
