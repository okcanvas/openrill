from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from acceptance_reports import resolve_acceptance_report, write_acceptance_report

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP"
FEATURE_STEP = "STEP012C_AUTOMATION_PROTOCOL_AND_CONVERSATION_RUN_INTEGRATION"
VERSION = "0.12.5-step012cr1"
SCHEMA = int(re.search(r"OPENRILL_STATE_SCHEMA_VERSION = (\d+) as const", (ROOT / "packages/state/src/migrations.ts").read_text(encoding="utf-8")).group(1))
ACCEPTED_STEP = "STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP"
ACCEPTED_SHA256 = "b90721d4d24f7467355f1f2dcd7e94d65f03517a7f60ff8208fa0c915f6ccbde"
ACCEPTED_MARKER = (
    "STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP checks=187/187 state=PASSED schema=8 "
    "scope=HISTORICAL_BASELINE_DELEGATED scheduler=WAKE_TIMER claim=TRANSACTIONAL lease=RENEWED "
    "recovery=CLAIM_REQUEUE_RUNNING_FAIL catch_up=SKIP_RUN_ONCE_BOUNDED shutdown=ASYNC_QUIESCENT "
    "executor=INJECTED_FAIL_CLOSED protocol_ui=DEFERRED browser_regression=CHROMIUM"
)
REPORT = resolve_acceptance_report(ROOT, ".artifacts/acceptance/STEP012CR1_ACCEPTANCE_REPORT.txt")
PACKAGED_REPORT = ROOT / "reference/validation/STEP012CR1_ACCEPTANCE_REPORT.txt"
PACKAGED_FEATURE_REPORT = ROOT / "reference/validation/STEP012C_ACCEPTANCE_REPORT.txt"


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def run_utf8(command: list[str], *, env: dict[str, str] | None = None) -> tuple[bool, str]:
    process_env = os.environ.copy()
    process_env.update({
        "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", "NO_COLOR": "1",
        "NODE_DISABLE_COLORS": "1", "TERM": "dumb",
    })
    if env:
        process_env.update(env)
    completed = subprocess.run(
        command, cwd=ROOT, env=process_env, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, check=False,
    )
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
    for pattern in (
        "apps/*/package.json", "services/*/package.json", "packages/*/package.json",
        "connectors/*/package.json", "skills/*/package.json",
    ):
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


def stable_failure(output: str) -> str:
    if "not ok " in output:
        lines = output.splitlines()
        failure = next((i for i, line in enumerate(lines) if line.startswith("not ok ")), 0)
        return "\n".join(lines[max(0, failure - 2):])[-24000:]
    failure = next((i for i, line in enumerate(output.splitlines()) if line.startswith("[FAIL] ")), None)
    if failure is not None:
        return "\n".join(output.splitlines()[max(0, failure - 1):])[-24000:]
    return output[-16000:]


