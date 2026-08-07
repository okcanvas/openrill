from __future__ import annotations

import ast
import json
import re
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP010_ACCEPTANCE_REPORT.txt"
VERSION = "0.10.1-step010r1"
STEP = "STEP010R1_WINDOWS_SYMLINK_CAPABILITY_AND_SUITE_DIAGNOSTICS"
SCHEMA = 7


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
    check("step010-script", package.get("scripts", {}).get("acceptance:step010") == "python scripts/run_step010_acceptance.py")
    check("step010-package-script", "package_step010.py" in package.get("scripts", {}).get("package:step010", ""))

    required = [
        "packages/skills/src/types.ts",
        "packages/skills/src/yaml.ts",
        "packages/skills/src/catalog.ts",
        "packages/skills/src/snapshot.ts",
        "packages/state/migrations/007_skill_discovery_run_snapshot.sql",
        "packages/state/src/skill-repository.ts",
        "services/agent-host/src/skill-run-service.ts",
        "services/agent-host/src/run-coordinator.ts",
        "services/agent-host/src/lifecycle.ts",
        "skills/builtin/catalog/workspace-review/skill.yaml",
        "skills/builtin/catalog/workspace-review/instructions.md",
        "tests/unit/skills-step010.test.mjs",
        "scripts/run-step010-live.mjs",
        "scripts/run_step010_acceptance.py",
        "scripts/sh_run_step010_acceptance.cmd",
        "scripts/sh_run_step010_acceptance.sh",
        "scripts/package_step010.py",
        "docs/contracts/SKILLS.md",
        "docs/adrs/ADR-0026-IMMUTABLE_SKILL_RUN_SNAPSHOT.md",
        "docs/plans/STEP010_SKILL_DISCOVERY_AND_RUN_SNAPSHOT.md",
        "reference/openclaw/SKILL_DISCOVERY_AND_RUN_SNAPSHOT.md",
        "docs/governance/ENGINEERING_ISSUE_REGISTRY.md",
        "docs/testing/RECURRENCE_PREVENTION_GATES.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    package_manifests = manifests()
    manifest_objects = [json.loads(read_utf8(path)) for path in package_manifests]
    versions = {item.get("version") for item in manifest_objects}
    names = {item.get("name") for item in manifest_objects}
    check("manifest-count", len(package_manifests) == 26, str(len(package_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))
    check("skills-package", "@openrill/skills" in names)
    check("skills-builtin-package", "@openrill/skills-builtin" in names)
    check("no-openclaw-dependency", not any("openclaw" in json.dumps(item.get("dependencies", {})).lower() for item in manifest_objects))
    skills_manifest = json.loads(read_utf8(ROOT / "packages/skills/package.json"))
    builtin_manifest = json.loads(read_utf8(ROOT / "skills/builtin/package.json"))
    check("skills-package-unused-dependencies-zero", "dependencies" not in skills_manifest)
    check("builtin-package-unused-dependencies-zero", "dependencies" not in builtin_manifest)

    generator = read_utf8(ROOT / "scripts/generate_package_manifest.py")
    verifier = read_utf8(ROOT / "scripts/verify_package_manifest.py")
    generated = json.loads(read_utf8(ROOT / "PACKAGE_MANIFEST.json"))
    for label, source in (("generator", generator), ("verifier", verifier)):
        check(f"package-manifest-{label}-step", f'STEP = "{STEP}"' in source)
        check(f"package-manifest-{label}-version", f'VERSION = "{VERSION}"' in source)
    check("package-manifest-generated-identity", generated.get("step") == STEP and generated.get("version") == VERSION, f"{generated.get('step')} {generated.get('version')}")

    lock = read_utf8(ROOT / "pnpm-lock.yaml")
    check("lock-skills-empty-importer", "  packages/skills: {}" in lock)
    check("lock-builtin-empty-importer", "  skills/builtin: {}" in lock)
    host_lock = lock.split("  services/agent-host:", 1)[1].split("  skills/builtin:", 1)[0]
    check("lock-host-skills", "'@openrill/skills':" in host_lock)

    migrations = read_utf8(ROOT / "packages/state/src/migrations.ts")
    migration = read_utf8(ROOT / "packages/state/migrations/007_skill_discovery_run_snapshot.sql")
    check("schema-version-seven", "OPENRILL_STATE_SCHEMA_VERSION = 7" in migrations)
    for token in (
        "CREATE TABLE skill_sources",
        "CREATE TABLE skill_validation_diagnostics",
        "CREATE TABLE skill_run_contexts",
        "CREATE TABLE skill_snapshots",
        "UNIQUE (run_id, skill_id)",
        "FOREIGN KEY (run_id) REFERENCES agent_runs",
        "FOREIGN KEY (source_key) REFERENCES skill_sources",
    ):
        check(f"migration-contract:{token}", token in migration)

    repository = read_utf8(ROOT / "packages/state/src/skill-repository.ts")
    for token in (
        "class StateSkillRepository",
        "replaceSourceDiscovery",
        "insertRunContext",
        "getRunContext",
        "insertSnapshot",
        "getSnapshotByRunSkill",
        "listRunSnapshots",
        "STATE_CONFLICT",
    ):
        check(f"repository:{token}", token in repository)

    parser = read_utf8(ROOT / "packages/skills/src/yaml.ts")
    exact_keys = 'new Set(["id", "version", "description", "activation", "instructions", "tools", "resources", "compatibility"])'
    check("manifest-exact-top-level-keys", exact_keys in parser)
    check("manifest-compatibility-keys", 'new Set(["minOpenRill", "maxOpenRillExclusive"])' in parser)
    for token in ("unknown field", "duplicate field", "tabs are not allowed", "block list syntax", "two-space nesting"):
        check(f"manifest-parser:{token}", token in parser)

    catalog = read_utf8(ROOT / "packages/skills/src/catalog.ts")
    for token in (
        'type: "BUNDLED"',
        'type: "MANAGED_USER"',
        'type: "WORKSPACE"',
        "precedence: 10",
        "precedence: 20",
        "precedence: 30",
        "SKILL_REQUIRED_TOOL_UNAVAILABLE",
        "SKILL_SHADOWED",
        "manifestSha256: sha256(raw)",
        "canonicalSourceRevision",
        "selectActivatedSkills",
        "metadataSink.replaceSourceDiscovery",
    ):
        check(f"catalog-contract:{token}", token in catalog)
    check("source-revision-not-path-only", "rootRevision: sha256(source.rootPath)" not in catalog)
    check("discovery-content-lazy", "instructions:" not in catalog.split("candidates.push({", 1)[1].split("});", 1)[0])

    snapshot = read_utf8(ROOT / "packages/skills/src/snapshot.ts")
    for token in (
        "serializeCapture",
        "captureTails",
        "await rm(destination, { recursive: true, force: true })",
        "manifestRead.bytes",
        "entry.manifestSha256",
        "await rename(temp, destination)",
        "file.bytes",
        "file.sha256",
        "SKILL_SNAPSHOT_INCONSISTENT",
        "MAX_TOTAL_RESOURCE_BYTES",
        "formatActiveSkillInstructions",
    ):
        check(f"snapshot-contract:{token}", token in snapshot)
    check("snapshot-existing-dir-blind-reuse-zero", "current?.isDirectory()" not in snapshot)

    service = read_utf8(ROOT / "services/agent-host/src/skill-run-service.ts")
    for token in (
        "class SkillRunService",
        "getRunContext(runId)",
        "loadRun(runId)",
        "discoverSkills",
        "selectActivatedSkills",
        "insertRunContext",
        'eventType: "skill.snapshot.captured"',
        "resolveManagedSkillRoots",
    ):
        check(f"host-skill-service:{token}", token in service)
    coordinator = read_utf8(ROOT / "services/agent-host/src/run-coordinator.ts")
    for token in ("resolveSystemInstructions", "SKILL_PREPARATION_FAILED", "failExecution", "modelCalls: 0", "toolCalls: 0"):
        check(f"coordinator-skill-failure:{token}", token in coordinator)
    lifecycle = read_utf8(ROOT / "services/agent-host/src/lifecycle.ts")
    for token in ("new SkillRunService", "bundledSkillRoots", "resolveManagedSkillRoots", "skillRunService.resolveForRun"):
        check(f"host-integration:{token}", token in lifecycle)

    builtin = read_utf8(ROOT / "skills/builtin/catalog/workspace-review/skill.yaml")
    contract = read_utf8(ROOT / "docs/contracts/SKILLS.md")
    for key in ("id", "version", "description", "activation", "instructions", "tools", "resources", "compatibility"):
        check(f"builtin-key:{key}", re.search(rf"(?m)^{re.escape(key)}:", builtin) is not None)
        check(f"contract-key:{key}", re.search(rf"(?m)^{re.escape(key)}:", contract) is not None or f"`{key}`" in contract)
    for stale in ("summary:", "entry:", "allowedTools:"):
        check(f"contract-stale-field-zero:{stale}", stale not in contract)

    tests = read_utf8(ROOT / "tests/unit/skills-step010.test.mjs")
    for phrase in (
        "valid Skill discovery exposes metadata and loads content only at snapshot",
        "invalid manifest, missing instructions, resource escape, and unavailable tools isolate only the bad Skill",
        "resource symlink escape is rejected",
        "workspace precedence wins and shadow diagnostics remain durable",
        "Run snapshot ignores mid-Run edits and next Run captures a new hash",
        "enabled Skill allowlist gates activation",
        "source revision changes when discovered manifest metadata changes",
        "deleted original Skill remains readable",
        "concurrent same-Run capture serializes",
        "Skill preparation failure durably fails the Run",
    ):
        check(f"unit-fixture:{phrase}", phrase in tests)
    check("unsupported-openrill-home-zero", "OPENRILL_HOME" not in tests)
    check("supported-profile-isolation", "OPENRILL_DATA_ROOT" in tests and "OPENRILL_CONFIG_ROOT" in tests)

    live = read_utf8(ROOT / "scripts/run-step010-live.mjs")
    for token in (
        "randomBytes(32)",
        "skill_sources",
        "skill_run_contexts",
        "skill_snapshots",
        "mid-Run",
        "next Run",
        "OPENRILL_STEP010_LIVE_PASS",
    ):
        check(f"live-contract:{token}", token in live)
    check("live-static-api-secret-zero", re.search(r'const\s+apiSecret\s*=\s*["\']', live) is None)
    credential_assignment = re.compile(r'(?i)(api[_-]?(?:key|secret)|process[_-]?secret)\s*=\s*["\'][^"\']+["\']')
    credential_hits: list[str] = []
    text_suffixes = {".ts", ".mjs", ".js", ".py", ".md", ".json", ".yaml", ".yml", ".txt"}
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.name == "PACKAGE_MANIFEST.json" or path.suffix.lower() not in text_suffixes:
            continue
        if any(part in {"node_modules", "dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts):
            continue
        if credential_assignment.search(read_utf8(path)):
            credential_hits.append(path.relative_to(ROOT).as_posix())
    check("credential-shaped-source-literal-zero", not credential_hits, json.dumps(credential_hits))
    historical_marker = "OPENRILL_STEP008_API_" + "KEY="
    check("historical-step008-secret-marker-split", historical_marker not in read_utf8(ROOT / "scripts/run_step008_acceptance.py"))

    evidence = json.loads(read_utf8(ROOT / "reference/openclaw/EVIDENCE_INDEX.json"))
    evidence_report = json.loads(read_utf8(ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json"))
    check("evidence-count", len(evidence) == 120, str(len(evidence)))
    check("evidence-report", evidence_report.get("allVerified") is True and evidence_report.get("verifiedCount") == 120, str(evidence_report.get("verifiedCount")))
    for evidence_id in ("OC-SKILL-001", "OC-SKILL-002", "OC-SKILL-003", "OC-SKILL-004", "OC-SKILL-005"):
        check(f"evidence:{evidence_id}", any(item.get("id") == evidence_id for item in evidence))

    issue_registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(1, 30):
        check(f"issue-registry:OR-ISSUE-{number:03d}", f"OR-ISSUE-{number:03d}" in issue_registry)
    issue_files = [
        "STEP010_UNSUPPORTED_PROFILE_ENV_TEST_ISOLATION.md",
        "STEP010_SKILL_SOURCE_REVISION_INTEGRITY.md",
        "STEP010_SKILL_SNAPSHOT_CAPTURE_RACE.md",
        "STEP010_PRE_KERNEL_SKILL_FAILURE_STATE.md",
        "STEP010_SKILL_CONTRACT_DOCUMENT_DRIFT.md",
        "STEP010_HISTORICAL_SECRET_MARKER_LITERAL.md",
    ]
    for filename in issue_files:
        text = read_utf8(ROOT / "reference/validation" / filename)
        check(f"issue-detail:{filename}", all(heading in text for heading in ("## Exact symptom", "## Code-confirmed root cause", "## Impact", "## Fix", "## Recurrence-prevention gate")))
    for heading in (
        "### Test profile isolation",
        "### Skill source revision integrity",
        "### Immutable Skill snapshot capture",
        "### Pre-Kernel preparation failure",
        "### Skill contract documentation coherence",
        "### Historical acceptance secret markers",
    ):
        check(f"recurrence:{heading}", heading in recurrence)

    plan = read_utf8(ROOT / "docs/plans/STEP010_SKILL_DISCOVERY_AND_RUN_SNAPSHOT.md")
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
        "## 반복 방지 기록",
        "## 패키징 산출물",
        "## 제외",
        "## 완료 선언",
    ):
        check(f"plan-heading:{heading}", heading in plan)

    baseline_files = ["README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"]
    for filename in baseline_files:
        text = read_utf8(ROOT / filename)
        check(f"baseline-step:{filename}", "STEP010R1" in text)
        check(f"baseline-version:{filename}", VERSION in text or filename == "ROADMAP.md")
        check(f"baseline-previous-windows:{filename}", "STEP009" in text and ("ACCEPTED" in text or "accepted" in text))
        check(f"baseline-next:{filename}", "STEP010A" in text)
    active_docs = "\n".join(read_utf8(ROOT / filename) for filename in baseline_files)
    check("stale-step009-pending-zero", "STEP009 Windows live: `PENDING`" not in active_docs and "STEP009 Windows live is `PENDING`" not in active_docs)
    check(
        "windows-status-transition",
        "STEP010 Windows live" in active_docs
        and "246/247" in active_docs
        and "STEP010R1 Windows live" in active_docs
        and "PENDING" in active_docs,
    )

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    windows = (ROOT / "scripts/sh_run_step010_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in windows and b"\n" not in windows.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in windows)
    check("posix-launcher", (ROOT / "scripts/sh_run_step010_acceptance.sh").is_file())

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    suite_contract_ok = (
        ok
        and "OPENRILL_STEP001_SUITE_PASS unit_files=19 reporter=TAP" in output
        and "# tests 106" in output
        and "# pass 106" in output
        and "# fail 0" in output
        and "# skipped 0" in output
        and "OPENRILL_ARCHITECTURE_PASS packages=25" in output
        and "OPENRILL_PACKAGE_EXPORT_PASS packages=25" in output
    )
    check(
        "build-unit-architecture-exports",
        suite_contract_ok,
        "suite_pass" if suite_contract_ok else output[-8000:],
    )

    live_cases = (
        ("step006-ledger-regression", "run-step006-live.mjs", "OPENRILL_STEP006_LIVE_PASS schema=7 conversation=PERSISTED submission=IDEMPOTENT cancel=PASS restart=PASS"),
        ("step007-model-regression", "run-step007-live.mjs", "OPENRILL_STEP007_LIVE_PASS schema=7 provider=OPENAI_RESPONSES run=COMPLETED assistant=PERSISTED secret=POINT_OF_USE"),
        ("step008-workspace-regression", "run-step008-live.mjs", "OPENRILL_STEP008_LIVE_PASS schema=7 workspace=CONFINED tools=READ_WRITE_PATCH artifacts=3 modelCalls=4 toolCalls=3 unicode=PASS secret=POINT_OF_USE"),
        ("step009-approval-regression", "run-step009-live.mjs", "OPENRILL_STEP009_LIVE_PASS schema=7 approval=WAIT_RESUME decision=ALLOW_ONCE process=ARGV_FOREGROUND toolCalls=1 modelCalls=2 secret=POINT_OF_USE"),
        ("step010-skill-live", "run-step010-live.mjs", "OPENRILL_STEP010_LIVE_PASS schema=7 skills=DISCOVERED precedence=WORKSPACE_USER_BUNDLED snapshot=IMMUTABLE midRun=IGNORED nextRun=REFRESHED modelCalls=3 toolCalls=1 secret=POINT_OF_USE"),
    )
    for name, script, marker in live_cases:
        ok, output = run_utf8(["node", f"scripts/{script}"], cwd=ROOT)
        check(name, ok and marker in output, "live_pass" if ok else output[-8000:])

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [
        path
        for path in ROOT.rglob("*")
        if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})
    ]
    check("protected-payload-zero", not protected)
    report_text = read_utf8(REPORT) if REPORT.exists() else ""
    check("secret-value-not-reported", "Bearer " not in report_text and re.search(r"(?i)(api[_-]?key|secret)\s*[:=]\s*\S+", report_text) is None)

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
    lines.append(f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} skills=DISCOVERED snapshot=IMMUTABLE")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
