from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Mapping, Sequence


def decode_utf8_output(payload: bytes) -> str:
    """Decode controlled OpenRill child-process output as UTF-8 without locale coupling."""
    return payload.decode("utf-8", errors="replace").strip()


def run_utf8(
    command: Sequence[str],
    *,
    cwd: Path,
    expected: int = 0,
    env: Mapping[str, str] | None = None,
) -> tuple[bool, str]:
    child_env = {
        **os.environ,
        "NO_COLOR": "1",
        "TERM": os.environ.get("TERM", "dumb"),
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
    }
    if env:
        child_env.update(env)
    completed = subprocess.run(
        list(command),
        cwd=cwd,
        text=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=False,
        env=child_env,
    )
    return completed.returncode == expected, decode_utf8_output(completed.stdout)
