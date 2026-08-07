# STEP013C Automation Browser Execution, Durable Ledger, and Restart Recovery

```text
identity=STEP013C_AUTOMATION_BROWSER_EXECUTION_DURABLE_LEDGER_AND_RESTART_RECOVERY
version=0.13.9-step013c
schema=11
baseline=STEP013B3_BROWSER_ARTIFACTS_AND_BOUNDED_EVIDENCE
```

## Goal

Run the accepted Browser Tools from an Automation-triggered Agent Run and preserve enough durable state to classify and resume safely after Host process death.

## Deliverables

1. Migration 011 with Browser operation, operation-event, and bounded evidence tables.
2. Provider-neutral Browser Tool ledger adapter with input hashes and safe terminal projection.
3. Completed/replayed Tool checkpoints in Agent Kernel.
4. Recovery classification that accepts an in-flight model request after a completed-Tool checkpoint but rejects partial provider output.
5. Closure of STARTED model invocations after restart.
6. Automation RUNNING lease recovery only for linked resumable Agent Runs.
7. Production Automation executor resume path that preserves one conversation/submission/run.
8. Real Playwright two-Host crash/restart vertical slice.
9. No Browser protocol operation or new Browser Tool.

## Crash point

The deterministic model fixture blocks the second model HTTP request only after `browser.open` returned, its Tool result was persisted, and `run.checkpoint` was appended. Host child 1 is then force-killed rather than gracefully closed.

This crash point proves recovery from:

```text
Browser operation SUCCEEDED
Agent checkpoint durable
model invocation STARTED
latest Run event model.requested
Automation lease RUNNING
Browser process abruptly gone
```

## Expected recovery

Host child 2 must:

- mark any unfinished Browser operation INTERRUPTED;
- close the old STARTED model invocation with `MODEL_INTERRUPTED_BY_RESTART`;
- classify the Agent Run `CREATED/RESUMABLE`;
- requeue the expired Automation Run;
- reclaim it as attempt 2;
- resume the same Agent Run;
- receive `BROWSER_SESSION_NOT_FOUND` for the old process-local session;
- open a fresh Browser session explicitly;
- create a screenshot Artifact and durable evidence;
- complete both Agent and Automation Run;
- exit with zero Browser process ownership and zero Chromium orphans.

## Fail-closed cases

- no completed-Tool checkpoint;
- partial model text/reasoning/tool-call output after the checkpoint;
- linked Agent Run not resumable;
- Automation lease not expired;
- conflicting `(runId,toolCallId)` identity;
- raw Browser Tool input requested from the ledger;
- Browser session identity reused silently after restart.

## Exclusions

No evaluate, batch, upload, PDF, persistent profile, existing Browser attach, protocol operation, remote worker, or cross-machine recovery.
