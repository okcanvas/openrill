from __future__ import annotations

import ast
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP011R3_WINDOWS_BROWSER_BOOTSTRAP_EVIDENCE"
VERSION = "0.11.3-step011r3"
SCHEMA = 7
REPORT = ROOT / "reference/validation/STEP011R3_ACCEPTANCE_REPORT.txt"


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


def normalize_failure_evidence(output: str) -> str:
    normalized = output.replace(str(ROOT), "<ROOT>").replace(str(ROOT).replace("/", "\\"), "<ROOT>")
    normalized = re.sub(r"https?://(?:127\.0\.0\.1|localhost):\d+", "<LOOPBACK>", normalized)
    normalized = re.sub(r"(?i)[A-Z]:\\[^\r\n'\"]*?(?:AppData\\Local\\Temp|Temp)\\[^\r\n'\"]+", "<TEMP>", normalized)
    normalized = re.sub(r"/tmp/[^\s'\"]+", "<TEMP>", normalized)
    normalized = re.sub(r"# duration_ms \d+(?:\.\d+)?", "# duration_ms <DURATION>", normalized)
    return normalized


def extract_failure(output: str) -> str:
    marker = re.search(r"STEP011_CONTROL_UI_VERTICAL_SLICE checks=(\d+)/(\d+) state=(PASSED|FAILED)[^\r\n]*", output)
    if "runtime_unavailable" in output:
        summary = marker.group(0) if marker else "STEP011_CONTROL_UI_VERTICAL_SLICE state=FAILED"
        return f"{summary} prerequisite=runtime_unavailable"
    start_marker = "OPENRILL_BROWSER_EVIDENCE_BEGIN"
    end_marker = "OPENRILL_BROWSER_EVIDENCE_END"
    start = output.find(start_marker)
    end = output.find(end_marker, start + len(start_marker)) if start >= 0 else -1
    if start >= 0 and end >= 0:
        evidence = output[start:end + len(end_marker)]
        combined = evidence + ("\n" + marker.group(0) if marker else "")
        return normalize_failure_evidence(combined)[-24000:]
    lines = output.splitlines()
    failure_index = next((index for index, line in enumerate(lines) if line.startswith("[FAIL] ") or line.startswith("not ok ")), None)
    if failure_index is None:
        return normalize_failure_evidence(output[-20000:])
    return normalize_failure_evidence("\n".join(lines[max(0, failure_index - 1):]))[-24000:]


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check("step011r3-script", scripts.get("acceptance:step011r3") == "python scripts/run_step011r3_acceptance.py")
    check("step011r3-package-script", scripts.get("package:step011r3") == "python scripts/package_step011r3.py --output ../openrill-step011r3-windows-browser-bootstrap-evidence-v1.zip")
    package_source = read_utf8(ROOT / "scripts/package_step011r3.py")
    check("step011r3-package-marker", "OPENRILL_STEP011R3_PACKAGE_PASS" in package_source and "STEP011R2" not in package_source)

    required = [
        "scripts/chromium-executable.mjs",
        "scripts/live-fixture-cleanup.mjs",
        "scripts/run-step011-live.mjs",
        "scripts/run_step011_acceptance.py",
        "scripts/run_step011r3_acceptance.py",
        "scripts/sh_run_step011r3_acceptance.cmd",
        "scripts/sh_run_step011r3_acceptance.sh",
        "scripts/package_step011r3.py",
        "tests/unit/browser-page-evidence-step011r3.test.mjs",
        "tests/unit/live-fixture-cleanup-step011r1.test.mjs",
        "docs/plans/STEP011R3_WINDOWS_BROWSER_BOOTSTRAP_EVIDENCE.md",
        "reference/validation/STEP011R2_BROWSER_BOOTSTRAP_EVIDENCE_LOSS.md",
        "reference/validation/STEP011R2_BROWSER_WAIT_PREDICATE_ONLY_DIAGNOSTIC.md",
        "reference/validation/STEP011R3_ADDITIVE_UNIT_COUNT_DRIFT.md",
        "reference/validation/STEP011R3_FAILURE_REPORT_NONDETERMINISM.md",
        "scripts/browser-page-evidence.mjs",
        "tests/unit/browser-page-evidence-step011r3.test.mjs",
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

    evidence_source = read_utf8(ROOT / "scripts/browser-page-evidence.mjs")
    for label, token in (
        ("boundaries", "OPENRILL_BROWSER_EVIDENCE_BEGIN"),
        ("runtime", 'cdp.on("Runtime.exceptionThrown"'),
        ("console", 'cdp.on("Runtime.consoleAPICalled"'),
        ("log", 'cdp.on("Log.entryAdded"'),
        ("network-failed", 'cdp.on("Network.loadingFailed"'),
        ("network-http", 'cdp.on("Network.responseReceived"'),
        ("page-state", "readBrowserPageState"),
        ("wait", "waitForBrowserCondition"),
    ):
        check(f"browser-evidence:{label}", token in evidence_source)

    live = read_utf8(ROOT / "scripts/run-step011-live.mjs")
    for label, token in (
        ("helper-import", "attachBrowserPageEvidence"),
        ("blank-start", '"about:blank"'),
        ("attach", "attachBrowserPageEvidence(cdp"),
        ("enable", "await enableBrowserPageEvidence(cdp)"),
        ("navigate", 'cdp.call("Page.navigate", { url })'),
        ("wait-evidence", "12_000, evidence"),
    ):
        check(f"live-browser:{label}", token in live)
    blank_index = live.find('`--user-data-dir=${userData}`, "about:blank"')
    attach_index = live.find("attachBrowserPageEvidence(cdp")
    enable_index = live.find("await enableBrowserPageEvidence(cdp)")
    navigate_index = live.find('cdp.call("Page.navigate", { url })')
    check("live-pre-navigation-order", -1 < blank_index < attach_index < enable_index < navigate_index, f"{blank_index},{attach_index},{enable_index},{navigate_index}")
    check("live-final-url-process-argument-zero", '`--user-data-dir=${userData}`, url' not in live)

    feature_acceptance = read_utf8(ROOT / "scripts/run_step011_acceptance.py")
    check("feature-suite-tests-current", '# tests 144' in feature_acceptance and '# pass 144' in feature_acceptance)
    check("feature-suite-files-current", 'unit_files=25 reporter=TAP concurrency=1' in feature_acceptance)
    check("feature-vendor-failure-stable", 'else "runtime_unavailable"' in feature_acceptance)
    check("feature-browser-failure-extractor", 'extract_browser_failure(live_output)' in feature_acceptance)
    check("correction-regression-failure-stable", 'prerequisite=runtime_unavailable' in read_utf8(ROOT / "scripts/run_step011r3_acceptance.py"))

    registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    for issue in range(1, 48):
        check(f"issue-registry:OR-ISSUE-{issue:03d}", f"OR-ISSUE-{issue:03d}" in registry)
    for detail in (
        "STEP011R2_BROWSER_BOOTSTRAP_EVIDENCE_LOSS.md",
        "STEP011R2_BROWSER_WAIT_PREDICATE_ONLY_DIAGNOSTIC.md",
        "STEP011R3_ADDITIVE_UNIT_COUNT_DRIFT.md",
        "STEP011R3_FAILURE_REPORT_NONDETERMINISM.md",
    ):
        check(f"issue-detail:{detail}", detail in registry and (ROOT / "reference/validation" / detail).is_file())
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    check("recurrence:pre-navigation", "### Pre-navigation browser instrumentation" in recurrence)
    check("recurrence:wait-evidence", "### Browser wait failure evidence" in recurrence)
    check("recurrence:additive-suite-inventory", "### Additive aggregate suite inventory" in recurrence)
    check("recurrence:stable-failure-report", "### Stable failed-acceptance evidence" in recurrence)

    plan = read_utf8(ROOT / "docs/plans/STEP011R3_WINDOWS_BROWSER_BOOTSTRAP_EVIDENCE.md")
    for heading in ("## 목적", "## 기준선", "## Windows 실패 증거", "## 코드 확인", "## 구현 범위", "## 공개 계약", "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 반복 방지 기록", "## 패키징 산출물", "## 제외", "## 완료 선언"):
        check(f"plan-heading:{heading}", heading in plan)

    for filename in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        text = read_utf8(ROOT / filename)
        check(f"baseline-step:{filename}", STEP in text)
        check(f"baseline-version:{filename}", VERSION in text)
        check(f"baseline-step011r2-failure:{filename}", "145/146" in text and "last=false" in text)
        check(f"baseline-feature:{filename}", "STEP011_CONTROL_UI_VERTICAL_SLICE" in text)
        check(f"baseline-previous-windows:{filename}", "STEP010AR1" in text and "121/121" in text and "ACCEPTED" in text)
        check(f"baseline-next:{filename}", "STEP012_AUTOMATION_SCHEDULER" in text)

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    launcher = (ROOT / "scripts/sh_run_step011r3_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in launcher and b"\n" not in launcher.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b'cd /d "%~dp0.."' in launcher)
    check("posix-launcher", 'cd "$SCRIPT_DIR/.."' in read_utf8(ROOT / "scripts/sh_run_step011r3_acceptance.sh"))

    focused_ok, focused_output = run_utf8(["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/browser-page-evidence-step011r3.test.mjs"])
    focused_contract = bool(focused_ok and re.search(r"# tests 6(?:\r?\n)", focused_output) and re.search(r"# pass 6(?:\r?\n)", focused_output) and re.search(r"# fail 0(?:\r?\n)", focused_output) and re.search(r"# skipped 0(?:\r?\n)", focused_output))
    check("focused-browser-evidence-tests", focused_contract, "browser_evidence_tests_pass" if focused_contract else extract_failure(focused_output))

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
    lines.append(f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} instrumentation=PRE_NAVIGATION diagnostics=PAGE_NETWORK_RUNTIME browser=CHROMIUM")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
