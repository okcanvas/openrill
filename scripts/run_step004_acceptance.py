from __future__ import annotations

import json
import shutil
from pathlib import Path

from subprocess_utf8 import run_utf8

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reference/validation/STEP004_ACCEPTANCE_REPORT.txt"
VERSION = "0.6.1-step006a"
STEP = "STEP004_LOCAL_PROTOCOL_AND_AUTHENTICATED_WEBSOCKET"
EXPECTED_EVIDENCE = 104


def clean_generated() -> None:
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
    return result


def main() -> int:
    clean_generated()
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: object, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    check("root-version", package.get("version") == VERSION, str(package.get("version")))
    check("package-manager", package.get("packageManager") == "pnpm@11.15.1", str(package.get("packageManager")))
    check("step004-script", package.get("scripts", {}).get("acceptance:step004") == "python scripts/run_step004_acceptance.py")
    check("step004-package-script", "package_step004.py" in package.get("scripts", {}).get("package:step004", ""))

    required = [
        "packages/protocol/src/frames.ts",
        "packages/protocol/src/validation.ts",
        "services/agent-host/src/transport/upgrade-policy.ts",
        "services/agent-host/src/transport/websocket-codec.ts",
        "services/agent-host/src/transport/notice-window.ts",
        "services/agent-host/src/transport/operation-registry.ts",
        "services/agent-host/src/transport/protocol-server.ts",
        "apps/agent-web/src/api/local-protocol-client.ts",
        "tests/unit/protocol-step004.test.mjs",
        "tests/unit/local-protocol-step004.test.mjs",
        "scripts/run-step004-live.mjs",
        "scripts/run_step004_acceptance.py",
        "scripts/sh_run_step004_acceptance.cmd",
        "scripts/sh_run_step004_acceptance.sh",
        "scripts/package_step004.py",
        "docs/contracts/LOCAL_PROTOCOL.md",
        "docs/security/LOCAL_PROTOCOL_SECURITY.md",
        "docs/plans/STEP004_LOCAL_PROTOCOL_AND_AUTHENTICATED_WEBSOCKET.md",
        "docs/adrs/ADR-0019-NARROW_AUTHENTICATED_LOCAL_WEBSOCKET.md",
        "reference/openclaw/LOCAL_PROTOCOL.md",
    ]
    for rel in required:
        check(f"required:{rel}", (ROOT / rel).is_file())

    all_manifests = manifests()
    versions = {json.loads(path.read_text(encoding="utf-8")).get("version") for path in all_manifests}
    check("manifest-count", len(all_manifests) == 25, str(len(all_manifests)))
    check("manifest-version-alignment", versions == {VERSION}, json.dumps(sorted(versions)))
    all_dependencies: dict[str, str] = {}
    for path in all_manifests:
        data = json.loads(path.read_text(encoding="utf-8"))
        for field in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            all_dependencies.update(data.get(field, {}))
    check("no-openclaw-dependency", not any(name == "openclaw" or name.startswith("@openclaw/") for name in all_dependencies))
    check("no-websocket-runtime-dependency", "ws" not in all_dependencies and "@types/ws" not in all_dependencies)
    check("ui-framework-still-deferred", not ({"react", "vue", "lit", "svelte", "solid-js"} & set(all_dependencies)))

    frames = (ROOT / "packages/protocol/src/frames.ts").read_text(encoding="utf-8")
    validation = (ROOT / "packages/protocol/src/validation.ts").read_text(encoding="utf-8")
    for token in (
        'OPENRILL_PROTOCOL_MIN = 1', 'OPENRILL_PROTOCOL_MAX = 1', 'OPENRILL_WEBSOCKET_PATH = "/protocol"',
        'OPENRILL_WEBSOCKET_SUBPROTOCOL = "openrill.local.v1"', 'type: "open"', 'type: "accepted"',
        'type: "rejected"', 'type: "call"', 'type: "result"', 'type: "notice"',
        'idempotencyKey: string', 'sequence: number', 'resyncRequired: boolean',
    ):
        check(f"frame-contract:{token}", token in frames)
    for token in (
        "hasExactKeys", "validateOpenFrame", "validateCallFrame", "validateServerFrame", "negotiateProtocol",
        "open frame must be a closed object", "call frame must be a closed object",
        "diagnostics.ping input must be a closed object",
    ):
        check(f"validation-contract:{token}", token in validation)

    policy = (ROOT / "services/agent-host/src/transport/upgrade-policy.ts").read_text(encoding="utf-8")
    for token in (
        "isLoopbackAddress", "hasForwardedHeaders", "connectionRequestsUpgrade", "originAllowed", 'code: "PROXY_DENIED"',
        'code: "ORIGIN_DENIED"', 'code: "REMOTE_DENIED"', "OPENRILL_WEBSOCKET_SUBPROTOCOL",
    ):
        check(f"upgrade-policy:{token}", token in policy)
    check("trusted-proxy-surface-zero", "trustedProxies" not in policy and "allowRealIpFallback" not in policy)

    codec = (ROOT / "services/agent-host/src/transport/websocket-codec.ts").read_text(encoding="utf-8")
    for token in (
        "WEBSOCKET_GUID", "Sec-WebSocket-Accept", "client frames must be masked",
        "fragmented or extended frames are not supported", "only UTF-8 text frames are supported",
        'new TextDecoder("utf-8", { fatal: true })', "opcode === 0x9", "opcode === 0x8", "control frame payload is too large", "invalid close frame payload",
    ):
        check(f"codec-contract:{token}", token in codec)
    check("codec-compression-zero", "permessage-deflate" not in codec.lower())

    server = (ROOT / "services/agent-host/src/transport/protocol-server.ts").read_text(encoding="utf-8")
    for token in (
        "DEFAULT_HANDSHAKE_TIMEOUT_MS = 3000", "MAX_PREAUTH_PAYLOAD_BYTES = 16 * 1024",
        "MAX_AUTHENTICATED_PAYLOAD_BYTES = 64 * 1024", "MAX_OUTBOUND_BUFFER_BYTES = 256 * 1024",
        "MAX_IDEMPOTENCY_ENTRIES = 128", "timingSafeEqual", "preauthFrames > 1",
        "PROTOCOL_MISMATCH", "AUTH_FAILED", "IDEMPOTENCY_CONFLICT", "resyncRequired",
        "allPeers", "slow consumer",
    ):
        check(f"protocol-server:{token}", token in server)
    check("token-query-zero", "searchParams" not in server and "?token" not in server)

    operations = (ROOT / "services/agent-host/src/transport/operation-registry.ts").read_text(encoding="utf-8")
    check("operation-host-status", 'name: "host.status"' in operations and 'permission: "host.read"' in operations)
    check("operation-diagnostics-ping", 'name: "diagnostics.ping"' in operations and 'permission: "diagnostics.read"' in operations)
    check("operation-business-surface-zero", all(token not in operations for token in ("conversation.", "run.", "approval.", "workspace.", "skill.", "automation.", "artifact.")))

    notice = (ROOT / "services/agent-host/src/transport/notice-window.ts").read_text(encoding="utf-8")
    check("notice-monotonic-sequence", "sequence: ++this.sequence" in notice)
    check("notice-bounded-window", "while (this.retained.length > this.capacity)" in notice)
    check("notice-stale-resync", "cursor < oldest - 1" in notice and "resyncRequired: true" in notice)

    lifecycle = (ROOT / "services/agent-host/src/lifecycle.ts").read_text(encoding="utf-8")
    check("host-attaches-protocol", "attachLocalProtocolServer" in lifecycle)
    check("separate-control-and-protocol-tokens", "controlToken, protocolToken" in lifecycle and "profileToken: protocolToken" in lifecycle)
    check("host-lifecycle-notices", lifecycle.count('protocol.publishNotice("host.lifecycle"') >= 3)
    check("host-closes-all-protocol-peers", "protocol.closeAll()" in lifecycle)

    web = (ROOT / "apps/agent-web/src/api/local-protocol-client.ts").read_text(encoding="utf-8")
    check("web-native-websocket", "new WebSocket" in web and "OPENRILL_WEBSOCKET_SUBPROTOCOL" in web)
    check("web-protocol-only", "@openrill/protocol" in web)
    check("web-validates-server-frames", "validateServerFrame" in web)
    check("web-node-import-zero", 'from "node:' not in web)
    check("web-framework-import-zero", all(name not in web for name in ("react", "vue", "lit", "svelte", "solid-js")))

    tests = (ROOT / "tests/unit/local-protocol-step004.test.mjs").read_text(encoding="utf-8")
    for token in (
        "authenticated WebSocket negotiates protocol", "bad token and non-overlapping protocol",
        "first frame, pre-auth byte budget, and one-handshake rule", "silent pre-auth connection",
        "unknown operations, closed input schemas, and idempotency conflicts",
        "notice sequence replays within the retained window", "foreign Origin and untrusted proxy",
        "framework-neutral browser client",
    ):
        check(f"unit-contract:{token}", token in tests)

    evidence = json.loads((ROOT / "reference/openclaw/EVIDENCE_INDEX.json").read_text(encoding="utf-8"))
    report = json.loads((ROOT / "reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json").read_text(encoding="utf-8"))
    check("evidence-count", len(evidence) == EXPECTED_EVIDENCE, str(len(evidence)))
    check("evidence-unique", len({item["id"] for item in evidence}) == len(evidence))
    check("evidence-report", report.get("allVerified") is True and report.get("verifiedCount") == EXPECTED_EVIDENCE, str(report.get("verifiedCount")))
    for identifier in ("OC-PROTO-008", "OC-PROTO-009", "OC-PROTO-010", "OC-PROTO-011", "OC-PROTO-012"):
        check(f"evidence:{identifier}", any(item["id"] == identifier for item in evidence))

    plan = (ROOT / "docs/plans/STEP004_LOCAL_PROTOCOL_AND_AUTHENTICATED_WEBSOCKET.md").read_text(encoding="utf-8")
    for heading in (
        "## 목적", "## 기준선", "## Reference Evidence", "## OpenClaw 문제 분석", "## 구현 범위",
        "## 공개 계약", "## 상태 전이", "## 실패 및 복구", "## Acceptance", "## 패키징 산출물", "## 제외", "## 완료 선언",
    ):
        check(f"step004-heading:{heading}", heading in plan)
    check("plan-independent-redesign", "OpenClaw protocol을 복제하지 않고" in plan)
    check("protocol-doc", (ROOT / "docs/contracts/LOCAL_PROTOCOL.md").is_file())
    check("security-doc", (ROOT / "docs/security/LOCAL_PROTOCOL_SECURITY.md").is_file())
    check("reference-study", (ROOT / "reference/openclaw/LOCAL_PROTOCOL.md").is_file())

    cmd = (ROOT / "scripts/sh_run_step004_acceptance.cmd").read_bytes()
    check("windows-launcher-crlf", b"\r\n" in cmd and b"\n" not in cmd.replace(b"\r\n", b""))
    check("windows-launcher-root-relative", b"%~dp0.." in cmd and b"run_step004_acceptance.py" in cmd)
    check("posix-launcher", (ROOT / "scripts/sh_run_step004_acceptance.sh").is_file())

    ok, output = run_utf8(["python", "scripts/run_step003a_acceptance.py"], cwd=ROOT)
    check("step003a-regression", ok and "checks=50/50 state=PASSED" in output, "step003a_pass" if ok else output[-6000:])

    ok, output = run_utf8(["node", "scripts/run-step001-suite.mjs"], cwd=ROOT)
    check(
        "build-unit-architecture-exports",
        ok and "OPENRILL_STEP001_SUITE_PASS unit_files=14 reporter=TAP" in output
        and "# tests 65" in output and "# pass 65" in output and "# fail 0" in output,
        "suite_pass" if ok else output[-6000:],
    )

    ok, output = run_utf8(["node", "scripts/run-step004-live.mjs"], cwd=ROOT)
    check(
        "step004-live-process",
        ok and "OPENRILL_STEP004_LIVE_PASS protocol=1 auth=PROFILE_TOKEN call=CORRELATED" in output,
        "live_pass" if ok else output[-6000:],
    )

    check("database-files-zero", not any(ROOT.rglob("*.db")) and not any(ROOT.rglob("*.db-wal")) and not any(ROOT.rglob("*.db-shm")))
    check("runtime-files-zero", not any(path.name in {"host.lock", "host.json", "config.mutation.lock"} for path in ROOT.rglob("*")))
    protected = [
        path for path in ROOT.rglob("*") if path.is_file()
        and (path.name in {".env", ".env.local"} or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"})
    ]
    check("protected-payload-zero", not protected, ",".join(path.name for path in protected[:5]))
    reports = "\n".join(path.read_text(encoding="utf-8", errors="replace") for path in (ROOT / "reference/validation").glob("*.txt"))
    check("profile-token-value-not-reported", "PROFILE_TOKEN_VALUE=" not in reports and "controlToken\":" not in reports and "protocolToken\":" not in reports)

    clean_generated()
    generated = [
        path.relative_to(ROOT).as_posix() for path in ROOT.rglob("*")
        if any(part in {"dist", ".artifacts", "__pycache__"} for part in path.relative_to(ROOT).parts)
    ]
    check("generated-cleanup", not generated, ",".join(generated[:5]))

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
        "protocol=V1 auth=PROFILE_TOKEN transport=LOOPBACK_WEBSOCKET replay=BOUNDED"
    )
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0 if state == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
