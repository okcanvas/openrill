from __future__ import annotations

import argparse
import hashlib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRS = {".git", "node_modules", "dist", ".artifacts", "__pycache__"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create deterministic OpenRill STEP011 source ZIP")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    candidates: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if any(part in EXCLUDED_DIRS for part in relative.parts) or path.suffix in {".pyc", ".pyo"}:
            continue
        candidates.append(path)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(candidates, key=lambda item: item.relative_to(ROOT).as_posix()):
            relative = Path("openrill") / path.relative_to(ROOT)
            info = zipfile.ZipInfo(relative.as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if path.suffix == ".sh" or path.name == "openrill.mjs" else 0o644) << 16
            archive.writestr(info, path.read_bytes())
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    sha_path = output.with_suffix(output.suffix + ".sha256.txt")
    sha_path.write_text(f"{digest}  {output.name}\n", encoding="ascii")
    print(f"OPENRILL_STEP011_PACKAGE_PASS files={len(candidates)} sha256={digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
