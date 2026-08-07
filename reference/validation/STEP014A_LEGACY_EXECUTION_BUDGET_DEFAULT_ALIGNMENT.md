# OR-ISSUE-125 — newly required execution budget fields reached SQLite as undefined

## Symptom

Historical Browser/Automation fixtures calling `ConversationService.startExecution()` with the pre-STEP014A budget shape failed with `Provided value cannot be bound to SQLite parameter 9`.

## Cause

`maxTotalTokens` and `maxDurationMs` were added to the TypeScript contract, but runtime callers in JavaScript and older internal adapters were not normalized before insertion into `run_budget_envelopes` and `run_attempts`.

## Correction

The Conversation boundary normalizes missing fields to 65,536 total tokens and 15 minutes before comparison, persistence, attempt configuration, and event recording. A focused behavioral test uses the legacy shape and requires both durable defaults.
