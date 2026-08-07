# STEP011R7 approval creation notice missing

## Exact symptom

The actual Windows `pnpm acceptance:step011r7` browser evidence reached the approvals route with the complete Vue runtime and protocol connection:

```text
url=<LOOPBACK>/#/approvals
readyState=complete
vueVersion=3.5.40
appShell=true
connection=CONNECTED
alert=null
appText=...ApprovalsNo approvals.
diagnostics=[]
```

The browser did not render `[data-testid="approval-allow-once"]`, so the nested STEP011 full regression failed.

## Code-confirmed root cause

The initial Control UI bootstrap calls `approval.list` before the model reaches `process.run`, so an empty initial list is expected.

When authorization is required, `ApprovalService.authorizeOrRequest()` durably creates the PENDING request before the Kernel emits an `approval.requested` progress event. In STEP011R7, `AgentRunCoordinator` published every Kernel progress event only as:

```text
run.event
```

The browser's notice handler reloads approvals only for:

```text
approval.updated → loadApprovals()
```

It does not and should not derive an approval list from generic `run.event` payloads. STEP011R7 therefore had no creation-time notice that could trigger a second `approval.list` call. Resolve, cancel, and expire paths already published `approval.updated`; creation was the missing transition.

The R7 browser failure output did not include an approval ledger query, so the pasted Windows evidence alone does not directly prove the row contents. R8 adds bounded ledger evidence specifically to remove that diagnostic gap on any recurrence.

## Impact

- a newly created pending approval can remain invisible in an already connected Control UI;
- the UI displays `No approvals.` and cannot issue `allow_once`, so the Agent Run cannot resume;
- approval TTL eventually expires even though the user opened the correct route;
- Vue/CSP/WebSocket health appears normal, making the missing domain transition the only visible failure;
- prior browser evidence did not distinguish “row not created” from “row created but list not refreshed.”

## Fix

- preserve the existing `run.event` publication for every Kernel progress event;
- when the event is a valid `approval.requested` payload, also publish `approval.updated` with the canonical run ID;
- keep the browser's explicit `approval.updated → approval.list` reload boundary;
- reject creation-domain publication for ordinary progress and malformed approval payloads;
- on pending-approval render timeout, query and print bounded approval rows, Run status, and provider request count between stable evidence markers.

## Detailed evidence

- R7 browser evidence: Vue 3.5.40, app shell mounted, protocol connected, no alert, no diagnostics, approval list empty.
- R7 coordinator source: `onProgress` published `run.event` only.
- R7 browser source: `loadApprovals()` was called on `approval.updated` only.
- approval service source: PENDING approval is inserted before `approval.requested` reaches the coordinator.
- R8 focused test: `approval.requested` publishes `run.event` then `approval.updated` with the same canonical request payload.
- R8 focused test: ordinary progress and malformed approval payloads emit no approval domain notice.
- R8 focused/static test: the UI keeps the explicit domain-notice refresh contract and the live runner includes ledger evidence.
- R8 canonical serial suite: 162/162, 30 files, skipped zero.

## Recurrence-prevention gate

`pnpm acceptance:step011r8` requires:

```text
focused-approval-notice-tests 3/3
approval-request-run-event-preserved
approval-request-domain-notice-created
approval-domain-notice-guarded
ui-approval-list-domain-refresh
ui-run-event-not-coupled-to-approval-list
approval-wait-ledger-evidence
canonical-suite 162/162
actual Chromium pending approval render
```
