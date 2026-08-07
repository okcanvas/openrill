# STEP020ER1 Windows Local Protocol Restart Connect Retry Closure

## Objective

Close the only actual Windows STEP020E LIVE failure without weakening completion-delivery semantics or hiding the failure with a test sleep.

## Scope

1. Preserve STEP020E schema 22, delivery, controller wake, required-completion, replay, and Tool-scope contracts.
2. Add bounded transport-only retry inside the production Local CLI protocol client.
3. Keep one caller-owned timeout across all attempts.
4. Fail security, protocol, and identity errors immediately.
5. Re-run the exact queued wake Run Host-restart scenario.

## Explicit non-goals

- No schema change.
- No unconditional retry.
- No Host READY delay or arbitrary Windows sleep.
- No change to Flow controller outcome ownership.
- No autonomous Goal Plan executor.
