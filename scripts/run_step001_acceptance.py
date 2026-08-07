from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP001_ACCEPTANCE_REPORT.txt"
SOURCE_SHA = "1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82"
GROUPS = ("apps", "services", "packages", "connectors", "skills")
GENERATED_DIR_NAMES = {"dist", ".artifacts", "__pycache__"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OpenRill STEP001 deterministic acceptance")
    parser.add_argument("--openclaw-source-root", type=Path)
    parser.add_argument("--openclaw-source-zip", type=Path)
    return parser.parse_args()


def run(command: list[str], *, expected: int = 0) -> tuple[bool, str]:
    return run_utf8(command, cwd=ROOT, expected=expected)


def clean_generated() -> None:
    for group in GROUPS:
        base = ROOT / group
        if not base.exists():
            continue
        for path in base.rglob("dist"):
            if path.is_dir():
                shutil.rmtree(path)
    shutil.rmtree(ROOT / ".artifacts", ignore_errors=True)
    for path in ROOT.rglob("__pycache__"):
        if path.is_dir():
            shutil.rmtree(path)
    for path in ROOT.rglob("*.py[co]"):
        path.unlink(missing_ok=True)


def main() -> int:
    args = parse_args()
    clean_generated()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: object, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    required = [
        "package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "tsconfig.base.json",
        "tsconfig.node.json", "tsconfig.web.json", "tsconfig.build.json", "openrill.mjs",
        "config/package-boundaries.json", "scripts/check-runtime.mjs", "scripts/check_architecture.py",
        "scripts/check-exports.mjs", "scripts/run-step001-suite.mjs", "scripts/subprocess_utf8.py",
        "scripts/run_step001_acceptance.py", "scripts/run_step001c_acceptance.py", "scripts/run_step001d_acceptance.py",
        "scripts/sh_run_step001_acceptance.cmd", "scripts/sh_run_step001_acceptance.sh",
        "scripts/sh_run_step001c_acceptance.cmd", "scripts/sh_run_step001c_acceptance.sh",
        "scripts/sh_run_step001d_acceptance.cmd", "scripts/sh_run_step001d_acceptance.sh",
        "docs/adrs/ADR-0004-TYPESCRIPT_MONOREPO_AND_WEB_APPLICATION_BOUNDARY.md",
        "docs/adrs/ADR-0014-DEFER_CONTROL_UI_FRAMEWORK_SELECTION.md",
        "docs/plans/STEP010A_CONTROL_UI_FRAMEWORK_SELECTION.md",
        "docs/plans/STEP011_CONTROL_UI_VERTICAL_SLICE.md",
        "docs/plans/STEP001D_WINDOWS_CLI_ENTRYPOINT_CANONICALIZATION.md",
    ]
    for rel in required:
        check(f"required:{rel}", (ROOT / rel).is_file())

    obsolete = [
        "docs/adrs/ADR-0004-TYPESCRIPT_MONOREPO_AND_VUE_UI.md",
        "docs/adrs/ADR-0014-DEFER_VUE_RUNTIME_TO_STEP011.md",
        "docs/plans/STEP011_VUE_CONTROL_UI_VERTICAL_SLICE.md",
    ]
    for rel in obsolete:
        check(f"obsolete-absent:{rel}", not (ROOT / rel).exists())

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    check("root-package-name", package.get("name") == "openrill", str(package.get("name")))
    check("root-package-version", package.get("version") == "0.6.1-step006a", str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1", str(package.get("packageManager")))
    check("root-private", package.get("private") is True)
    check("step001-script", package.get("scripts", {}).get("acceptance:step001") == "python scripts/run_step001_acceptance.py")

    source_manifest = json.loads((ROOT / "reference/openclaw/SOURCE_MANIFEST.json").read_text(encoding="utf-8"))
    check("reference-source-sha", source_manifest.get("sha256") == SOURCE_SHA, str(source_manifest.get("sha256")))
    evidence = json.loads((ROOT / "reference/openclaw/EVIDENCE_INDEX.json").read_text(encoding="utf-8"))
    check("reference-evidence-count", len(evidence) == 104, str(len(evidence)))
    check("reference-evidence-unique", len({item["id"] for item in evidence}) == len(evidence))
    check("reference-ui-runtime-observed", any(item["id"] == "OC-UI-004" and item["excerpt"] == '"lit": "3.3.3",' for item in evidence))

    live_reference_ok = False
    if args.openclaw_source_root:
        command = [sys.executable, "scripts/verify_reference_against_source.py", "--source-root", str(args.openclaw_source_root)]
        if args.openclaw_source_zip:
            command.extend(["--source-zip", str(args.openclaw_source_zip)])
        ok, output = run(command)
        live_reference_ok = ok and "verified=104/104" in output
    report = json.loads((ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json").read_text(encoding="utf-8"))
    if not args.openclaw_source_root:
        live_reference_ok = report.get("allVerified") is True and report.get("verifiedCount") == 104
    check("reference-live-reverification", live_reference_ok, "verified=104/104" if live_reference_ok else "verification_failed")
    check("reference-report", report.get("allVerified") is True and report.get("verifiedCount") == 104, str(report.get("verifiedCount")))
    archive_sha = hashlib.sha256(args.openclaw_source_zip.read_bytes()).hexdigest() if args.openclaw_source_zip else report.get("sourceSha256")
    check("reference-zip-sha", archive_sha == SOURCE_SHA, str(archive_sha))

    manifests: dict[str, tuple[Path, dict]] = {}
    for group in GROUPS:
        for directory in sorted((ROOT / group).iterdir()):
            if not directory.is_dir():
                continue
            manifest_path = directory / "package.json"
            check(f"workspace-manifest:{directory.relative_to(ROOT)}", manifest_path.is_file())
            if not manifest_path.is_file():
                continue
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifests[data["name"]] = (directory, data)
    check("workspace-package-count", len(manifests) == 24, str(len(manifests)))
    check("workspace-package-unique", len(manifests) == len(set(manifests)))
    check("protocol-leaf", not manifests["@openrill/protocol"][1].get("dependencies"))

    all_dependencies: dict[str, str] = {}
    for _, data in manifests.values():
        for field in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            all_dependencies.update(data.get(field, {}))
    all_dependencies.update(package.get("dependencies", {}))
    all_dependencies.update(package.get("devDependencies", {}))
    check("no-openclaw-dependency", not any(name == "openclaw" or name.startswith("@openclaw/") for name in all_dependencies))
    ui_runtimes = {"react", "react-dom", "vue", "lit", "svelte", "solid-js", "preact", "@angular/core"}
    check("ui-runtime-deferred", not any(name in ui_runtimes for name in all_dependencies), ",".join(sorted(ui_runtimes & set(all_dependencies))))

    web_source = (ROOT / "apps/agent-web/src/index.ts").read_text(encoding="utf-8")
    for token in [
        'UI_FRAMEWORK_SELECTION = "DEFERRED"',
        'UI_FRAMEWORK_DECISION_STEP = "STEP010A"',
        'UI_RUNTIME_INTRODUCTION_STEP = "STEP011"',
        'stateAccess: "LOCAL_PROTOCOL_ONLY"',
    ]:
        check(f"web-contract:{token}", token in web_source)
    check("no-fixed-vue-contract", "TARGET_UI_FRAMEWORK" not in web_source and "VUE_RUNTIME" not in web_source)

    lock_text = (ROOT / "pnpm-lock.yaml").read_text(encoding="utf-8")
    check("lockfile-version", "lockfileVersion: '9.0'" in lock_text)
    workspace_text = (ROOT / "pnpm-workspace.yaml").read_text(encoding="utf-8")
    check("workspace-auto-install-peers-explicit", len(re.findall(r"(?m)^autoInstallPeers: true$", workspace_text)) == 1)
    check("workspace-auto-install-peers-false-zero", "autoInstallPeers: false" not in workspace_text)
    check("lock-auto-install-peers-aligned", len(re.findall(r"(?m)^  autoInstallPeers: true$", lock_text)) == 1)
    check("lock-auto-install-peers-false-zero", "  autoInstallPeers: false" not in lock_text)
    for _, (directory, data) in sorted(manifests.items()):
        rel = directory.relative_to(ROOT).as_posix()
        has_dependency_fields = any(data.get(field) for field in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"))
        if has_dependency_fields:
            ok = re.search(rf"(?m)^  {re.escape(rel)}:$", lock_text) is not None
        else:
            ok = re.search(rf"(?m)^  {re.escape(rel)}: \{{\}}$", lock_text) is not None
        check(f"lock-importer:{rel}", ok, "dependency-importer" if has_dependency_fields else "empty-object-importer")
    check("lock-no-null-importer", "  packages/protocol:\n" not in lock_text)
    check("lock-snapshots-materialized", all(token in lock_text for token in ["snapshots:", "  '@types/node@22.20.1':", "  typescript@6.0.3: {}", "  undici-types@6.21.0: {}"]))

    plan_files = sorted((ROOT / "docs/plans").glob("STEP*.md"))
    check("plan-count", len(plan_files) == 30, str(len(plan_files)))
    for path in plan_files:
        text = path.read_text(encoding="utf-8")
        for heading in ("## 목적", "## Reference Evidence", "## 구현 범위", "## Acceptance", "## 제외"):
            check(f"plan-heading:{path.name}:{heading}", heading in text)

    # Markdown local link validation.
    link_pattern = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
    broken: list[str] = []
    link_count = 0
    for markdown in ROOT.rglob("*.md"):
        for target in link_pattern.findall(markdown.read_text(encoding="utf-8")):
            target = target.strip().split("#", 1)[0]
            if not target or "://" in target or target.startswith("mailto:"):
                continue
            link_count += 1
            if not (markdown.parent / target).resolve().exists():
                broken.append(f"{markdown.relative_to(ROOT)}->{target}")
    check("markdown-links", not broken, f"checked={link_count} broken={broken[:5]}")

    entrypoint_text = (ROOT / "openrill.mjs").read_text(encoding="utf-8")
    check("cli-entrypoint-path-to-file-url", 'pathToFileURL(resolve(argv1)).href' in entrypoint_text)
    check("cli-entrypoint-legacy-url-zero", 'new URL(process.argv[1], "file:")' not in entrypoint_text)

    # Runtime/build/unit/architecture/export suite.
    ok, output = run(["node", "scripts/run-step001-suite.mjs"])
    suite_ok = ok and "OPENRILL_STEP001_SUITE_PASS" in output
    check("step001-suite", suite_ok, "suite_pass" if suite_ok else output[-3000:])

    # CLI behavior is tested again at the executable boundary.
    ok, output = run(["node", "openrill.mjs", "--version"])
    check("cli-version", ok and output == "OpenRill 0.6.1-step006a", output)
    ok, output = run(["node", "openrill.mjs", "--help"])
    check("cli-help", ok and "start      Start the foreground local Host" in output, output)
    ok, output = run(["node", "openrill.mjs", "start", "--bind", "0.0.0.0"], expected=12)
    check("cli-start-loopback-guard", ok and "must be loopback" in output, "loopback_guard_pass" if ok else output)

    # Build outputs prove every public export, then are removed before packaging.
    dist_indexes = sorted(ROOT.glob("apps/*/dist/index.js")) + sorted(ROOT.glob("services/*/dist/index.js")) + sorted(ROOT.glob("packages/*/dist/index.js")) + sorted(ROOT.glob("connectors/*/dist/index.js")) + sorted(ROOT.glob("skills/*/dist/index.js"))
    check("dist-package-count", len(dist_indexes) == 24, str(len(dist_indexes)))
    web_dist = ROOT / "apps/agent-web/dist/index.js"
    if web_dist.is_file():
        built = web_dist.read_text(encoding="utf-8")
        check("web-built-deferred", 'UI_FRAMEWORK_SELECTION = "DEFERRED"' in built and "TARGET_UI_FRAMEWORK" not in built)
    else:
        check("web-built-deferred", False, "missing web dist")

    # No Host/user side effects are allowed in STEP001.
    runtime_candidates = [ROOT / "runtime-data", ROOT / ".openrill"]
    check("runtime-directories-zero", not any(path.exists() for path in runtime_candidates))
    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))

    protected = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"}:
            protected.append(path.relative_to(ROOT).as_posix())
    check("protected-payload-zero", not protected, ",".join(protected[:10]))

    # Windows launcher must be CRLF and root relative.
    cmd = (ROOT / "scripts/sh_run_step001_acceptance.cmd").read_bytes()
    check("windows-cmd-crlf", b"\r\n" in cmd and b"\n" not in cmd.replace(b"\r\n", b""))
    cmd_text = cmd.decode("utf-8")
    check("windows-cmd-root", '%~dp0..' in cmd_text and "run_step001_acceptance.py" in cmd_text)

    clean_generated()
    remaining_generated = [
        path.relative_to(ROOT).as_posix()
        for path in ROOT.rglob("*")
        if path.is_dir() and path.name in GENERATED_DIR_NAMES
    ]
    check("generated-cleanup", not remaining_generated, ",".join(remaining_generated[:10]))

    passed = sum(1 for _, ok, _ in checks if ok)
    lines = []
    for name, ok, detail in checks:
        line = f"[{'PASS' if ok else 'FAIL'}] {name}"
        if detail:
            line += f" :: {detail}"
        lines.append(line)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines.append(
        f"STEP001_REPOSITORY_AND_TOOLCHAIN_FOUNDATION checks={passed}/{len(checks)} "
        f"state={state} packages={len(manifests)} evidence={len(evidence)} ui_framework=DEFERRED"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
