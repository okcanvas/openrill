from __future__ import annotations

import ast
import json
import re
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP008_ACCEPTANCE_REPORT.txt"
VERSION = "0.8.0-step008"
STEP = "STEP008_WORKSPACE_AND_FILE_TOOLS"
SCHEMA = 5


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
    check("step008-script", package.get("scripts", {}).get("acceptance:step008") == "python scripts/run_step008_acceptance.py")
    check("step008-package-script", "package_step008.py" in package.get("scripts", {}).get("package:step008", ""))

    required = [
        "packages/workspace/src/catalog.ts",
        "packages/workspace/src/path-policy.ts",
        "packages/tools-files/src/tools.ts",
        "packages/tools-files/src/io.ts",
        "packages/tools-files/src/artifacts.ts",
        "packages/tools-files/src/mutation-queue.ts",
        "packages/state/migrations/005_workspace_file_artifacts.sql",
        "packages/state/src/workspace-repository.ts",
        "services/agent-host/src/lifecycle.ts",
        "tests/unit/workspace-file-tools-step008.test.mjs",
        "scripts/run-step008-live.mjs",
        "scripts/run_step008_acceptance.py",
        "scripts/sh_run_step008_acceptance.cmd",
        "scripts/sh_run_step008_acceptance.sh",
        "scripts/package_step008.py",
        "docs/contracts/WORKSPACE.md",
        "docs/contracts/FILE_TOOLS.md",
        "docs/adrs/ADR-0024-WORKSPACE_RELATIVE_FILE_AUTHORITY.md",
        "docs/plans/STEP008_WORKSPACE_AND_FILE_TOOLS.md",
        "reference/openclaw/WORKSPACE_AND_FILE_TOOLS.md",
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
    check("workspace-package", "@openrill/workspace" in names)
    check("tools-files-package", "@openrill/tools-files" in names)
    check("no-openclaw-dependency", not any("openclaw" in json.dumps(json.loads(read_utf8(path)).get("dependencies", {})).lower() for path in package_manifests))

    manifest_generator = read_utf8(ROOT / "scripts/generate_package_manifest.py")
    manifest_verifier = read_utf8(ROOT / "scripts/verify_package_manifest.py")
    generated_manifest = json.loads(read_utf8(ROOT / "PACKAGE_MANIFEST.json"))
    for label, source in (("generator", manifest_generator), ("verifier", manifest_verifier)):
        check(f"package-manifest-{label}-step", f'STEP = "{STEP}"' in source)
        check(f"package-manifest-{label}-version", f'VERSION = "{VERSION}"' in source)
    check(
        "package-manifest-generated-identity",
        generated_manifest.get("step") == STEP and generated_manifest.get("version") == VERSION,
        f'{generated_manifest.get("step")} {generated_manifest.get("version")}',
    )

    lock = read_utf8(ROOT / "pnpm-lock.yaml")
    host_lock_section = lock.split("  services/agent-host:", 1)[1].split("  skills/builtin:", 1)[0]
    builtin_lock_section = lock.split("  skills/builtin:", 1)[1].split("\npackages:", 1)[0]
    check("lock-host-tools-files", "'@openrill/tools-files':" in host_lock_section)
    check("lock-builtin-no-tools-files", "'@openrill/tools-files':" not in builtin_lock_section)

    migrations = read_utf8(ROOT / "packages/state/src/migrations.ts")
    migration = read_utf8(ROOT / "packages/state/migrations/005_workspace_file_artifacts.sql")
    check("schema-version-five", "OPENRILL_STATE_SCHEMA_VERSION = 5" in migrations)
    for token in (
        "CREATE TABLE workspace_registrations",
        "canonical_root TEXT NOT NULL UNIQUE",
        "CREATE TABLE workspace_artifacts",
        "FOREIGN KEY (run_id) REFERENCES agent_runs",
        "FOREIGN KEY (attempt_id) REFERENCES run_attempts",
        "FOREIGN KEY (workspace_id) REFERENCES workspace_registrations",
    ):
        check(f"migration-contract:{token}", token in migration)

    workspace = read_utf8(ROOT / "packages/workspace/src/catalog.ts")
    policy = read_utf8(ROOT / "packages/workspace/src/path-policy.ts")
    for token in (
        "class WorkspaceCatalog",
        "realpath(configuredPath)",
        "WORKSPACE_DUPLICATE_ROOT",
        "WORKSPACE_SYMLINK_ESCAPE",
        "revalidateForWrite",
        "rootRevision: sha256(canonicalRoot)",
    ):
        check(f"workspace-contract:{token}", token in workspace)
    for token in (
        "posix.isAbsolute",
        "win32.isAbsolute",
        'segment === ".."',
        "WINDOWS_RESERVED",
        "DENIED_SEGMENTS",
        "SECRET_BASENAME.test(segment)",
    ):
        check(f"path-policy:{token}", token in policy)

    tools = read_utf8(ROOT / "packages/tools-files/src/tools.ts")
    exact_tools = [
        "workspace.list", "workspace.stat", "workspace.read",
        "workspace.search", "workspace.write", "workspace.patch",
    ]
    for tool in exact_tools:
        check(f"tool:{tool}", f'name: "{tool}"' in tools)
    check("tool-count-source", len(re.findall(r'name: "workspace\.(?:list|stat|read|search|write|patch)"', tools)) == 6)
    for token in (
        "maxFileBytes",
        "maxReadBytes",
        "maxReadLines",
        "maxSearchFiles",
        "maxSearchMatches",
        "WORKSPACE_BINARY_FILE_DENIED",
        "WORKSPACE_PATCH_CONFLICT",
        "withWorkspaceFileMutation",
    ):
        check(f"tool-contract:{token}", token in tools or token in read_utf8(ROOT / "packages/tools-files/src/text.ts"))

    io = read_utf8(ROOT / "packages/tools-files/src/io.ts")
    for token in (
        'open(temp, "wx"',
        "handle.sync()",
        "revalidateForWrite",
        "assertExpectedRevision(latest",
        "rename(temp, input.path.absolutePath)",
        "fsyncDirectoryBestEffort",
        "rm(temp, { force: true })",
    ):
        check(f"atomic-write:{token}", token in io)
    check("no-implicit-parent-mkdir", "mkdir(parent" not in io)

    mutation = read_utf8(ROOT / "packages/tools-files/src/mutation-queue.ts")
    check("mutation-realpath-key", "return await realpath(absolute)" in mutation)
    check("mutation-tail-map", "mutationTails" in mutation and "previous.catch" in mutation)
    check("mutation-cleanup", "mutationTails.delete(key)" in mutation)

    artifacts = read_utf8(ROOT / "packages/tools-files/src/artifacts.ts")
    check("artifact-root-owned", "await mkdir(options.rootDirectory, { recursive: true" in artifacts)
    check("artifact-immutable-dir", "await mkdir(directory, { recursive: false" in artifacts)
    check("artifact-partial-cleanup", "await rm(directory, { recursive: true, force: true })" in artifacts)

    repository = read_utf8(ROOT / "packages/state/src/workspace-repository.ts")
    for token in ("upsertWorkspace", "insertArtifact", "listArtifacts"):
        check(f"workspace-repository:{token}", token in repository)
    lifecycle = read_utf8(ROOT / "services/agent-host/src/lifecycle.ts")
    for token in (
        "createWorkspaceCatalog",
        "repositories.workspaces.upsertWorkspace",
        "createWorkspaceArtifactStore",
        "registerWorkspaceFileTools",
        "repositories.workspaces.insertArtifact",
    ):
        check(f"host-integration:{token}", token in lifecycle)

    step008_live_source = read_utf8(ROOT / "scripts/run-step008-live.mjs")
    check(
        "live-secret-runtime-generated",
        'randomBytes(32)' in step008_live_source
        and re.search(r'const\s+secretValue\s*=\s*["\']', step008_live_source) is None,
    )

    state_test = read_utf8(ROOT / "tests/unit/state-step005.test.mjs")
    check("migration-sequence-derived", "Array.from({ length: OPENRILL_STATE_SCHEMA_VERSION }" in state_test)
    check("future-version-derived", "OPENRILL_STATE_SCHEMA_VERSION + 1" in state_test)
    check("identity-version-derived", "schemaVersion: OPENRILL_STATE_SCHEMA_VERSION" in state_test)
    check("stale-schema-four-test-zero", "schemaVersion: 4" not in state_test)

    verifier = read_utf8(ROOT / "scripts/verify_reference_against_source.py")
    check("evidence-symmetric-normalization", 'expected_excerpt = str(item["excerpt"]).strip()' in verifier and "actual_excerpt = raw.strip()" in verifier)
    evidence = json.loads(read_utf8(ROOT / "reference/openclaw/EVIDENCE_INDEX.json"))
    evidence_report = json.loads(read_utf8(ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json"))
    check("evidence-count", len(evidence) == 118, str(len(evidence)))
    check("evidence-report", evidence_report.get("allVerified") is True and evidence_report.get("verifiedCount") == 118, str(evidence_report.get("verifiedCount")))
    for evidence_id in ("OC-FILE-001", "OC-FILE-002", "OC-FILE-003", "OC-FILE-004", "OC-FILE-005"):
        check(f"evidence:{evidence_id}", any(item.get("id") == evidence_id for item in evidence))

    issue_registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    for number in range(1, 20):
        check(f"issue-registry:OR-ISSUE-{number:03d}", f"OR-ISSUE-{number:03d}" in issue_registry)
    issue_files = [
        "STEP008_BASELINE_DOCUMENT_DRIFT.md",
        "STEP008_ARTIFACT_ROOT_INITIALIZATION_FAILURE.md",
        "STEP008_SCHEMA_DERIVED_EXPECTATION_GAP.md",
        "STEP008_REFERENCE_EVIDENCE_WHITESPACE_NORMALIZATION.md",
        "STEP008_SAME_FILE_MUTATION_SERIALIZATION.md",
        "STEP008_PACKAGE_MANIFEST_RELEASE_IDENTITY_DRIFT.md",
        "STEP008_SYNTHETIC_SECRET_FIXTURE_LITERAL.md",
    ]
    for filename in issue_files:
        text = read_utf8(ROOT / "reference/validation" / filename)
        check(f"issue-detail:{filename}", all(heading in text for heading in ("## Exact symptom", "## Code-confirmed root cause", "## Impact", "## Fix", "## Recurrence-prevention gate")))
    for heading in (
        "### Baseline document coherence",
        "### Artifact store ownership",
        "### Same-file mutation concurrency",
        "### Reference evidence normalization",
        "### Package manifest release identity",
        "### Synthetic secret fixtures",
    ):
        check(f"recurrence:{heading}", heading in recurrence)

    plan = read_utf8(ROOT / "docs/plans/STEP008_WORKSPACE_AND_FILE_TOOLS.md")
    for heading in (
        "## 목적", "## 기준선", "## Reference Evidence", "## OpenClaw 문제 분석",
        "## 구현 범위", "## 공개 계약", "## 상태 전이", "## 실패 및 복구",
        "## Acceptance", "## 반복 방지 기록", "## 패키징 산출물", "## 제외", "## 완료 선언",
    ):
        check(f"plan-heading:{heading}", heading in plan)

    baseline_files = ["README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"]
    for filename in baseline_files:
        text = read_utf8(ROOT / filename)
        check(f"baseline-step:{filename}", "STEP008_WORKSPACE_AND_FILE_TOOLS" in text or "STEP008" in text)
        check(f"baseline-version:{filename}", VERSION in text or filename == "ROADMAP.md")
        check(f"baseline-previous-windows:{filename}", "STEP007" in text and ("ACCEPTED" in text or "accepted" in text))
        check(f"baseline-next:{filename}", "STEP009" in text or filename == "VALIDATION.md")
    active_docs = "\n".join(read_utf8(ROOT / filename) for filename in baseline_files)
    check("stale-step007-pending-zero", "Windows STEP007 acceptance: PENDING" not in active_docs and "STEP007 Windows live: `PENDING`" not in active_docs)
    check("step008-windows-pending", "STEP008 Windows live" in active_docs and "PENDING" in active_docs)

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    windows = (ROOT / "scripts/sh_run_step008_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in windows and b"\n" not in windows.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in windows)
    check("posix-launcher", (ROOT / "scripts/sh_run_step008_acceptance.sh").is_file())

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    check(
        "build-unit-architecture-exports",
        ok
        and "OPENRILL_STEP001_SUITE_PASS unit_files=17 reporter=TAP" in output
        and "# tests 83" in output
        and "# pass 83" in output
        and "# fail 0" in output
        and "OPENRILL_ARCHITECTURE_PASS packages=25" in output
        and "OPENRILL_PACKAGE_EXPORT_PASS packages=25" in output,
        "suite_pass" if ok else output[-8000:],
    )
    ok, output = run_utf8(["node", "scripts/run-step006-live.mjs"], cwd=ROOT)
    check("step006-ledger-regression", ok and "OPENRILL_STEP006_LIVE_PASS schema=5 conversation=PERSISTED submission=IDEMPOTENT cancel=PASS restart=PASS" in output, "step006_pass" if ok else output[-8000:])
    ok, output = run_utf8(["node", "scripts/run-step007-live.mjs"], cwd=ROOT)
    check("step007-model-regression", ok and "OPENRILL_STEP007_LIVE_PASS schema=5 provider=OPENAI_RESPONSES run=COMPLETED assistant=PERSISTED secret=POINT_OF_USE" in output, "step007_pass" if ok else output[-8000:])
    ok, output = run_utf8(["node", "scripts/run-step008-live.mjs"], cwd=ROOT)
    check("step008-live-process", ok and "OPENRILL_STEP008_LIVE_PASS schema=5 workspace=CONFINED tools=READ_WRITE_PATCH artifacts=3 modelCalls=4 toolCalls=3 unicode=PASS secret=POINT_OF_USE" in output, "live_pass" if ok else output[-8000:])

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [
        path for path in ROOT.rglob("*")
        if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})
    ]
    check("protected-payload-zero", not protected)
    report_text = read_utf8(REPORT) if REPORT.exists() else ""
    check("secret-value-not-reported", "Bearer " not in report_text and ("OPENRILL_STEP008_API_" + "KEY=") not in report_text)

    clean()
    generated = [
        path for path in ROOT.rglob("*")
        if "node_modules" not in path.relative_to(ROOT).parts
        and any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)
    ]
    check("generated-cleanup", not generated, json.dumps([str(path.relative_to(ROOT)) for path in generated[:20]]))

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, outcome, detail in checks]
    lines.append(f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} workspace=CONFINED tools=6 artifacts=DURABLE")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
