from __future__ import annotations

import json
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP003_ACCEPTANCE_REPORT.txt"
VERSION = "0.6.1-step006a"
STEP = "STEP003_CONFIG_SNAPSHOT_AND_SECRET_REFERENCES"
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
        "apps/*/package.json",
        "services/*/package.json",
        "packages/*/package.json",
        "connectors/*/package.json",
        "skills/*/package.json",
    ):
        result.extend(ROOT.glob(pattern))
    return result


def main() -> int:
    clean_generated()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: object, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1", str(package.get("packageManager")))
    check("typescript-version", package.get("devDependencies", {}).get("typescript") == "6.0.3")
    check("step003-script", package.get("scripts", {}).get("acceptance:step003") == "python scripts/run_step003_acceptance.py")
    check("step003-package-script", "package_step003.py" in package.get("scripts", {}).get("package:step003", ""))

    required = [
        "packages/config/src/errors.ts",
        "packages/config/src/types.ts",
        "packages/config/src/yaml-subset.ts",
        "packages/config/src/schema.ts",
        "packages/config/src/canonical.ts",
        "packages/config/src/includes.ts",
        "packages/config/src/secrets.ts",
        "packages/config/src/io.ts",
        "config/schema/openrill-config-v1.schema.json",
        "config/examples/minimal.agent.yaml",
        "config/examples/provider.agent.yaml",
        "config/examples/include.agent.yaml",
        "config/examples/shared.yaml",
        "tests/unit/config-step003.test.mjs",
        "tests/unit/cli-step003.test.mjs",
        "scripts/run-step003-live.mjs",
        "scripts/run_step003_acceptance.py",
        "scripts/sh_run_step003_acceptance.cmd",
        "scripts/sh_run_step003_acceptance.sh",
        "scripts/package_step003.py",
        "docs/contracts/CONFIG.md",
        "docs/security/SECRETS.md",
        "docs/plans/STEP003_CONFIG_SNAPSHOT_AND_SECRET_REFERENCES.md",
        "docs/adrs/ADR-0017-CONFIG_SOURCE_SNAPSHOT_AND_SECRET_REFERENCE_BOUNDARY.md",
        "reference/openclaw/CONFIG.md",
    ]
    for rel in required:
        check(f"required:{rel}", (ROOT / rel).is_file())

    all_manifests = manifests()
    versions = {json.loads(path.read_text(encoding="utf-8")).get("version") for path in all_manifests}
    check("manifest-count", len(all_manifests) == 25, str(len(all_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))

    base_config = (ROOT / "packages/config/src/index.ts").read_text(encoding="utf-8")
    types_source = (ROOT / "packages/config/src/types.ts").read_text(encoding="utf-8")
    yaml_source = (ROOT / "packages/config/src/yaml-subset.ts").read_text(encoding="utf-8")
    schema_source = (ROOT / "packages/config/src/schema.ts").read_text(encoding="utf-8")
    include_source = (ROOT / "packages/config/src/includes.ts").read_text(encoding="utf-8")
    secret_source = (ROOT / "packages/config/src/secrets.ts").read_text(encoding="utf-8")
    io_source = (ROOT / "packages/config/src/io.ts").read_text(encoding="utf-8")
    cli_source = (ROOT / "apps/agent-cli/src/index.ts").read_text(encoding="utf-8")

    for token in (
        "resolveConfigPaths",
        '"agent.yaml"',
        '"materialized.json"',
        '"last-known-good.json"',
        '"config.mutation.lock"',
        '"secrets"',
    ):
        check(f"config-path-contract:{token}", token in base_config)

    for token in (
        'export const OPENRILL_CONFIG_VERSION = 1',
        'export type SecretReferenceKind = "env" | "file" | "os"',
        'export type ConfigRecoveryMode = "SOURCE" | "LAST_KNOWN_GOOD" | "DEFAULTS"',
        'event: "config.write"',
    ):
        check(f"config-type-contract:{token}", token in types_source)

    for token in (
        "parseOpenRillYaml",
        "stringifyOpenRillYaml",
        "tabs are not allowed",
        "YAML directives, document markers, tags, anchors, and aliases are not supported",
        "duplicate key:",
        "ambiguous boolean",
    ):
        check(f"yaml-contract:{token}", token in yaml_source)

    for token in (
        "validateAndMaterializeConfig",
        "ConfigFutureVersionError",
        "unknown configuration key",
        "modelProviders",
        "workspaces",
        'approvalMode: "ask"',
    ):
        check(f"schema-contract:{token}", token in schema_source)

    check("include-depth-limit", "maxDepth: 8" in include_source)
    check("include-file-limit", "maxFiles: 32" in include_source)
    check("include-byte-limit", "maxTotalBytes: 512 * 1024" in include_source)
    check("include-cycle-guard", '"CONFIG_INCLUDE_CYCLE"' in include_source)
    check("include-escape-guard", '"CONFIG_INCLUDE_ESCAPE"' in include_source)
    check("include-realpath-guard", "realpath" in include_source)
    check("include-revision", "sourceRevision" in include_source and "sha256Text" in include_source)

    for token in (
        "inspectSecretReference",
        "resolveSecretReference",
        "collectSecretStatuses",
        "redactSecretReferences",
        'reference.kind === "env"',
        'reference.kind === "file"',
        'record.kind === "os"',
        '"<redacted>"',
    ):
        check(f"secret-contract:{token}", token in secret_source)

    for token in (
        'open(temporary, "wx", 0o600)',
        "handle.sync()",
        "rename(temporary, path)",
        "persistValidSnapshot",
        "readLastKnownGood",
        'recovery: "LAST_KNOWN_GOOD"',
        'open(paths.mutationLockPath, "wx", 0o600)',
        "ConfigRevisionConflictError",
        "candidatePath",
        "post-commit verification failed; previous source was restored",
        "appendMutationJournal",
    ):
        check(f"io-contract:{token}", token in io_source)

    for token in (
        '"config"',
        'action !== "path" && action !== "validate" && action !== "show" && action !== "init"',
        "config output is redacted",
        "loadOpenRillConfig",
        "writeOpenRillConfig",
        "config startup validation failed",
        "configRevision",
        "configRecovery",
    ):
        check(f"cli-config-contract:{token}", token in cli_source)

    schema = json.loads((ROOT / "config/schema/openrill-config-v1.schema.json").read_text(encoding="utf-8"))
    check("json-schema-closed-root", schema.get("additionalProperties") is False)
    check("json-schema-version-one", schema.get("properties", {}).get("version", {}).get("const") == 1)
    check("json-schema-root-keys", set(schema.get("properties", {})) == {"version", "include", "host", "modelProviders", "workspaces", "execution", "skills", "automation", "ui"})
    check("json-schema-secret-ref", set(schema.get("$defs", {}).get("secretRef", {}).get("properties", {}).get("kind", {}).get("enum", [])) == {"env", "file", "os"})
    check("json-schema-loopback", set(schema.get("properties", {}).get("host", {}).get("properties", {}).get("bind", {}).get("enum", [])) == {"127.0.0.1", "::1", "localhost"})

    unit_source = (ROOT / "tests/unit/config-step003.test.mjs").read_text(encoding="utf-8")
    cli_test_source = (ROOT / "tests/unit/cli-step003.test.mjs").read_text(encoding="utf-8")
    for token in (
        "closed YAML subset parses a real config",
        "closed schema rejects unknown keys, literal secrets, and future versions",
        "includes are root-contained, recursive, bounded, and cycle-safe",
        "atomic writes create materialized and last-known-good snapshots without secret values",
        "optimistic source revision detects concurrent writes",
        "parse and schema failures recover from LKG",
        "resolve only at point of use",
    ):
        check(f"unit-contract:{token}", token in unit_source)
    check("cli-unit-contract", "config init, validate, show, and duplicate init are closed and redacted" in cli_test_source)

    evidence = json.loads((ROOT / "reference/openclaw/EVIDENCE_INDEX.json").read_text(encoding="utf-8"))
    report = json.loads((ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json").read_text(encoding="utf-8"))
    check("evidence-count", len(evidence) == EXPECTED_EVIDENCE, str(len(evidence)))
    check("evidence-report-count", report.get("verifiedCount") == EXPECTED_EVIDENCE, str(report.get("verifiedCount")))
    check("evidence-report-state", report.get("allVerified") is True, str(report.get("allVerified")))
    evidence_ids = {item.get("id") for item in evidence}
    for evidence_id in ("OC-CONFIG-007", "OC-CONFIG-008", "OC-CONFIG-009", "OC-CONFIG-010", "OC-CONFIG-011", "OC-CONFIG-012"):
        check(f"evidence:{evidence_id}", evidence_id in evidence_ids)

    plan = (ROOT / "docs/plans/STEP003_CONFIG_SNAPSHOT_AND_SECRET_REFERENCES.md").read_text(encoding="utf-8")
    for heading in (
        "## 목적", "## 기준선", "## Reference Evidence", "## OpenClaw 문제 분석", "## 구현 범위",
        "## 파일·영속성 구조", "## YAML 계약", "## Include 계약", "## Schema 계약", "## SecretRef 계약",
        "## Revision 계약", "## Atomic write", "## 상태 전이", "## 실패 및 복구", "## Acceptance",
        "## 패키징 산출물", "## 제외", "## 완료 선언",
    ):
        check(f"step003-heading:{heading}", heading in plan)

    cmd = (ROOT / "scripts/sh_run_step003_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd and b"\n" not in cmd.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd and b"run_step003_acceptance.py" in cmd)
    check("posix-launcher", (ROOT / "scripts/sh_run_step003_acceptance.sh").is_file())

    ok, output = run_utf8(["python", "scripts/run_step002b_acceptance.py"], cwd=ROOT)
    check("step002b-regression", ok and "checks=60/60 state=PASSED" in output, "step002b_pass" if ok else output[-6000:])

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    check("build-unit-architecture-exports", ok and "OPENRILL_STEP001_SUITE_PASS unit_files=14 reporter=TAP" in output and "# tests 65" in output and "# pass 65" in output and "# fail 0" in output, "suite_pass" if ok else output[-6000:])

    ok, output = run_utf8(["node", "scripts/run-step003-live.mjs"], cwd=ROOT)
    check("step003-live-process", ok and "OPENRILL_STEP003_LIVE_PASS" in output, "live_pass" if ok else output[-6000:])

    ok, output = run_utf8(["node", "openrill.mjs", "--version"], cwd=ROOT)
    check("cli-version-live", ok and output.strip() == f"OpenRill {VERSION}", output.strip())
    ok, output = run_utf8(["node", "openrill.mjs", "--help"], cwd=ROOT)
    check("cli-help-config-live", ok and "config validate" in output and "config output is redacted" in output, "help_pass" if ok else output[-2000:])

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [
        path for path in ROOT.rglob("*")
        if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})
    ]
    check("protected-payload-zero", not protected, ",".join(path.name for path in protected[:5]))
    example_payloads = "\n".join(path.read_text(encoding="utf-8") for path in sorted((ROOT / "config/examples").glob("*.yaml")))
    check("example-literal-secret-zero", "actual-secret-value" not in example_payloads and "sk-" not in example_payloads)

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
        "source=YAML_SUBSET snapshot=MATERIALIZED_LKG secrets=REFERENCES_ONLY write=ATOMIC_REVISIONED"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
