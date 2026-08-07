from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE"
VERSION = "0.25.0-step023a"
EXCLUDED_DIRS = {".git", "node_modules", "dist", ".artifacts", "__pycache__"}
EXCLUDED_FILES = {"PACKAGE_MANIFEST.json"}


def included_files() -> list[Path]:
    result: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT)
        if any(part in EXCLUDED_DIRS for part in rel.parts):
            continue
        if path.name in EXCLUDED_FILES or path.suffix in {".pyc", ".pyo"}:
            continue
        result.append(path)
    return sorted(result, key=lambda item: item.relative_to(ROOT).as_posix())


def main() -> int:
    files = []
    for path in included_files():
        data = path.read_bytes()
        files.append(
            {
                "path": path.relative_to(ROOT).as_posix(),
                "size": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )
    manifest = {
        "schemaVersion": 1,
        "project": "OpenRill",
        "step": STEP,
        "version": VERSION,
        "filesExcludingManifest": len(files),
        "files": files,
    }
    (ROOT / "PACKAGE_MANIFEST.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"OPENRILL_PACKAGE_MANIFEST_WRITTEN files={len(files)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
