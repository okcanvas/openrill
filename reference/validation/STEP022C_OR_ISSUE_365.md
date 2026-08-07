# OR-ISSUE-365 — Container streaming session mode was unavailable for the official aggregate

## Observed problem

The official unchanged STEP022C aggregate was started through the container interactive-session path so its long canonical stage could be observed without an outer-call timeout. The runtime rejected that invocation with `StreamingExecNotEnabledContainerError` before the acceptance process started.

## Correction

The same acceptance command is launched as a detached local process with stdout, stderr, exit code and PID written to bounded files. The current validation turn polls those files until the process terminates and validates the official report marker. No acceptance stage, command or timeout is changed.

## Recurrence gate

Do not assume interactive streaming support in a container runtime. Probe or use a detached process with explicit PID, log and exit-code files while keeping the authoritative acceptance command unchanged.
