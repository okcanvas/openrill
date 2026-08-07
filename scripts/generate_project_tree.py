from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {".git", "node_modules", "dist", ".artifacts", "__pycache__"}


def main() -> int:
    lines = ["openrill/"]
    paths = []
    for path in ROOT.rglob("*"):
        rel = path.relative_to(ROOT)
        if any(part in EXCLUDED for part in rel.parts):
            continue
        if path.suffix in {".pyc", ".pyo"}:
            continue
        paths.append(path)
    for path in sorted(paths, key=lambda item: (len(item.relative_to(ROOT).parts), item.relative_to(ROOT).as_posix())):
        rel = path.relative_to(ROOT)
        indent = "  " * len(rel.parts)
        suffix = "/" if path.is_dir() else ""
        lines.append(f"{indent}{rel.name}{suffix}")
    (ROOT / "PROJECT_TREE.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"OPENRILL_PROJECT_TREE_WRITTEN entries={len(paths)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
