from __future__ import annotations

import os
import signal
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class StageResult:
    ok: bool
    output: str
    returncode: int
    timed_out: bool
    elapsed_seconds: float
    termination: str


def _terminate_process_tree(process: subprocess.Popen[bytes]) -> str:
    details: list[str] = []
    if process.poll() is not None:
        return "already_exited"
    if os.name == "nt":
        try:
            completed = subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=10,
                check=False,
            )
            details.append(f"taskkill_rc={completed.returncode}")
        except (OSError, subprocess.TimeoutExpired) as error:
            details.append(f"taskkill_error={type(error).__name__}")
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            details.append("sigterm=sent")
        except ProcessLookupError:
            details.append("sigterm=already_exited")
        except OSError as error:
            details.append(f"sigterm_error={type(error).__name__}")

    try:
        process.wait(timeout=5)
        details.append("wait=exited")
    except subprocess.TimeoutExpired:
        if os.name != "nt":
            try:
                os.killpg(process.pid, signal.SIGKILL)
                details.append("sigkill=sent")
            except (ProcessLookupError, OSError) as error:
                details.append(f"sigkill_error={type(error).__name__}")
        else:
            try:
                process.kill()
                details.append("kill=sent")
            except OSError as error:
                details.append(f"kill_error={type(error).__name__}")
        try:
            process.wait(timeout=5)
            details.append("final_wait=exited")
        except subprocess.TimeoutExpired:
            details.append("final_wait=timeout")
    return ",".join(details)


def run_stage(
    *,
    name: str,
    command: list[str],
    cwd: Path,
    env: dict[str, str],
    timeout_seconds: float,
    heartbeat_seconds: float = 15.0,
) -> StageResult:
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be positive")
    if heartbeat_seconds <= 0:
        raise ValueError("heartbeat_seconds must be positive")

    print(
        f"OPENRILL_ACCEPTANCE_STAGE_START name={name} timeout_seconds={timeout_seconds:g}",
        flush=True,
    )
    started = time.monotonic()
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    with tempfile.TemporaryFile(mode="w+b") as capture:
        process = subprocess.Popen(
            command,
            cwd=cwd,
            env=env,
            stdout=capture,
            stderr=subprocess.STDOUT,
            creationflags=creationflags,
            start_new_session=os.name != "nt",
        )
        next_heartbeat = started + heartbeat_seconds
        timed_out = False
        termination = "none"
        while process.poll() is None:
            now = time.monotonic()
            elapsed = now - started
            if elapsed >= timeout_seconds:
                timed_out = True
                termination = _terminate_process_tree(process)
                break
            if now >= next_heartbeat:
                print(
                    f"OPENRILL_ACCEPTANCE_STAGE_HEARTBEAT name={name} elapsed_seconds={int(elapsed)}",
                    flush=True,
                )
                next_heartbeat = now + heartbeat_seconds
            time.sleep(min(0.2, max(0.01, timeout_seconds - elapsed)))

        if process.poll() is None:
            termination = _terminate_process_tree(process)
        returncode = process.poll()
        if returncode is None:
            returncode = -999
        elapsed = time.monotonic() - started
        capture.flush()
        capture.seek(0)
        output = capture.read().decode("utf-8", errors="replace")

    if timed_out:
        output += (
            f"\nOPENRILL_ACCEPTANCE_STAGE_TIMEOUT name={name} "
            f"timeout_seconds={timeout_seconds:g} termination={termination}\n"
        )
    state = "TIMEOUT" if timed_out else ("PASS" if returncode == 0 else "FAIL")
    print(
        f"OPENRILL_ACCEPTANCE_STAGE_END name={name} state={state} "
        f"returncode={returncode} elapsed_seconds={elapsed:.3f}",
        flush=True,
    )
    return StageResult(
        ok=not timed_out and returncode == 0,
        output=output,
        returncode=returncode,
        timed_out=timed_out,
        elapsed_seconds=elapsed,
        termination=termination,
    )
