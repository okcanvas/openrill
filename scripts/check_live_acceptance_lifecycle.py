from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

HTTP_FIXTURES = (
    "scripts/run-step011-live.mjs",
    "scripts/run-step012d-live.mjs",
    "scripts/run-step014d-live.mjs",
    "scripts/run-step014dr6-external-model-live.mjs",
    "scripts/run-step014dr6-deterministic-nested-ui-live.mjs",
    "scripts/run-step014dr8-external-model-live.mjs",
    "scripts/run-step014dr8-deterministic-nested-ui-live.mjs",
    "scripts/live-vue-static.mjs",
)
HOST_FIXTURES = (
    "scripts/run-step014d-live.mjs",
    "scripts/run-step014dr6-external-model-live.mjs",
    "scripts/run-step014dr6-deterministic-nested-ui-live.mjs",
    "scripts/run-step014dr8-external-model-live.mjs",
    "scripts/run-step014dr8-deterministic-nested-ui-live.mjs",
)
CHROMIUM_FIXTURES = (
    "scripts/run-step011-live.mjs",
    "scripts/run-step012d-live.mjs",
    "scripts/run-step014d-live.mjs",
    "scripts/run-step014dr6-deterministic-nested-ui-live.mjs",
    "scripts/run-step014dr8-deterministic-nested-ui-live.mjs",
)


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def main() -> int:
    failures: list[str] = []
    helper = read("scripts/live-loopback-http.mjs")
    for token in (
        'agent: false',
        '"accept-encoding": "identity"',
        'connection: "close"',
        'request.setTimeout',
        'LIVE_HTTP_BODY_TOO_LARGE',
        'OPENRILL_LIVE_HTTP_START',
        'OPENRILL_LIVE_HTTP_END',
    ):
        if token not in helper:
            failures.append(f"helper-missing:{token}")

    for relative in HTTP_FIXTURES:
        source = read(relative)
        if "live-loopback-http.mjs" not in source:
            failures.append(f"http-helper-import:{relative}")
        direct_fetch = [
            line.strip()
            for line in source.splitlines()
            if re.search(r"\bfetch\s*\(", line)
            and "response.end(`" not in line
            and not line.lstrip().startswith("//")
        ]
        if direct_fetch:
            failures.append(f"direct-fetch:{relative}:{len(direct_fetch)}")

    for relative in (
        "scripts/run-step014dr6-deterministic-nested-ui-live.mjs",
        "scripts/run-step014dr8-deterministic-nested-ui-live.mjs",
    ):
        deterministic = read(relative)
        if not re.search(r'getLoopbackText\(new URL\(entry,\s*uiBase\).*?module\.text', deterministic, re.S):
            failures.append(f"deterministic-module-body-not-consumed:{relative}")

    current = read("scripts/run-step014dr8-deterministic-nested-ui-live.mjs")
    for token in (
        "await closeBrowser({ child, cdp })",
        "OPENRILL_STEP014DR8_BROWSER_LAUNCH_CLEANUP_FAILED",
        "chromium-taskkill-exit",
    ):
        if token not in current:
            failures.append(f"current-partial-launch-cleanup:{token}")

    for token in (
        "let primaryError;",
        "const cleanupFailures = []",
        "OPENRILL_STEP014DR8_BODY_AND_CLEANUP_FAILED",
        "OPENRILL_STEP014DR8_CLEANUP_FAILED",
    ):
        if token not in current:
            failures.append(f"current-final-cleanup-evidence:{token}")
    for forbidden in (
        "await closeBrowser(browser).catch(() => undefined)",
        'await host?.close("step014dr8-ui-live").catch(() => undefined)',
    ):
        if forbidden in current:
            failures.append(f"current-final-cleanup-suppressed:{forbidden}")

    for relative in HOST_FIXTURES:
        source = read(relative)
        close_index = source.rfind("await host?.close(")
        closed_index = source.rfind("await host?.closed")
        rm_index = source.rfind("rm(root")
        if min(close_index, closed_index, rm_index) < 0 or not (close_index < closed_index < rm_index):
            failures.append(f"host-close-order:{relative}")

    for relative in CHROMIUM_FIXTURES:
        source = read(relative)
        if "resolveChromiumExecutable" not in source:
            failures.append(f"chromium-discovery:{relative}")
        if "chromium_orphan=0" not in source and "terminateChildAndWait(browser" not in source:
            failures.append(f"chromium-orphan-boundary:{relative}")
        if not re.search(r"close(?:Ui)?Browser|browser\.cdp\.close|cdp\.close|terminateChildAndWait\(browser", source):
            failures.append(f"chromium-close:{relative}")

    if failures:
        print("OPENRILL_LIVE_ACCEPTANCE_LIFECYCLE_AUDIT_FAIL " + " ".join(failures))
        return 1
    print(
        "OPENRILL_LIVE_ACCEPTANCE_LIFECYCLE_AUDIT_PASS "
        f"http_fixtures={len(HTTP_FIXTURES)} host_fixtures={len(HOST_FIXTURES)} "
        f"chromium_fixtures={len(CHROMIUM_FIXTURES)} transport=BOUNDED_NODE_HTTP body=DRAINED lifecycle=ORDERED"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