def main() -> int:
    clean()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, outcome: object, detail: str = "") -> None:
        checks.append((name, bool(outcome), detail))

    package = json.loads(read_utf8(ROOT / "package.json"))
    scripts = package.get("scripts", {})
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1")
    check("step012cr1-script", scripts.get("acceptance:step012cr1") == "python scripts/run_step012cr1_acceptance.py")
    check(
        "step012cr1-package-script",
        scripts.get("package:step012cr1") == "python scripts/package_step012cr1.py --output ../openrill-step012cr1-historical-browser-regression-ownership-v1.zip",
    )

    required = [
        "scripts/run_step012cr1_acceptance.py",
        "scripts/run_step012c_acceptance.py",
        "scripts/verify_historical_browser_no_impact.py",
        "scripts/sh_run_step012cr1_acceptance.cmd",
        "scripts/sh_run_step012cr1_acceptance.sh",
        "scripts/package_step012cr1.py",
        "tests/unit/historical-browser-regression-ownership-step012cr1.test.mjs",
        "docs/plans/STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP.md",
        "reference/validation/STEP012C_WINDOWS_HISTORICAL_BROWSER_RUNTIME_OWNERSHIP.md",
        "reference/validation/STEP012BR1_BROWSER_SURFACE_BASELINE.json",
        "reference/validation/STEP012C_ACCEPTANCE_REPORT.txt",
        "reference/validation/STEP012CR1_ACCEPTANCE_REPORT.txt",
        "reference/validation/STEP012BR1_WINDOWS_LIVE_ACCEPTED.md",
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

    registry = read_utf8(ROOT / "docs/governance/ENGINEERING_ISSUE_REGISTRY.md")
    recurrence = read_utf8(ROOT / "docs/testing/RECURRENCE_PREVENTION_GATES.md")
    correction = read_utf8(ROOT / "reference/validation/STEP012C_WINDOWS_HISTORICAL_BROWSER_RUNTIME_OWNERSHIP.md")
    baseline = json.loads(read_utf8(ROOT / "reference/validation/STEP012BR1_BROWSER_SURFACE_BASELINE.json"))
    feature_runner = read_utf8(ROOT / "scripts/run_step012c_acceptance.py")
    check("issue-registry-066", "OR-ISSUE-066" in registry)
    check("issue-detail-066", "runtime_unavailable" in correction and "byte-identical" in correction)
    check("recurrence-browser-owner", "STEP012CR1 historical browser regression ownership" in recurrence)
    check("accepted-browser-baseline-step", baseline.get("acceptedStep") == ACCEPTED_STEP)
    check("accepted-browser-baseline-sha", baseline.get("acceptedZipSha256") == ACCEPTED_SHA256)
    check("accepted-browser-files-six", len(baseline.get("browserSurfaceSha256", {})) == 6)
    check("feature-default-chromium", 'os.environ.get("OPENRILL_BROWSER_REGRESSION_MODE", "chromium")' in feature_runner)
    check("feature-delegated-mode", "accepted-no-impact" in feature_runner and "ACCEPTED_BASELINE_NO_IMPACT" in feature_runner)
    check("feature-actual-path-retained", "run_step012br1_acceptance.py" in feature_runner and "browser_regression=CHROMIUM" in feature_runner)

    accepted = read_utf8(ROOT / "reference/validation/STEP012BR1_WINDOWS_LIVE_ACCEPTED.md")
    check("accepted-step-evidence", ACCEPTED_STEP in accepted and "187/187" in accepted and "WINDOWS_LIVE_ACCEPTED" in accepted)
    check("accepted-artifact-sha", ACCEPTED_SHA256 in accepted)
    check("accepted-marker-exact", ACCEPTED_MARKER in accepted)

    plan = read_utf8(ROOT / "docs/plans/STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP.md")
    for heading in (
        "## 목적", "## 기준선", "## 코드 확인", "## 구현 범위", "## 공개 계약", "## 상태 전이",
        "## 실패 및 복구", "## Acceptance", "## 반복 방지 기록", "## 패키징 산출물", "## 제외", "## 완료 선언",
    ):
        check(f"plan-heading:{heading}", heading in plan)

    for filename in ("README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"):
        text = read_utf8(ROOT / filename)
        check(f"baseline-current-step:{filename}", STEP in text)
        check(f"baseline-current-version:{filename}", VERSION in text)
        check(f"baseline-feature-history:{filename}", FEATURE_STEP in text)
        check(f"baseline-accepted-step:{filename}", ACCEPTED_STEP in text and "187/187" in text)
        check(f"baseline-accepted-sha:{filename}", ACCEPTED_SHA256 in text)
        check(f"baseline-next:{filename}", "STEP012D" in text)
        check(f"baseline-browser-scope:{filename}", "ACCEPTED_BASELINE_NO_IMPACT" in text or filename in {"PLANS.md", "ROADMAP.md"})

    check("python-text-io-explicit", not implicit_text_io(), json.dumps(implicit_text_io()))
    cmd_bytes = (ROOT / "scripts/sh_run_step012cr1_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd_bytes and b"\n" not in cmd_bytes.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd_bytes)
    check("posix-launcher", 'cd "$SCRIPT_DIR/.."' in read_utf8(ROOT / "scripts/sh_run_step012cr1_acceptance.sh"))

    initial_manifest_ok, initial_manifest_output = run_utf8(["python", "scripts/verify_package_manifest.py"])
    check("package-manifest-initial", initial_manifest_ok and "OPENRILL_PACKAGE_MANIFEST_PASS" in initial_manifest_output, initial_manifest_output.strip())

    no_impact_ok, no_impact_output = run_utf8(["python", "scripts/verify_historical_browser_no_impact.py"])
    check("browser-no-impact", no_impact_ok and "OPENRILL_HISTORICAL_BROWSER_NO_IMPACT_PASS" in no_impact_output, no_impact_output.strip())

    focused_ok, focused_output = run_utf8([
        "node", "--test", "--test-concurrency=1", "--test-reporter=tap",
        "tests/unit/historical-browser-regression-ownership-step012cr1.test.mjs",
    ])
    focused_contract = bool(
        focused_ok and re.search(r"# tests 4(?:\r?\n)", focused_output)
        and re.search(r"# pass 4(?:\r?\n)", focused_output)
        and re.search(r"# fail 0(?:\r?\n)", focused_output)
        and re.search(r"# skipped 0(?:\r?\n)", focused_output)
    )
    check("focused-browser-ownership", focused_contract, "browser_ownership_tests_pass" if focused_contract else stable_failure(focused_output))

    feature_hash_before = hashlib.sha256(PACKAGED_FEATURE_REPORT.read_bytes()).hexdigest()
    nested_report_relative = ".artifacts/nested/STEP012C_ACCEPTANCE_REPORT.txt"
    regression_ok, regression_output = run_utf8(
        ["python", "scripts/run_step012c_acceptance.py"],
        env={
            "OPENRILL_ACCEPTANCE_REPORT_PATH": nested_report_relative,
            "OPENRILL_BROWSER_REGRESSION_MODE": "accepted-no-impact",
        },
    )
    feature_hash_after = hashlib.sha256(PACKAGED_FEATURE_REPORT.read_bytes()).hexdigest()
    nested_report = ROOT / nested_report_relative
    marker = re.search(
        rf"STEP012C_AUTOMATION_PROTOCOL_AND_CONVERSATION_RUN_INTEGRATION checks=175/175 state=PASSED schema={SCHEMA} "
        r"protocol=CREATE_LIST_GET_UPDATE_RUN_NOW_HISTORY manual_idempotency=DURABLE "
        r"run_link=PRE_EXECUTION_LEASE_GUARDED executor=CONVERSATION_RUN notices=DOMAIN_EXPLICIT "
        r"shutdown=ABORT_QUIESCENT ui=DEFERRED browser_regression=ACCEPTED_BASELINE_NO_IMPACT",
        regression_output,
    )
    regression_pass = bool(regression_ok and marker)
    check("step012c-full-regression", regression_pass, "step012c_delegated_pass" if regression_pass else stable_failure(regression_output))
    check("nested-step012c-report-artifact", nested_report.is_file(), nested_report_relative)
    check("nested-step012c-packaged-report-immutable", feature_hash_before == feature_hash_after, f"before={feature_hash_before} after={feature_hash_after}")

    final_manifest_ok, final_manifest_output = run_utf8(["python", "scripts/verify_package_manifest.py"])
    check("package-manifest-final", final_manifest_ok and "OPENRILL_PACKAGE_MANIFEST_PASS" in final_manifest_output, final_manifest_output.strip())
    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [path for path in ROOT.rglob("*") if path.is_file() and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})]
    check("protected-payload-zero", not protected)
    report_text = read_utf8(PACKAGED_REPORT) if PACKAGED_REPORT.exists() else ""
    check("secret-value-not-reported", "Bearer " not in report_text and re.search(r"(?i)(api[_-]?key|secret)\s*[:=]\s*\S+", report_text) is None)

    clean()
    generated_paths = [
        path for path in ROOT.rglob("*")
        if "node_modules" not in path.relative_to(ROOT).parts
        and any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)
    ]
    check("generated-cleanup", not generated_paths, json.dumps([str(path.relative_to(ROOT)) for path in generated_paths[:20]]))

    passed = sum(outcome for _, outcome, _ in checks)
    state = "PASSED" if passed == len(checks) else "FAILED"
    lines = [f"[{'PASS' if outcome else 'FAIL'}] {name}" + (f" :: {detail}" if detail else "") for name, outcome, detail in checks]
    lines.append(
        f"{STEP} checks={passed}/{len(checks)} state={state} schema={SCHEMA} "
        "feature=STEP012C protocol=CREATE_LIST_GET_UPDATE_RUN_NOW_HISTORY manual_idempotency=DURABLE "
        "run_link=PRE_EXECUTION_LEASE_GUARDED executor=CONVERSATION_RUN notices=DOMAIN_EXPLICIT "
        "shutdown=ABORT_QUIESCENT browser_scope=HISTORICAL_DELEGATED "
        "browser_regression=ACCEPTED_BASELINE_NO_IMPACT ui=DEFERRED_NEXT_STEP012D"
    )
    write_acceptance_report(REPORT, "\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
