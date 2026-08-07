from __future__ import annotations

import json
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP002A_ACCEPTANCE_REPORT.txt"
VERSION = "0.6.1-step006a"
STEP = "STEP002A_TYPESCRIPT6_EXPLICIT_NODE_TYPES"


def clean_generated() -> None:
    for group in ("apps", "services", "packages", "connectors", "skills"):
        for path in (ROOT / group).glob("*/dist"):
            shutil.rmtree(path, ignore_errors=True)
    shutil.rmtree(ROOT / ".artifacts", ignore_errors=True)
    for path in ROOT.rglob("__pycache__"):
        shutil.rmtree(path, ignore_errors=True)
    for path in ROOT.rglob("*.py[co]"):
        path.unlink(missing_ok=True)


def main() -> int:
    clean_generated()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: object, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1", str(package.get("packageManager")))
    check("typescript-version", package.get("devDependencies", {}).get("typescript") == "6.0.3", str(package.get("devDependencies", {}).get("typescript")))
    check("node-types-version", package.get("devDependencies", {}).get("@types/node") == "22.20.1", str(package.get("devDependencies", {}).get("@types/node")))
    check("step002a-script", package.get("scripts", {}).get("acceptance:step002a") == "python scripts/run_step002a_acceptance.py")
    check("step002a-package-script", "package_step002a.py" in package.get("scripts", {}).get("package:step002a", ""))

    required = [
        "tsconfig.base.json",
        "tsconfig.node.json",
        "tsconfig.web.json",
        "tests/unit/typescript-environment.test.mjs",
        "scripts/run_step002a_acceptance.py",
        "scripts/sh_run_step002a_acceptance.cmd",
        "scripts/sh_run_step002a_acceptance.sh",
        "scripts/package_step002a.py",
        "docs/plans/STEP002A_TYPESCRIPT6_EXPLICIT_NODE_TYPES.md",
        "docs/adrs/ADR-0015-EXPLICIT_TYPESCRIPT_RUNTIME_TYPES.md",
    ]
    for rel in required:
        check(f"required:{rel}", (ROOT / rel).is_file())

    base = json.loads((ROOT / "tsconfig.base.json").read_text(encoding="utf-8"))
    node = json.loads((ROOT / "tsconfig.node.json").read_text(encoding="utf-8"))
    web = json.loads((ROOT / "tsconfig.web.json").read_text(encoding="utf-8"))
    check("base-types-explicit-empty", base.get("compilerOptions", {}).get("types") == [], json.dumps(base.get("compilerOptions", {}).get("types")))
    check("node-types-explicit-node", node.get("compilerOptions", {}).get("types") == ["node"], json.dumps(node.get("compilerOptions", {}).get("types")))
    check("web-types-explicit-empty", web.get("compilerOptions", {}).get("types") == [], json.dumps(web.get("compilerOptions", {}).get("types")))
    check("node-config-extends-base", node.get("extends") == "./tsconfig.base.json", str(node.get("extends")))
    check("web-config-extends-base", web.get("extends") == "./tsconfig.base.json", str(web.get("extends")))
    check("web-dom-lib", "DOM" in web.get("compilerOptions", {}).get("lib", []))
    check("base-node-types-zero", "node" not in base.get("compilerOptions", {}).get("types", []))
    check("web-node-types-zero", "node" not in web.get("compilerOptions", {}).get("types", []))

    workspace_configs: list[Path] = []
    for pattern in ("apps/*/tsconfig.json", "services/*/tsconfig.json", "packages/*/tsconfig.json", "connectors/*/tsconfig.json", "skills/*/tsconfig.json"):
        workspace_configs.extend(ROOT.glob(pattern))
    node_configs: list[str] = []
    web_configs: list[str] = []
    overrides: list[str] = []
    for path in sorted(workspace_configs):
        data = json.loads(path.read_text(encoding="utf-8"))
        rel = path.relative_to(ROOT).as_posix()
        extends = data.get("extends")
        if extends == "../../tsconfig.node.json":
            node_configs.append(rel)
        elif extends == "../../tsconfig.web.json":
            web_configs.append(rel)
        if "types" in data.get("compilerOptions", {}):
            overrides.append(rel)
    check("workspace-tsconfig-count", len(workspace_configs) == 24, str(len(workspace_configs)))
    check("node-workspace-count", len(node_configs) == 23, str(len(node_configs)))
    check("web-workspace-count", web_configs == ["apps/agent-web/tsconfig.json"], json.dumps(web_configs))
    check("workspace-types-overrides-zero", not overrides, json.dumps(overrides))

    node_sensitive: list[str] = []
    misclassified: list[str] = []
    tokens = ('from "node:', "from 'node:", "process.", "NodeJS.", "setImmediate(", "Buffer.")
    for config_path in sorted(workspace_configs):
        package_dir = config_path.parent
        sources = sorted((package_dir / "src").rglob("*.ts")) if (package_dir / "src").is_dir() else []
        sensitive = any(any(token in path.read_text(encoding="utf-8") for token in tokens) for path in sources)
        if sensitive:
            rel = package_dir.relative_to(ROOT).as_posix()
            node_sensitive.append(rel)
            data = json.loads(config_path.read_text(encoding="utf-8"))
            if data.get("extends") != "../../tsconfig.node.json":
                misclassified.append(rel)
    check("node-sensitive-workspaces-present", set(node_sensitive) >= {"services/agent-host", "apps/agent-cli"}, json.dumps(node_sensitive))
    check("node-sensitive-workspaces-classified", not misclassified, json.dumps(misclassified))
    web_sources = "\n".join(path.read_text(encoding="utf-8") for path in sorted((ROOT / "apps/agent-web/src").rglob("*.ts")))
    check("web-node-global-leak-zero", not any(token in web_sources for token in tokens))

    lock = (ROOT / "pnpm-lock.yaml").read_text(encoding="utf-8")
    check("lock-node-types-importer", "'@types/node':\n        specifier: 22.20.1\n        version: 22.20.1" in lock)
    check("lock-node-types-snapshot", "'@types/node@22.20.1':" in lock)
    check("lock-typescript-snapshot", "typescript@6.0.3: {}" in lock)

    tsc_entry = ROOT / "node_modules/typescript/bin/tsc"
    check("local-typescript-installed", tsc_entry.is_file(), "installed" if tsc_entry.is_file() else "pnpm install required")
    if tsc_entry.is_file():
        ok, output = run_utf8(["node", str(tsc_entry), "--showConfig", "-p", "services/agent-host/tsconfig.json"], cwd=ROOT)
        try:
            effective_host = json.loads(output) if ok else {}
        except json.JSONDecodeError:
            effective_host = {}
        host_effective_ok = ok and effective_host.get("compilerOptions", {}).get("types") == ["node"]
        check("effective-host-node-types", host_effective_ok, "node" if host_effective_ok else output[-1000:])
        ok, output = run_utf8(["node", str(tsc_entry), "--showConfig", "-p", "apps/agent-web/tsconfig.json"], cwd=ROOT)
        try:
            effective_web = json.loads(output) if ok else {}
        except json.JSONDecodeError:
            effective_web = {}
        web_effective_ok = ok and effective_web.get("compilerOptions", {}).get("types") == []
        check("effective-web-types-empty", web_effective_ok, "empty" if web_effective_ok else output[-1000:])
    else:
        check("effective-host-node-types", False, "pnpm install required")
        check("effective-web-types-empty", False, "pnpm install required")

    plan = (ROOT / "docs/plans/STEP002A_TYPESCRIPT6_EXPLICIT_NODE_TYPES.md").read_text(encoding="utf-8")
    for heading in (
        "## 목적", "## 기준선", "## Reference Evidence", "## 원인", "## 구현 범위", "## 공개 계약",
        "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 패키징 산출물", "## 제외",
    ):
        check(f"step002a-heading:{heading}", heading in plan)
    check("plan-typescript6-default", "TypeScript 6" in plan and 'types: ["node"]' in plan)

    cmd = (ROOT / "scripts/sh_run_step002a_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd and b"\n" not in cmd.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd and b"run_step002a_acceptance.py" in cmd)
    check("posix-launcher", (ROOT / "scripts/sh_run_step002a_acceptance.sh").is_file())

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    check("build-unit-architecture-exports", ok and "OPENRILL_STEP001_SUITE_PASS" in output, "suite_pass" if ok else output[-5000:])

    ok, output = run_utf8(["python", "scripts/run_step002_acceptance.py"], cwd=ROOT)
    check("step002-regression", ok and "checks=97/97 state=PASSED" in output, "step002_pass" if ok else output[-5000:])

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json"} for path in ROOT.rglob("*")))
    protected = [path for path in ROOT.rglob("*") if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})]
    check("protected-payload-zero", not protected, ",".join(path.name for path in protected[:5]))

    clean_generated()
    check("generated-cleanup", not any(part in {"dist", ".artifacts", "__pycache__"} for path in ROOT.rglob("*") for part in path.relative_to(ROOT).parts))

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
        "node_types=EXPLICIT web_node_types=DENIED typescript6=SUPPORTED"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
