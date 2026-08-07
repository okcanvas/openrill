from __future__ import annotations

import ast
import json
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP006A_ACCEPTANCE_REPORT.txt"
VERSION = "0.6.1-step006a"
STEP = "STEP006A_WINDOWS_UTF8_TEXT_IO"


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


def implicit_text_io_calls() -> list[str]:
    violations: list[str] = []
    for path in sorted((ROOT / "scripts").glob("*.py")):
        tree = ast.parse(read_utf8(path), filename=path.as_posix())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            if node.func.attr not in {"read_text", "write_text"}:
                continue
            has_encoding = any(keyword.arg == "encoding" for keyword in node.keywords)
            if not has_encoding:
                violations.append(
                    f"{path.relative_to(ROOT).as_posix()}:{getattr(node, 'lineno', 0)}:{node.func.attr}"
                )
    return violations


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check(
        "step006a-script",
        package.get("scripts", {}).get("acceptance:step006a")
        == "python scripts/run_step006a_acceptance.py",
    )
    check(
        "step006a-package-script",
        package.get("scripts", {}).get("package:step006a")
        == "python scripts/package_step006a.py --output ../openrill-step006a-windows-utf8-text-io-v1.zip",
    )

    required = [
        "scripts/run_step006_acceptance.py",
        "scripts/run_step006a_acceptance.py",
        "scripts/sh_run_step006a_acceptance.cmd",
        "scripts/sh_run_step006a_acceptance.sh",
        "scripts/package_step006a.py",
        "docs/plans/STEP006A_WINDOWS_UTF8_TEXT_IO.md",
        "docs/adrs/ADR-0022-EXPLICIT_UTF8_REPOSITORY_TEXT_IO.md",
        "docs/testing/PYTHON_UTF8_TEXT_IO.md",
        "reference/validation/STEP006_WINDOWS_DEFAULT_TEXT_DECODING_FAILURE.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    package_manifests = manifests()
    versions = {json.loads(read_utf8(path)).get("version") for path in package_manifests}
    check("manifest-count", len(package_manifests) == 25, str(len(package_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))

    step006_source = read_utf8(ROOT / "scripts/run_step006_acceptance.py")
    check("step006-read-helper", 'def read_utf8(path: Path) -> str:' in step006_source)
    check("step006-read-encoding", 'read_text(encoding="utf-8")' in step006_source)
    check("step006-report-encoding", 'REPORT.write_text("\\n".join(lines) + "\\n", encoding="utf-8")' in step006_source)
    check("step006-bare-read-zero", ".read_text()" not in step006_source)
    check("step006-bare-write-zero", ".write_text(" not in step006_source.replace('write_text("\\n".join(lines) + "\\n", encoding="utf-8")', ""))

    violations = implicit_text_io_calls()
    check("all-python-text-io-explicit", not violations, json.dumps(violations))

    evidence_path = ROOT / "reference/openclaw/EVIDENCE_INDEX.json"
    evidence_bytes = evidence_path.read_bytes()
    cp949_failed = False
    cp949_detail = ""
    try:
        evidence_bytes.decode("cp949")
    except UnicodeDecodeError as error:
        cp949_failed = error.start == 73 and error.object[error.start] == 0xED
        cp949_detail = f"position={error.start} byte=0x{error.object[error.start]:02x}"
    check("reported-cp949-failure-reproduced", cp949_failed, cp949_detail)

    evidence = json.loads(read_utf8(evidence_path))
    evidence_report = json.loads(
        read_utf8(ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json")
    )
    check("utf8-evidence-count", len(evidence) == 104, str(len(evidence)))
    check(
        "utf8-evidence-report",
        evidence_report.get("allVerified") is True
        and evidence_report.get("verifiedCount") == 104,
        str(evidence_report.get("verifiedCount")),
    )
    check(
        "utf8-korean-content",
        evidence[0].get("statement") == "패키지 이름은 openclaw이다.",
        str(evidence[0].get("statement")),
    )

    plan = read_utf8(ROOT / "docs/plans/STEP006A_WINDOWS_UTF8_TEXT_IO.md")
    for heading in (
        "## 목적",
        "## 기준선",
        "## 실패 증거",
        "## 원인",
        "## 구현 범위",
        "## 공개 계약",
        "## 상태 전이",
        "## 실패 및 복구",
        "## Acceptance",
        "## 패키징 산출물",
        "## 제외",
        "## 완료 선언",
    ):
        check(f"step006a-heading:{heading}", heading in plan)
    check("plan-exact-error", "UnicodeDecodeError" in plan and "position 73" in plan)
    check("plan-cp949", "cp949" in plan)
    check("plan-explicit-utf8", 'encoding="utf-8"' in plan)

    adr = read_utf8(ROOT / "docs/adrs/ADR-0022-EXPLICIT_UTF8_REPOSITORY_TEXT_IO.md")
    check("adr-accepted", "Status: Accepted" in adr)
    check("adr-repository-utf8", "UTF-8" in adr and "locale" in adr)

    windows_failure = read_utf8(
        ROOT / "reference/validation/STEP006_WINDOWS_DEFAULT_TEXT_DECODING_FAILURE.md"
    )
    check("failure-log-command", "pnpm acceptance:step006" in windows_failure)
    check("failure-log-position", "position 73" in windows_failure)
    check("failure-log-byte", "0xed" in windows_failure)

    windows_launcher = (ROOT / "scripts/sh_run_step006a_acceptance.cmd").read_bytes()
    check(
        "windows-launcher-crlf",
        b"\r\n" in windows_launcher
        and b"\n" not in windows_launcher.replace(b"\r\n", b""),
    )
    check("windows-launcher-root-relative", b"%~dp0.." in windows_launcher)
    check("posix-launcher", (ROOT / "scripts/sh_run_step006a_acceptance.sh").is_file())

    ok, output = run_utf8(["python", "scripts/run_step006_acceptance.py"], cwd=ROOT)
    check(
        "step006-regression",
        ok
        and "STEP006_CONVERSATION_AND_EVENT_LEDGER checks=88/88 state=PASSED"
        in output,
        "step006_pass" if ok else output[-8000:],
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
        "repository_text=UTF8 python_locale=INDEPENDENT regression=STEP006"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
