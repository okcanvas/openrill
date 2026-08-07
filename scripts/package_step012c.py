from __future__ import annotations

import argparse
import hashlib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRS = {".git", "node_modules", "dist", ".artifacts", "__pycache__"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Create deterministic OpenRill STEP012C source ZIP")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if any(part in EXCLUDED_DIRS for part in relative.parts) or path.suffix in {".pyc", ".pyo"}:
            continue
        files.append(path)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files, key=lambda item: item.relative_to(ROOT).as_posix()):
            relative = Path("openrill") / path.relative_to(ROOT)
            info = zipfile.ZipInfo(relative.as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if path.suffix == ".sh" or path.name == "openrill.mjs" else 0o644) << 16
            archive.writestr(info, path.read_bytes())
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(output.suffix + ".sha256.txt").write_text(
        f"{digest}  {output.name}\n", encoding="ascii"
    )
    print(f"OPENRILL_STEP012C_PACKAGE_PASS files={len(files)} sha256={digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
