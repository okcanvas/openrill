# OR-ISSUE-116 — Historical Recovery Test Null-Pointer Freeze

## Symptom

After correcting the restart contract, the canonical suite failed one historical STEP006 test even though the recovered Run and new attempt behavior were correct.

The old assertion required:

```text
recovered.currentAttemptId == null
```

That assertion encoded the implementation detail that caused the real STEP013C Windows failure.

## Correction

The historical test now owns the durable behavior rather than the defective representation:

```text
recovered Run = CREATED/RESUMABLE
old attempt remains attached and is ABORTED/HOST_RESTART
transition to RUNNING creates a distinct attempt 2
```

It no longer requires a null pointer between recovery classification and deterministic rollover.

## Recurrence gate

Canonical recovery tests must reject both dangerous alternatives:

- clearing the pointer before execution preflight;
- resuming the old ABORTED attempt as RUNNING.
