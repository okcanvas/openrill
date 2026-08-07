from __future__ import annotations

import os
from pathlib import Path

REPORT_PATH_ENV = "OPENRILL_ACCEPTANCE_REPORT_PATH"


def resolve_acceptance_report(root: Path, default_relative: str) -> Path:
    override = os.environ.get(REPORT_PATH_ENV)
    if override:
        candidate = Path(override)
        return candidate if candidate.is_absolute() else root / candidate
    return root / default_relative


def write_acceptance_report(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
