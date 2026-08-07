from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP002_ACCEPTANCE_REPORT.txt"
VERSION = "0.6.1-step006a"
SOURCE_SHA = "1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82"
GENERATED = {"dist", ".artifacts", "__pycache__", "node_modules"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OpenRill STEP002 deterministic and process acceptance")
    parser.add_argument("--openclaw-source-root", type=Path)
    parser.add_argument("--openclaw-source-zip", type=Path)
    return parser.parse_args()


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
    args = parse_args()
    clean_generated()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: object, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1", str(package.get("packageManager")))
    check("step002-script", package.get("scripts", {}).get("acceptance:step002") == "python scripts/run_step002_acceptance.py")
    check("step002-package-script", "package_step002.py" in package.get("scripts", {}).get("package:step002", ""))

    required = [
        "services/agent-host/src/lifecycle.ts",
        "services/agent-host/src/lock.ts",
        "services/agent-host/src/metadata.ts",
        "services/agent-host/src/control-server.ts",
        "services/agent-host/src/control-client.ts",
        "services/agent-host/src/errors.ts",
        "packages/config/src/index.ts",
        "packages/protocol/src/index.ts",
        "apps/agent-cli/src/index.ts",
        "scripts/run-step002-live.mjs",
        "scripts/run_step002_acceptance.py",
        "scripts/sh_run_step002_acceptance.cmd",
        "scripts/sh_run_step002_acceptance.sh",
        "docs/plans/STEP002_CLI_AND_LOCAL_HOST_LIFECYCLE.md",
        "reference/openclaw/GATEWAY_LIFECYCLE.md",
    ]
    for rel in required:
        check(f"required:{rel}", (ROOT / rel).is_file())

    manifests = []
    for pattern in ("package.json", "apps/*/package.json", "services/*/package.json", "packages/*/package.json", "connectors/*/package.json", "skills/*/package.json"):
        manifests.extend(ROOT.glob(pattern))
    versions = {path.relative_to(ROOT).as_posix(): json.loads(path.read_text(encoding="utf-8")).get("version") for path in manifests}
    check("manifest-count", len(versions) == 25, str(len(versions)))
    mismatched = {path: value for path, value in versions.items() if value != VERSION}
    check("manifest-version-alignment", not mismatched, json.dumps(mismatched, sort_keys=True))

    lock = (ROOT / "pnpm-lock.yaml").read_text(encoding="utf-8")
    check("lock-cli-config-link", "version: link:../../packages/config" in lock)
    check("lock-cli-host-link", "version: link:../../services/agent-host" in lock)
    check("lock-null-importers-zero", "  packages/protocol:\n" not in lock)
    workspace = (ROOT / "pnpm-workspace.yaml").read_text(encoding="utf-8")
    check("auto-install-peers-aligned", "autoInstallPeers: true" in workspace and "  autoInstallPeers: true" in lock)

    refs = json.loads((ROOT / "tsconfig.build.json").read_text(encoding="utf-8"))["references"]
    paths = [item["path"] for item in refs]
    check("host-build-before-cli", paths.index("services/agent-host") < paths.index("apps/agent-cli"))

    config_source = (ROOT / "packages/config/src/index.ts").read_text(encoding="utf-8")
    for token in ("canonicalizeProfileName", "OPENRILL_DATA_ROOT", "OPENRILL_CONFIG_ROOT", "host.lock", "host.json"):
        check(f"config-contract:{token}", token in config_source)
    protocol_source = (ROOT / "packages/protocol/src/index.ts").read_text(encoding="utf-8")
    for token in ("HostLifecycleState", "HostStatusPayload", "HostStopPayload"):
        check(f"protocol-contract:{token}", token in protocol_source)
    host_source = "\n".join(path.read_text(encoding="utf-8") for path in sorted((ROOT / "services/agent-host/src").glob("*.ts")))
    for token in (
        'DEFAULT_HOST_BIND = OPENRILL_DEFAULT_HOST_BIND',
        'DEFAULT_HOST_PORT = OPENRILL_DEFAULT_HOST_PORT',
        '"STARTING"', '"LISTENING"', '"READY"', '"STOPPING"', '"STOPPED"',
        '"/lifecycle/status"', '"/lifecycle/stop"',
        'timingSafeEqual', 'open(paths.lockPath, "wx"', 'instanceId', 'controlToken',
    ):
        check(f"host-contract:{token}", token in host_source)
    check("host-non-loopback-guard", "STEP002 Host bind must be loopback" in host_source)
    check("host-owner-release", "current?.instanceId === payload.instanceId" in host_source)
    check("host-token-not-public", "controlToken: _controlToken" in host_source)

    cli_source = (ROOT / "apps/agent-cli/src/index.ts").read_text(encoding="utf-8")
    for token in ('"start"', '"run"', '"status"', '"stop"', 'SIGINT', 'SIGTERM'):
        check(f"cli-contract:{token}", token in cli_source)
    check("foreground-help", "foreground commands" in cli_source and "STEP019" in cli_source)
    check("signal-installed-before-host-start", cli_source.index('runtime.onSignal("SIGINT"') < cli_source.index("host = await hostModule.startLocalHost"))

    evidence = json.loads((ROOT / "reference/openclaw/EVIDENCE_INDEX.json").read_text(encoding="utf-8"))
    check("evidence-count", len(evidence) == 104, str(len(evidence)))
    for evidence_id in ("OC-GW-012", "OC-GW-013", "OC-GW-015", "OC-GW-016", "OC-GW-017", "OC-GW-018"):
        check(f"evidence:{evidence_id}", any(item["id"] == evidence_id for item in evidence))
    report = json.loads((ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json").read_text(encoding="utf-8"))
    check("evidence-report", report.get("allVerified") is True and report.get("verifiedCount") == 104, str(report.get("verifiedCount")))
    if args.openclaw_source_root:
        command = [sys.executable, "scripts/verify_reference_against_source.py", "--source-root", str(args.openclaw_source_root)]
        if args.openclaw_source_zip:
            command += ["--source-zip", str(args.openclaw_source_zip)]
        ok, output = run_utf8(command, cwd=ROOT)
        check("evidence-live", ok and "verified=104/104" in output, output)
    else:
        check("evidence-live", report.get("sourceSha256") == SOURCE_SHA, str(report.get("sourceSha256")))

    plan = (ROOT / "docs/plans/STEP002_CLI_AND_LOCAL_HOST_LIFECYCLE.md").read_text(encoding="utf-8")
    for heading in (
        "## 목적", "## 기준선", "## Reference Evidence", "## OpenClaw 문제 분석", "## 구현 범위",
        "## 공개 계약", "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 패키징 산출물", "## 제외",
    ):
        check(f"step002-heading:{heading}", heading in plan)

    cmd = (ROOT / "scripts/sh_run_step002_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd and b"\n" not in cmd.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd and b"run_step002_acceptance.py" in cmd)
    check("posix-launcher", (ROOT / "scripts/sh_run_step002_acceptance.sh").is_file())

    ok, output = run_utf8([sys.executable, "scripts/run_step001_acceptance.py"], cwd=ROOT)
    check("step001-regression", ok and "state=PASSED" in output, "regression_pass" if ok else output[-4000:])
    check("step001a-regression", "  packages/protocol: {}" in lock and "  packages/protocol:\n" not in lock)
    check("step001b-regression", workspace.count("autoInstallPeers: true") == 1 and lock.count("  autoInstallPeers: true") == 1)
    utf8_helper = (ROOT / "scripts/subprocess_utf8.py").read_text(encoding="utf-8")
    check("step001c-regression", "text=False" in utf8_helper and '.decode("utf-8", errors="replace")' in utf8_helper)
    entrypoint = (ROOT / "openrill.mjs").read_text(encoding="utf-8")
    check("step001d-regression", 'pathToFileURL(resolve(argv1)).href' in entrypoint and 'new URL(process.argv[1], "file:")' not in entrypoint)

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    check("step002-build-suite", ok and "OPENRILL_STEP001_SUITE_PASS" in output, "suite_pass" if ok else output[-4000:])

    ok, output = run_utf8(["node", "scripts/run-step002-live.mjs"], cwd=ROOT)
    check("step002-live-process", ok and "OPENRILL_STEP002_LIVE_PASS" in output, "live_pass" if ok else output[-3000:])

    with tempfile.TemporaryDirectory(prefix="openrill-step002-cli-") as temp:
        env = {"OPENRILL_DATA_ROOT": str(Path(temp) / "data"), "OPENRILL_CONFIG_ROOT": str(Path(temp) / "config")}
        ok, output = run_utf8(["node", "openrill.mjs", "--version"], cwd=ROOT, env=env)
        check("cli-version-live", ok and output == f"OpenRill {VERSION}", output)
        ok, output = run_utf8(["node", "openrill.mjs", "--help"], cwd=ROOT, env=env)
        check("cli-help-live", ok and "start      Start the foreground local Host" in output, output)
        ok, output = run_utf8(["node", "openrill.mjs", "status", "--profile", "empty", "--json"], cwd=ROOT, expected=3, env=env)
        try:
            status_json = json.loads(output)
        except json.JSONDecodeError:
            status_json = {}
        check("cli-stopped-status-live", ok and status_json.get("reason") == "STOPPED", output)
        ok, output = run_utf8(["node", "openrill.mjs", "start", "--bind", "0.0.0.0"], cwd=ROOT, expected=12, env=env)
        check("cli-loopback-guard-live", ok and "must be loopback" in output, "loopback_guard_pass" if ok else output)
        ok, output = run_utf8(["node", "openrill.mjs", "start", "--background"], cwd=ROOT, expected=2, env=env)
        check("cli-background-closed-live", ok and "unknown option" in output, output)

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
        f"STEP002_CLI_AND_LOCAL_HOST_LIFECYCLE checks={passed}/{len(checks)} state={state} "
        "host=FOREGROUND lock=PROFILE_SCOPED control=AUTHENTICATED_LOOPBACK readiness=SEPARATE_FROM_LISTEN"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
