from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STEP = "STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE"
VERSION = "0.25.0-step023a"
EXCLUDED_DIRS = {".git", "node_modules", "dist", ".artifacts", "__pycache__"}


def collect_actual(root: Path, manifest_path: Path) -> dict[str, tuple[int, str]]:
    actual: dict[str, tuple[int, str]] = {}
    for path in root.rglob("*"):
        if not path.is_file() or path == manifest_path:
            continue
        rel = path.relative_to(root)
        if any(part in EXCLUDED_DIRS for part in rel.parts) or path.suffix in {".pyc", ".pyo"}:
            continue
        data = path.read_bytes()
        actual[rel.as_posix()] = (len(data), hashlib.sha256(data).hexdigest())
    return actual


def bounded_paths(paths: list[str], limit: int = 8) -> str:
    shown = paths[:limit]
    suffix = f",...(+{len(paths) - limit})" if len(paths) > limit else ""
    return ",".join(shown) + suffix


def verify(root: Path) -> tuple[bool, str]:
    manifest_path = root / "PACKAGE_MANIFEST.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected = {item["path"]: (item["size"], item["sha256"]) for item in manifest["files"]}
    actual = collect_actual(root, manifest_path)

    missing = sorted(set(expected) - set(actual))
    extra = sorted(set(actual) - set(expected))
    changed = sorted(path for path in set(expected) & set(actual) if expected[path] != actual[path])
    identity_ok = (
        manifest.get("project") == "OpenRill"
        and manifest.get("step") == STEP
        and manifest.get("version") == VERSION
        and manifest.get("filesExcludingManifest") == len(actual)
    )
    ok = identity_ok and not missing and not extra and not changed
    detail = [
        f"OPENRILL_PACKAGE_MANIFEST_{'PASS' if ok else 'FAIL'}",
        f"declared={len(expected)}",
        f"actual={len(actual)}",
        f"missing={len(missing)}",
        f"extra={len(extra)}",
        f"changed={len(changed)}",
    ]
    if missing:
        detail.append(f"missing_paths={bounded_paths(missing)}")
    if extra:
        detail.append(f"extra_paths={bounded_paths(extra)}")
    if changed:
        detail.append(f"changed_paths={bounded_paths(changed)}")
    if not identity_ok:
        detail.append(
            "identity="
            f"{manifest.get('project')}:{manifest.get('step')}:{manifest.get('version')}:"
            f"filesExcludingManifest={manifest.get('filesExcludingManifest')}"
        )
    return ok, " ".join(detail)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify deterministic OpenRill package manifest")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    ok, detail = verify(args.root.resolve())
    print(detail)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
