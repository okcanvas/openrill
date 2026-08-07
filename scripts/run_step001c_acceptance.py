from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from subprocess_utf8 import decode_utf8_output, run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP001C_ACCEPTANCE_REPORT.txt"
VERSION = "0.6.1-step006a"


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: object, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1", str(package.get("packageManager")))
    check(
        "step001c-script",
        package.get("scripts", {}).get("acceptance:step001c") == "python scripts/run_step001c_acceptance.py",
    )

    helper = ROOT / "scripts/subprocess_utf8.py"
    check("utf8-helper", helper.is_file())
    helper_text = helper.read_text(encoding="utf-8") if helper.is_file() else ""
    check("subprocess-binary-capture", "text=False" in helper_text)
    check("subprocess-explicit-utf8-decode", '.decode("utf-8", errors="replace")' in helper_text)
    check("child-python-utf8", '"PYTHONUTF8": "1"' in helper_text and '"PYTHONIOENCODING": "utf-8"' in helper_text)

    for script_name in (
        "run_step001_acceptance.py",
        "run_step001a_acceptance.py",
        "run_step001b_acceptance.py",
    ):
        text = (ROOT / "scripts" / script_name).read_text(encoding="utf-8")
        check(f"runner-uses-helper:{script_name}", "from subprocess_utf8 import run_utf8" in text)
        check(f"runner-no-locale-text-mode:{script_name}", "text=True" not in text)

    cmd_path = ROOT / "scripts/sh_run_step001c_acceptance.cmd"
    sh_path = ROOT / "scripts/sh_run_step001c_acceptance.sh"
    check("step001c-windows-launcher", cmd_path.is_file())
    if cmd_path.is_file():
        cmd_bytes = cmd_path.read_bytes()
        check("step001c-windows-launcher-crlf", b"\r\n" in cmd_bytes and b"\n" not in cmd_bytes.replace(b"\r\n", b""))
        check("step001c-windows-launcher-root-relative", b"%~dp0.." in cmd_bytes)
    check("step001c-posix-launcher", sh_path.is_file())

    utf8_payload = "✓ UTF-8 subprocess"
    ok, output = run_utf8(
        ["node", "-e", f"process.stdout.write({json.dumps(utf8_payload + chr(10))})"],
        cwd=ROOT,
    )
    check("node-utf8-roundtrip", ok and output == utf8_payload, output)
    check("direct-byte-decode", decode_utf8_output(utf8_payload.encode("utf-8")) == utf8_payload)
    try:
        utf8_payload.encode("utf-8").decode("cp949")
        cp949_rejected = False
    except UnicodeDecodeError:
        cp949_rejected = True
    check("reported-cp949-failure-reproduced", cp949_rejected)

    plan = ROOT / "docs/plans/STEP001C_WINDOWS_UTF8_SUBPROCESS_CAPTURE.md"
    check("step001c-plan", plan.is_file())
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
            check(f"step001c-heading:{heading}", heading in text)

    for script, token, name in (
        ("scripts/run_step001_acceptance.py", "state=PASSED", "step001-regression"),
        ("scripts/run_step001a_acceptance.py", "state=PASSED", "step001a-regression"),
        ("scripts/run_step001b_acceptance.py", "state=PASSED", "step001b-regression"),
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
        f"STEP001C_WINDOWS_UTF8_SUBPROCESS_CAPTURE checks={passed}/{len(checks)} state={state} "
        "capture=BINARY decode=UTF8_REPLACE windows_locale=INDEPENDENT"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
