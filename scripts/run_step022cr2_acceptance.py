from __future__ import annotations
import json, os, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP022CR2_INTEGRATED_MATTERMOST_TESTBED_SINGLE_ROOT_BOOTSTRAP"
PRODUCT_STEP = "STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE"
PRODUCT_VERSION = "0.24.0-step022c"
SCHEMA = 25


def run(command: list[str], timeout: int = 3000) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy(); env.update({"PYTHONUTF8":"1","PYTHONIOENCODING":"utf-8","NO_COLOR":"1","NODE_DISABLE_COLORS":"1"})
    return subprocess.run(command, cwd=ROOT, env=env, text=True, encoding="utf-8", errors="replace", stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)


def tap_summary(output: str) -> dict[str, int]:
    values = {name: -1 for name in ("tests","pass","fail","cancelled","skipped","todo")}
    for raw in output.splitlines():
        match = re.fullmatch(r"\s*#\s+(tests|pass|fail|cancelled|skipped|todo)\s+([0-9]+)\s*", raw)
        if match: values[match.group(1)] = int(match.group(2))
    return values


def main() -> int:
    checks: list[tuple[str,bool,str]] = []
    def check(name: str, value: bool, detail: object = "") -> None: checks.append((name, bool(value), str(detail)))
    pkg = json.loads((ROOT/"package.json").read_text(encoding="utf-8")); scripts = pkg.get("scripts", {})
    check("product-name", pkg.get("name") == "openrill", pkg.get("name"))
    check("product-version-retained", pkg.get("version") == PRODUCT_VERSION, pkg.get("version"))
    check("schema-retained", "OPENRILL_STATE_SCHEMA_VERSION = 25" in (ROOT/"packages/state/src/migrations.ts").read_text(encoding="utf-8"))
    check("integrated-testbed", (ROOT/"testbeds/mattermost/docker-compose.yml").is_file())
    check("root-cmd", (ROOT/"start-and-run-step022c-live.cmd").is_file())
    check("root-powershell", (ROOT/"start-and-run-step022c-live.ps1").is_file())
    ps = (ROOT/"start-and-run-step022c-live.ps1").read_text(encoding="utf-8")
    cmd = (ROOT/"start-and-run-step022c-live.cmd").read_text(encoding="utf-8")
    runner = (ROOT/"testbeds/mattermost/scripts/run-step022c-live.mjs").read_text(encoding="utf-8")
    compose = (ROOT/"testbeds/mattermost/docker-compose.yml").read_text(encoding="utf-8")
    check("no-external-root-arg", "OpenRillRoot" not in ps and "process.argv[2]" not in runner and "OPENRILL_STEP022C_ROOT" not in runner)
    check("cmd-shell-entrypoint", "powershell.exe -NoProfile -ExecutionPolicy Bypass" in cmd)
    check("frozen-install", "pnpm install --frozen-lockfile" in ps)
    check("same-root-live", scripts.get("mattermost:testbed:live") == "node testbeds/mattermost/scripts/run-step022c-live.mjs")
    check("unchanged-product-live", scripts.get("acceptance:step022c:live") == "python scripts/run_step022c_acceptance.py --require-windows-mattermost-live")
    check("verified-mattermost-pin", "mattermost/mattermost-team-edition:11.7.7" in compose)
    check("no-latest", ":latest" not in compose)
    check("localhost-only", '"127.0.0.1:${MATTERMOST_PORT:-8065}:8065"' in compose)
    check("named-volumes", "mattermost-db:/var/lib/postgresql" in compose and "mattermost-config:/mattermost/config" in compose)
    check("tokens-memory-only", "tokens=REDACTED" in runner and "writeFile" not in runner)
    for number in range(366, 372):
        check(f"issue-{number}", (ROOT/f"reference/validation/STEP022CR2_OR_ISSUE_{number}.md").is_file())

    focused = subprocess.run(["node","--test","--test-concurrency=1","--test-reporter=tap", str((ROOT/"tests/unit/mattermost-testbed-step022cr2.test.mjs").resolve()), str((ROOT/"tests/unit/validation-governance-step022cr2.test.mjs").resolve())], cwd=ROOT.parent, env={**os.environ,"NO_COLOR":"1","NODE_DISABLE_COLORS":"1"}, text=True, encoding="utf-8", errors="replace", stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    # Intentionally execute from the parent directory to preserve OR-ISSUE-370 coverage.
    tap = tap_summary(focused.stdout)
    check("focused-exit", focused.returncode == 0, focused.returncode)
    check("focused-tests", tap["tests"] == 12, tap)
    check("focused-pass", tap["pass"] == 12, tap)
    check("focused-clean", tap["fail"] == 0 and tap["cancelled"] == 0 and tap["skipped"] == 0 and tap["todo"] == 0, tap)

    aggregate = run([sys.executable, "scripts/run_step022c_acceptance.py"], 3000)
    check("step022c-local-aggregate", aggregate.returncode == 0 and "checks=32/32 state=PASSED" in aggregate.stdout, aggregate.returncode)
    match = re.search(r"canonical_files=([0-9]+) canonical_tests=([0-9]+)", aggregate.stdout)
    canonical_files = int(match.group(1)) if match else -1; canonical_tests = int(match.group(2)) if match else -1
    passed = sum(1 for _, ok, _ in checks if ok)
    state = "PASSED" if passed == len(checks) else "FAILED"
    for name, ok, detail in checks:
        if not ok: print(f"OPENRILL_STEP022CR2_FAILURE check={name} detail={detail}")
    print(f"{STEP} checks={passed}/{len(checks)} state={state} product_step={PRODUCT_STEP} product_version={PRODUCT_VERSION} schema={SCHEMA} product_runtime_modifications=0 testbed=INTEGRATED_SINGLE_ROOT focused_testbed=12/12 step022c_local=32/32 canonical_files={canonical_files} canonical_tests={canonical_tests} docker_live=NOT_RUN windows_mattermost_live=PENDING")
    return 0 if state == "PASSED" else 1

if __name__ == "__main__": raise SystemExit(main())
