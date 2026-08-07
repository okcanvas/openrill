# OR-ISSUE-115 — Typed Recovery Diagnostic Preservation

## Symptom

The STEP013C Windows failure exposed only `AUTOMATION_CONVERSATION_EXECUTION_FAILED`. The exact `ConversationError` code was discarded, and the live fixture removed its temporary SQLite tree during cleanup.

## Risk

A deterministic recovery contract failure can look like an opaque Automation executor failure. Re-running may change timing and lose the only state snapshot needed to diagnose the original run.

## Correction

`AutomationConversationExecutor` now preserves typed Conversation failures as bounded Automation error codes:

```text
ConversationError(RUN_STATE_INVALID)
→ AUTOMATION_CONVERSATION_RUN_STATE_INVALID
```

The corrective live fixture emits a privacy-safe failure snapshot before assertion and cleanup. It includes only:

```text
Automation status/error/attempt
Agent Run status/recovery/current attempt/last sequence
attempt numbers/status/recovery reason/terminal reason
latest event types and attempt IDs
model invocation number/status/error
Browser operation name/status/error
```

It does not print prompts, Tool arguments, console text, page-error text, headers, bodies, cookies, or URLs.

## Recurrence gates

- unit test requires typed executor mapping;
- boundary test requires the mapping source contract;
- live source gate requires `OPENRILL_STEP013CR1_RECOVERY_DIAGNOSTICS`;
- acceptance stage logs preserve the entire live output before bounded excerpt generation.
