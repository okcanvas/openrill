# OR-ISSUE-088 — STEP013AR2 Windows acceptance silent unbounded stage wait

## Actual symptom

Command:

```cmd
pnpm acceptance:step013ar2
```

Observed result reported by the user on Windows:

```text
응답없이 멈춤
```

No stage marker or child-process output was visible, so the exact child stage that was still running cannot be established from the supplied evidence. This document does not guess that stage.

## Code evidence

Affected packaged script SHA-256:

```text
33f037e0b3190b08cffeffdd1d4afe4ee772b2ac25982a35953cf4c175ed05a4
```

The STEP013AR2 acceptance script:

1. called `clean()` before printing any output;
2. used one `subprocess.run(..., stdout=PIPE, stderr=STDOUT)` helper for every external stage;
3. supplied no `timeout` to any child process;
4. retained every child output in memory;
5. printed the aggregate report only after every stage completed.

Therefore a normally running stage was invisible, and a child that never exited could block the acceptance process indefinitely without identifying its stage.

## Root cause

The acceptance orchestration contract treated child commands as finite and observable without enforcing either property. Output capture and final-only reporting removed progress visibility, while unbounded `subprocess.run` made liveness depend entirely on each child process.

## Impact

- operators cannot distinguish a slow stage from a deadlocked stage;
- the last entered stage is unknown;
- no bounded timeout evidence is produced;
- Windows child or grandchild processes may remain alive after manual interruption;
- the STEP cannot be diagnosed from its terminal output alone.

## Fix

STEP013AR3 adds a shared stage runner that:

- emits a flushed `OPENRILL_ACCEPTANCE_STAGE_START` marker before launch;
- emits a heartbeat every 15 seconds while the child is alive;
- emits a flushed `OPENRILL_ACCEPTANCE_STAGE_END` marker;
- applies an explicit timeout to every external acceptance child;
- starts each child in a dedicated process group;
- on Windows, uses bounded `taskkill /PID <pid> /T /F` termination;
- on POSIX, terminates the process group and escalates to `SIGKILL` if required;
- preserves bounded child output and timeout/termination evidence;
- announces cleanup before repository scanning;
- prunes `node_modules`, `dist`, `.artifacts`, and `.git` from Python repository scans.

## Recurrence prevention

- focused fixture starts a child that sleeps for 30 seconds and requires timeout termination within the test bound;
- static gate rejects direct `subprocess.run`/`subprocess.Popen` use in the STEP013AR3 aggregate script;
- all external stages must appear in `STAGE_TIMEOUTS`;
- cleanup start/end markers are required;
- full canonical suite includes the stage-runner fixture;
- initial/final package-manifest gates remain mandatory.
