# STEP011R4 approval TTL and process timeout coupling

## Exact symptom

The real Windows command completed every STEP011R4 source, package, Vue/CSP, and canonical-suite check, then failed only in the actual Chromium vertical slice:

```text
Error: approved process output missing: {"name":"process.run","output":{"error":{"code":"APPROVAL_EXPIRED","message":"approval request expired"}},"isError":true}
STEP011_CONTROL_UI_VERTICAL_SLICE checks=216/217 state=FAILED
STEP011R4_VUE_RUNTIME_ONLY_AND_CSP_ALIGNMENT checks=151/152 state=FAILED
```

The browser had already rendered the pending approval and followed the approval deep link. The model's next turn received an expiry Tool result instead of the expected successful process result.

## Code-confirmed root cause

`ApprovalService` and `ProcessManager` already accept independent timeout inputs:

- `ApprovalServiceOptions.timeoutMs` determines `approval_requests.expires_at`.
- `ProcessManagerOptions.defaultTimeoutMs` determines foreground child-process execution timeout.

The Host composition incorrectly supplied the same config field to both:

```text
ApprovalService.timeoutMs <- execution.defaultTimeoutMs
ProcessManager.defaultTimeoutMs <- execution.defaultTimeoutMs
```

The STEP011 live fixture set `execution.defaultTimeoutMs: 5000`. Therefore every pending approval expired after five seconds, even though the field was also needed as the short process execution bound. The 250 ms Host expiry loop converted the request to `EXPIRED`, appended `APPROVAL_EXPIRED`, and resumed the Run before the Windows Chromium interaction completed.

## Impact

A user lowering the default process execution timeout also shortened the human approval decision window. Slow browser startup, accessibility traversal, remote desktop latency, or an operator taking more than the process timeout could expire an otherwise valid approval. This affected product behavior, not only the assertion text in the acceptance runner.

## Fix

The execution config now has two explicit clocks:

```text
execution.defaultTimeoutMs  = process.run default execution timeout
execution.approvalTimeoutMs = pending approval decision TTL
```

Both default to 120000 ms for backward compatibility. Host composition passes `approvalTimeoutMs` only to `ApprovalService` and `defaultTimeoutMs` only to `ProcessManager`. The STEP011 browser fixture deliberately uses `5000` for process execution and `120000` for approval, proving that the two settings remain independent.

## Detailed evidence

The recurrence test verifies all four boundaries:

1. config materialization preserves different values;
2. omitted config produces explicit 120000/120000 defaults;
3. Host source wiring uses different fields and rejects the old coupling expression;
4. the real STEP011 browser fixture retains the short process timeout while declaring the longer approval window.

The state schema remains 7 because no SQLite table or migration changes.

## Recurrence-prevention gate

`tests/unit/approval-timeout-separation-step011r5.test.mjs` is part of the serial canonical suite. `scripts/run_step011r5_acceptance.py` also performs source-level wiring, config-contract, live-fixture, issue-registry, and fresh-package checks before invoking the complete STEP011 Chromium regression.
