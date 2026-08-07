from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_PATTERN = re.compile(r"^openrill-step.+\.zip(?:\.sha256\.txt)?$", re.IGNORECASE)


def prohibited_archives(root: Path) -> list[str]:
    return sorted(
        path.name
        for path in root.iterdir()
        if path.is_file() and ARCHIVE_PATTERN.fullmatch(path.name)
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Reject immutable release archives placed inside the OpenRill source root")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    root = args.root.resolve()
    archives = prohibited_archives(root)
    if archives:
        print(
            "OPENRILL_SOURCE_ROOT_ARCHIVE_FAIL "
            f"count={len(archives)} paths={','.join(archives)} "
            "action=move_archives_outside_source_root"
        )
        return 1
    print("OPENRILL_SOURCE_ROOT_ARCHIVE_PASS count=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
