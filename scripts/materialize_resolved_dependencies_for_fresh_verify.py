from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Copy an already-resolved OpenRill root node_modules link farm into a Fresh extraction without escaping the Fresh source root."
    )
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--target-root", type=Path, required=True)
    args = parser.parse_args()

    source_root = args.source_root.resolve()
    target_root = args.target_root.resolve()
    source_modules = source_root / "node_modules"
    target_modules = target_root / "node_modules"

    if source_root == target_root:
        raise SystemExit("source-root and target-root must differ")
    if not source_modules.is_dir() or source_modules.is_symlink():
        raise SystemExit(f"source node_modules must be a real directory: {source_modules}")
    if not (target_root / "pnpm-workspace.yaml").is_file():
        raise SystemExit(f"target-root is not an OpenRill source extraction: {target_root}")

    if target_modules.exists() or target_modules.is_symlink():
        if target_modules.is_dir() and not target_modules.is_symlink():
            shutil.rmtree(target_modules)
        else:
            target_modules.unlink()

    shutil.copytree(source_modules, target_modules, symlinks=True)

    scope = target_modules / "@openrill"
    links = 0
    failures: list[str] = []
    if not scope.is_dir():
        failures.append("missing @openrill scope")
    else:
        for entry in sorted(scope.iterdir(), key=lambda item: item.name):
            if not entry.is_symlink():
                failures.append(f"{entry.name}:not_symlink")
                continue
            links += 1
            resolved = entry.resolve(strict=False)
            try:
                resolved.relative_to(target_root)
            except ValueError:
                failures.append(f"{entry.name}:outside_target:{resolved}")

    if failures:
        shutil.rmtree(target_modules, ignore_errors=True)
        raise SystemExit("OPENRILL_FRESH_DEPENDENCY_MATERIALIZATION_FAIL " + ",".join(failures))

    print(
        "OPENRILL_FRESH_DEPENDENCY_MATERIALIZATION_PASS "
        f"source={source_root} target={target_root} workspace_links={links}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
