from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.25.0-step023a"
PACKAGE_PATTERNS = (
    "package.json",
    "apps/*/package.json",
    "services/*/package.json",
    "packages/*/package.json",
    "connectors/*/package.json",
    "skills/*/package.json",
)


def main() -> int:
    manifests: list[Path] = []
    for pattern in PACKAGE_PATTERNS:
        manifests.extend(ROOT.glob(pattern))
    manifests = sorted(set(manifests))
    failures: list[str] = []
    source_count = 0
    for manifest in manifests:
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        if payload.get("version") != VERSION:
            failures.append(f"manifest:{manifest.relative_to(ROOT).as_posix()}:{payload.get('version')}")
        source = manifest.parent / "src/index.ts"
        if not source.exists():
            continue
        source_count += 1
        match = re.search(r'PACKAGE_VERSION\s*=\s*"([^"]+)"', source.read_text(encoding="utf-8"))
        if not match:
            failures.append(f"source-missing:{source.relative_to(ROOT).as_posix()}")
        elif match.group(1) != VERSION:
            failures.append(f"source:{source.relative_to(ROOT).as_posix()}:{match.group(1)}")

    lifecycle = (ROOT / "services/agent-host/src/lifecycle.ts").read_text(encoding="utf-8")
    current_literals = re.findall(r'version:\s*"([^"]+)"|currentVersion:\s*"([^"]+)"', lifecycle)
    flattened = [left or right for left, right in current_literals]
    for value in flattened:
        if value != VERSION:
            failures.append(f"host-lifecycle:{value}")

    if failures:
        print("OPENRILL_SOURCE_VERSION_ALIGNMENT_FAIL " + " ".join(failures))
        return 1
    print(f"OPENRILL_SOURCE_VERSION_ALIGNMENT_PASS version={VERSION} manifests={len(manifests)} sources={source_count} host_literals={len(flattened)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
