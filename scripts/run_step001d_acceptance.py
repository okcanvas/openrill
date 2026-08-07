from __future__ import annotations

import json
import sys
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP001D_ACCEPTANCE_REPORT.txt"
VERSION = "0.6.1-step006a"


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: object, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1", str(package.get("packageManager")))
    check(
        "step001d-script",
        package.get("scripts", {}).get("acceptance:step001d") == "python scripts/run_step001d_acceptance.py",
    )

    entrypoint = ROOT / "openrill.mjs"
    source = entrypoint.read_text(encoding="utf-8")
    check("entrypoint-imports-path-resolve", 'import { resolve } from "node:path";' in source)
    check("entrypoint-imports-path-to-file-url", 'import { pathToFileURL } from "node:url";' in source)
    check("entrypoint-exports-direct-check", "export function isDirectExecution" in source)
    check("entrypoint-canonical-file-url", 'pathToFileURL(resolve(argv1)).href' in source)
    check("entrypoint-legacy-url-construction-zero", 'new URL(process.argv[1], "file:")' not in source)
    check("entrypoint-main-guard", "if (isDirectExecution())" in source)

    ok, output = run_utf8(
        [
            "node",
            "-e",
            "const value=new URL('D:\\\\NODE_AGENTS\\\\okcanvas-openrill\\\\openrill.mjs','file:');"
            "process.stdout.write(value.protocol+' '+value.href+'\\n')",
        ],
        cwd=ROOT,
    )
    check("reported-windows-url-misclassification-reproduced", ok and output.startswith("d:"), output)

    ok, output = run_utf8(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {resolve} from 'node:path'; import {pathToFileURL} from 'node:url';"
            "import {isDirectExecution} from './openrill.mjs';"
            "const p=resolve('openrill.mjs'); process.stdout.write(String(isDirectExecution(pathToFileURL(p).href,p))+'\\n')",
        ],
        cwd=ROOT,
    )
    check("canonical-direct-check-roundtrip", ok and output == "true", output)

    plan = ROOT / "docs/plans/STEP001D_WINDOWS_CLI_ENTRYPOINT_CANONICALIZATION.md"
    check("step001d-plan", plan.is_file())
    if plan.is_file():
        text = plan.read_text(encoding="utf-8")
        for heading in (
            "## 목적",
            "## Reference Evidence",
            "## 실패 증거",
            "## 원인",
            "## 구현 범위",
            "## 공개 계약",
            "## 상태 전이",
            "## 실패 및 복구",
            "## Acceptance",
            "## 패키징 산출물",
            "## 제외",
        ):
            check(f"step001d-heading:{heading}", heading in text)

    cmd_path = ROOT / "scripts/sh_run_step001d_acceptance.cmd"
    sh_path = ROOT / "scripts/sh_run_step001d_acceptance.sh"
    check("step001d-windows-launcher", cmd_path.is_file())
    if cmd_path.is_file():
        cmd_bytes = cmd_path.read_bytes()
        check("step001d-windows-launcher-crlf", b"\r\n" in cmd_bytes and b"\n" not in cmd_bytes.replace(b"\r\n", b""))
        check("step001d-windows-launcher-root-relative", b"%~dp0.." in cmd_bytes)
    check("step001d-posix-launcher", sh_path.is_file())

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    suite_ok = ok and "OPENRILL_STEP001_SUITE_PASS" in output
    check("step001d-build-suite", suite_ok, "suite_pass" if suite_ok else output[-3000:])

    for command, expected, token, name in (
        (["node", "openrill.mjs", "--version"], 0, f"OpenRill {VERSION}", "cli-version-live"),
        (["node", "openrill.mjs", "--help"], 0, "start      Start the foreground local Host", "cli-help-live"),
        (["node", "openrill.mjs", "unknown"], 2, "unknown command", "cli-unknown-closed-live"),
    ):
        ok, output = run_utf8(command, cwd=ROOT, expected=expected)
        check(name, ok and token in output, output)

    for script, token, name in (
        ("scripts/run_step001_acceptance.py", "state=PASSED", "step001-regression"),
        ("scripts/run_step001a_acceptance.py", "state=PASSED", "step001a-regression"),
        ("scripts/run_step001b_acceptance.py", "state=PASSED", "step001b-regression"),
        ("scripts/run_step001c_acceptance.py", "state=PASSED", "step001c-regression"),
    ):
        ok, output = run_utf8([sys.executable, script], cwd=ROOT)
        check(name, ok and token in output, output[-3000:])

    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines: list[str] = []
    for name, ok, detail in checks:
        line = f"[{'PASS' if ok else 'FAIL'}] {name}"
        if detail:
            line += f" :: {detail}"
        lines.append(line)
    lines.append(
        f"STEP001D_WINDOWS_CLI_ENTRYPOINT_CANONICALIZATION checks={passed}/{len(checks)} state={state} "
        "entrypoint=PATH_TO_FILE_URL windows_drive_scheme=SAFE"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
