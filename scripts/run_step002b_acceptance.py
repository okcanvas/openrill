from __future__ import annotations

import json
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP002B_ACCEPTANCE_REPORT.txt"
VERSION = "0.6.1-step006a"
STEP = "STEP002B_CROSS_PLATFORM_PROFILE_PATH_SEMANTICS"


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
    check("step002b-script", package.get("scripts", {}).get("acceptance:step002b") == "python scripts/run_step002b_acceptance.py")
    check("step002b-package-script", "package_step002b.py" in package.get("scripts", {}).get("package:step002b", ""))

    required = [
        "packages/config/src/index.ts",
        "tests/unit/profile-paths.test.mjs",
        "scripts/run_step002b_acceptance.py",
        "scripts/sh_run_step002b_acceptance.cmd",
        "scripts/sh_run_step002b_acceptance.sh",
        "scripts/package_step002b.py",
        "docs/plans/STEP002B_CROSS_PLATFORM_PROFILE_PATH_SEMANTICS.md",
        "docs/adrs/ADR-0016-TARGET_PLATFORM_PATH_SEMANTICS.md",
        "reference/validation/STEP002A_WINDOWS_PROFILE_PATH_FAILURE.md",
    ]
    for rel in required:
        check(f"required:{rel}", (ROOT / rel).is_file())

    manifests = [ROOT / "package.json"]
    for pattern in ("apps/*/package.json", "services/*/package.json", "packages/*/package.json", "connectors/*/package.json", "skills/*/package.json"):
        manifests.extend(ROOT.glob(pattern))
    versions = {json.loads(path.read_text(encoding="utf-8")).get("version") for path in manifests}
    check("manifest-count", len(manifests) == 25, str(len(manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))

    source = (ROOT / "packages/config/src/index.ts").read_text(encoding="utf-8")
    check("config-imports-posix-win32", 'import { posix, win32 } from "node:path";' in source)
    check("config-bare-resolve-import-zero", 'import { resolve } from "node:path";' not in source)
    check("config-platform-selector", 'platform === "win32" ? win32 : posix' in source)
    check("config-selected-resolve-data", "pathSemantics.resolve(dataBase, profile)" in source)
    check("config-selected-resolve-config", "pathSemantics.resolve(configBase, profile)" in source)
    check("config-selected-resolve-runtime", 'pathSemantics.resolve(dataRoot, "runtime")' in source)
    check("config-selected-resolve-lock", 'pathSemantics.resolve(runtimeDir, "host.lock")' in source)
    check("config-selected-resolve-metadata", 'pathSemantics.resolve(runtimeDir, "host.json")' in source)
    check("config-host-platform-default", "options.platform ?? process.platform" in source)

    test_source = (ROOT / "tests/unit/profile-paths.test.mjs").read_text(encoding="utf-8")
    for token in (
        "explicit platform selects path semantics independently of the host OS",
        'platform: "win32"',
        'platform: "linux"',
        'platform: "darwin"',
        "C:\\\\Local\\\\OpenRill\\\\alpha\\\\runtime",
        "/home/test/.local/share/openrill/alpha/runtime",
        "D:\\\\OpenRillData\\\\beta\\\\runtime",
        "/srv/openrill-data/beta/runtime",
    ):
        check(f"profile-test-contract:{token}", token in test_source)

    plan = (ROOT / "docs/plans/STEP002B_CROSS_PLATFORM_PROFILE_PATH_SEMANTICS.md").read_text(encoding="utf-8")
    for heading in (
        "## 목적", "## 기준선", "## Reference Evidence", "## 원인", "## 구현 범위", "## 공개 계약",
        "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 패키징 산출물", "## 제외",
    ):
        check(f"step002b-heading:{heading}", heading in plan)
    check("plan-exact-windows-failure", "D:\\home\\test\\.local\\share\\openrill\\alpha\\runtime" in plan)
    check("plan-target-path-contract", "path.win32" in plan and "path.posix" in plan)

    cmd = (ROOT / "scripts/sh_run_step002b_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd and b"\n" not in cmd.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd and b"run_step002b_acceptance.py" in cmd)
    check("posix-launcher", (ROOT / "scripts/sh_run_step002b_acceptance.sh").is_file())

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    check("build-unit-architecture-exports", ok and "OPENRILL_STEP001_SUITE_PASS" in output, "suite_pass" if ok else output[-5000:])

    if ok:
        script = r'''
import { resolveProfilePaths } from "./packages/config/dist/index.js";
const win = resolveProfilePaths({profile:"alpha",platform:"win32",homeDir:"C:/Users/test",env:{LOCALAPPDATA:"C:/Local",APPDATA:"C:/Roaming"}});
const unix = resolveProfilePaths({profile:"alpha",platform:"linux",homeDir:"/home/test",env:{}});
const winOverride = resolveProfilePaths({profile:"beta",platform:"win32",homeDir:"C:/Users/test",env:{OPENRILL_DATA_ROOT:"D:/OpenRillData",OPENRILL_CONFIG_ROOT:"E:/OpenRillConfig"}});
const unixOverride = resolveProfilePaths({profile:"beta",platform:"darwin",homeDir:"/Users/test",env:{OPENRILL_DATA_ROOT:"/srv/openrill-data",OPENRILL_CONFIG_ROOT:"/srv/openrill-config"}});
console.log(JSON.stringify({win,unix,winOverride,unixOverride}));
'''
        live_ok, live_output = run_utf8(["node", "--input-type=module", "-e", script], cwd=ROOT)
        try:
            live = json.loads(live_output) if live_ok else {}
        except json.JSONDecodeError:
            live = {}
        check("live-windows-runtime", live.get("win", {}).get("runtimeDir") == r"C:\Local\OpenRill\alpha\runtime", str(live.get("win", {}).get("runtimeDir")))
        check("live-windows-config", live.get("win", {}).get("configRoot") == r"C:\Roaming\OpenRill\alpha", str(live.get("win", {}).get("configRoot")))
        check("live-unix-runtime", live.get("unix", {}).get("runtimeDir") == "/home/test/.local/share/openrill/alpha/runtime", str(live.get("unix", {}).get("runtimeDir")))
        check("live-unix-config", live.get("unix", {}).get("configRoot") == "/home/test/.config/openrill/alpha", str(live.get("unix", {}).get("configRoot")))
        check("live-windows-override", live.get("winOverride", {}).get("runtimeDir") == r"D:\OpenRillData\beta\runtime", str(live.get("winOverride", {}).get("runtimeDir")))
        check("live-unix-override", live.get("unixOverride", {}).get("runtimeDir") == "/srv/openrill-data/beta/runtime", str(live.get("unixOverride", {}).get("runtimeDir")))
    else:
        for name in ("live-windows-runtime", "live-windows-config", "live-unix-runtime", "live-unix-config", "live-windows-override", "live-unix-override"):
            check(name, False, "build suite failed")

    ok, output = run_utf8(["python", "scripts/run_step002a_acceptance.py"], cwd=ROOT)
    check("step002a-regression", ok and "checks=58/58 state=PASSED" in output, "step002a_pass" if ok else output[-5000:])

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
        "path_semantics=TARGET_PLATFORM host_os_leak=DENIED"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
