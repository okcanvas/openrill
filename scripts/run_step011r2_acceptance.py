from __future__ import annotations

import ast
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP011R2_WINDOWS_CHROMIUM_EXECUTABLE_DISCOVERY_AND_SPAWN_EVIDENCE"
VERSION = "0.11.2-step011r2"
SCHEMA = 7
REPORT = ROOT / "reference/validation/STEP011R2_ACCEPTANCE_REPORT.txt"


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def run_utf8(command: list[str], *, cwd: Path = ROOT, env: dict[str, str] | None = None) -> tuple[bool, str]:
    process_env = os.environ.copy()
    process_env.update({"PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", "NO_COLOR": "1", "NODE_DISABLE_COLORS": "1", "TERM": "dumb"})
    if env:
        process_env.update(env)
    completed = subprocess.run(command, cwd=cwd, env=process_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return completed.returncode == 0, completed.stdout.decode("utf-8", errors="replace")


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
    for pattern in ("apps/*/package.json", "services/*/package.json", "packages/*/package.json", "connectors/*/package.json", "skills/*/package.json"):
        result.extend(ROOT.glob(pattern))
    return sorted(result)


def implicit_text_io() -> list[str]:
    failures: list[str] = []
    for path in sorted((ROOT / "scripts").glob("*.py")):
        tree = ast.parse(read_utf8(path), filename=path.as_posix())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            if node.func.attr not in {"read_text", "write_text"}:
                continue
            if not any(keyword.arg == "encoding" for keyword in node.keywords):
                failures.append(f"{path.name}:{node.lineno}:{node.func.attr}")
    return failures


def extract_failure(output: str) -> str:
    lines = output.splitlines()
    failure_index = next((index for index, line in enumerate(lines) if line.startswith("[FAIL] ") or line.startswith("not ok ")), None)
    if failure_index is None:
        return output[-20000:]
    return "\n".join(lines[max(0, failure_index - 1):])[-24000:]


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check("step011r2-script", scripts.get("acceptance:step011r2") == "python scripts/run_step011r2_acceptance.py")
    check("step011r2-package-script", scripts.get("package:step011r2") == "python scripts/package_step011r2.py --output ../openrill-step011r2-windows-chromium-executable-discovery-spawn-evidence-v1.zip")

    required = [
        "scripts/chromium-executable.mjs",
        "scripts/live-fixture-cleanup.mjs",
        "scripts/run-step011-live.mjs",
        "scripts/run_step011_acceptance.py",
        "scripts/run_step011r2_acceptance.py",
        "scripts/sh_run_step011r2_acceptance.cmd",
        "scripts/sh_run_step011r2_acceptance.sh",
        "scripts/package_step011r2.py",
        "tests/unit/chromium-executable-step011r2.test.mjs",
        "tests/unit/live-fixture-cleanup-step011r1.test.mjs",
        "docs/plans/STEP011R2_WINDOWS_CHROMIUM_EXECUTABLE_DISCOVERY_AND_SPAWN_EVIDENCE.md",
        "reference/validation/STEP011R1_WINDOWS_CHROMIUM_POSIX_PATH_HARDCODE.md",
        "reference/validation/STEP011R1_CHROMIUM_SPAWN_ERROR_EVIDENCE_LOSS.md",
        "docs/governance/ENGINEERING_ISSUE_REGISTRY.md",
        "docs/testing/RECURRENCE_PREVENTION_GATES.md",
    ]
    for relative in required:
        check(f"required:{relative}", (ROOT / relative).is_file())

    package_manifests = manifests()
    versions = {json.loads(read_utf8(path)).get("version") for path in package_manifests}
    check("manifest-count", len(package_manifests) == 26, str(len(package_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))

    generator = read_utf8(ROOT / "scripts/generate_package_manifest.py")
    verifier = read_utf8(ROOT / "scripts/verify_package_manifest.py")
    generated = json.loads(read_utf8(ROOT / "PACKAGE_MANIFEST.json")) if (ROOT / "PACKAGE_MANIFEST.json").exists() else {}
    for label, source in (("generator", generator), ("verifier", verifier)):
        check(f"package-manifest-{label}-step", f'STEP = "{STEP}"' in source)
        check(f"package-manifest-{label}-version", f'VERSION = "{VERSION}"' in source)
    check("package-manifest-generated-identity", generated.get("step") == STEP and generated.get("version") == VERSION, f"{generated.get('step')} {generated.get('version')}")

    resolver = read_utf8(ROOT / "scripts/chromium-executable.mjs")
    for label, token in (
        ("override", 'CHROMIUM_EXECUTABLE_OVERRIDE_ENV = "OPENRILL_CHROMIUM_EXECUTABLE"'),
        ("stable-not-found", 'CHROMIUM_EXECUTABLE_NOT_FOUND = "OPENRILL_CHROMIUM_EXECUTABLE_NOT_FOUND"'),
        ("target-path", 'platform === "win32" ? path.win32 : path.posix'),
        ("windows-chrome", '"Google", "Chrome", "Application", "chrome.exe"'),
        ("windows-edge", '"Microsoft", "Edge", "Application", "msedge.exe"'),
        ("windows-chromium", '"Chromium", "Application", "chrome.exe"'),
        ("posix-chromium", '"/usr/bin/chromium"'),
        ("resolver", "export async function resolveChromiumExecutable"),
        ("spawn-capture", "export function captureChildSpawnFailure"),
        ("spawn-detail", "export function describeChromiumSpawnFailure"),
    ):
        check(f"browser-resolver:{label}", token in resolver)

    live = read_utf8(ROOT / "scripts/run-step011-live.mjs")
    for label, token in (
        ("resolver-import", "resolveChromiumExecutable"),
        ("resolver-call", "const resolvedBrowser = await resolveChromiumExecutable()"),
        ("resolved-spawn", "spawn(resolvedBrowser.executable"),
        ("spawn-capture", "captureChildSpawnFailure(browser"),
        ("spawn-failure-first", "if (spawnState.failure)"),
        ("spawn-detail", "describeChromiumSpawnFailure(spawnState.failure"),
        ("exit-detail", "source=${resolvedBrowser.source}"),
    ):
        check(f"live-browser:{label}", token in live)
    check("live-posix-literal-spawn-zero", 'spawn("/usr/bin/chromium"' not in live)
    check("live-unobserved-browser-error-zero", 'browser.once("error"' not in live)

    registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    for issue in range(1, 44):
        check(f"issue-registry:OR-ISSUE-{issue:03d}", f"OR-ISSUE-{issue:03d}" in registry)
    for detail in ("STEP011R1_WINDOWS_CHROMIUM_POSIX_PATH_HARDCODE.md", "STEP011R1_CHROMIUM_SPAWN_ERROR_EVIDENCE_LOSS.md"):
        check(f"issue-detail:{detail}", detail in registry and (ROOT / "reference/validation" / detail).is_file())
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    check("recurrence:browser-authority", "### Cross-platform Chromium executable authority" in recurrence)
    check("recurrence:spawn-evidence", "### Child spawn failure evidence" in recurrence)

    plan = read_utf8(ROOT / "docs/plans/STEP011R2_WINDOWS_CHROMIUM_EXECUTABLE_DISCOVERY_AND_SPAWN_EVIDENCE.md")
    for heading in ("## 목적", "## 기준선", "## Windows 실패 증거", "## 코드 확인", "## 구현 범위", "## 공개 계약", "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 반복 방지 기록", "## 패키징 산출물", "## 제외", "## 완료 선언"):
        check(f"plan-heading:{heading}", heading in plan)

    for filename in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        text = read_utf8(ROOT / filename)
        check(f"baseline-step:{filename}", STEP in text)
        check(f"baseline-version:{filename}", VERSION in text)
        check(f"baseline-step011r1-failure:{filename}", "142/143" in text and "-4058" in text)
        check(f"baseline-feature:{filename}", "STEP011_CONTROL_UI_VERTICAL_SLICE" in text)
        check(f"baseline-previous-windows:{filename}", "STEP010AR1" in text and "121/121" in text and "ACCEPTED" in text)
        check(f"baseline-next:{filename}", "STEP012_AUTOMATION_SCHEDULER" in text)

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    launcher = (ROOT / "scripts/sh_run_step011r2_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in launcher and b"\n" not in launcher.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b'cd /d "%~dp0.."' in launcher)
    check("posix-launcher", 'cd "$SCRIPT_DIR/.."' in read_utf8(ROOT / "scripts/sh_run_step011r2_acceptance.sh"))

    focused_ok, focused_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/chromium-executable-step011r2.test.mjs"])
    focused_contract = bool(focused_ok and re.search(r"# tests 7(?:\r?\n)", focused_output) and re.search(r"# pass 7(?:\r?\n)", focused_output) and re.search(r"# fail 0(?:\r?\n)", focused_output) and re.search(r"# skipped 0(?:\r?\n)", focused_output))
    check("focused-browser-tests", focused_contract, "browser_tests_pass" if focused_contract else extract_failure(focused_output))

    regression_ok, regression_output = run_utf8(["python", "scripts/run_step011_acceptance.py"])
    regression_marker = "STEP011_CONTROL_UI_VERTICAL_SLICE checks=195/195 state=PASSED schema=7 framework=VUE_3 browser=CHROMIUM"
    check("step011-full-regression", regression_ok and regression_marker in regression_output, "step011_pass" if regression_ok and regression_marker in regression_output else extract_failure(regression_output))

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [path for path in ROOT.rglob("*") if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})]
    check("protected-payload-zero", not protected)
    report_text = read_utf8(REPORT) if REPORT.exists() else ""
    check("secret-value-not-reported", "Bearer " not in report_text and re.search(r"(?i)(api[_-]?key|secret)\s*[:=]\s*\S+", report_text) is None)

    clean()
    generated_paths = [path for path in ROOT.rglob("*") if "node_modules" not in path.relative_to(ROOT).parts and any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)]
    check("generated-cleanup", not generated_paths, json.dumps([str(path.relative_to(ROOT)) for path in generated_paths[:20]]))

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, outcome, detail in checks]
    lines.append(f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} discovery=CROSS_PLATFORM evidence=SPAWN_ERROR browser=CHROMIUM")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
