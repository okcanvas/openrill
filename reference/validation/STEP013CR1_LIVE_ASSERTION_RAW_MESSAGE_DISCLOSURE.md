# OR-ISSUE-117 — Live Assertion Raw Message Disclosure

## Symptom

The local STEP013CR1 live prerequisite failure correctly stopped at `BROWSER_LAUNCH_FAILED`, but the pre-crash Browser ledger assertion included serialized `conversation_messages` in its assertion detail.

That output contained the fixture prompt and Browser Tool arguments. The durable Browser ledger remained privacy-safe, but the acceptance stage log was broader than the intended diagnostic contract.

## Root cause

The STEP013C diagnostic assertion was originally added to distinguish a missing Browser operation ledger row from an execution failure. It queried full message JSON and interpolated it into the assertion string.

## Correction

The assertion now emits only:

```text
toolName
status
errorCode
```

The corrective terminal diagnostic snapshot remains limited to status, attempt, event type, invocation status/error, and Browser operation status/error metadata.

## Recurrence gate

- corrective live source may not query `conversation_messages` or `content_json` for diagnostics;
- acceptance tests reject `preCrashMessages` and raw message query tokens;
- full stage logs remain permitted only because diagnostic payloads are metadata-only.
