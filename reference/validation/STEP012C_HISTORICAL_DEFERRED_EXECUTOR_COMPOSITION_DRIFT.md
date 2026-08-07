# STEP012C Historical Deferred Executor Composition Drift

## Issue

`OR-ISSUE-065 — HISTORICAL_DEFERRED_EXECUTOR_COMPOSITION_DRIFT`

## Exact symptom

Historical STEP012B acceptance under STEP012C failed `host-scheduler-composition` and `host-enabled-fail-closed` although scheduler focused tests and product integration passed.

## Code-confirmed root cause

STEP012B intentionally deferred production Conversation integration and its historical static gate required `executor: options.automationExecutor` plus a message saying STEP012C owned future integration. STEP012C then fulfilled that deferred contract by selecting either the injected executor or `AutomationConversationExecutor`. The historical gate tested the temporary composition syntax rather than STEP012B's durable invariant: scheduler receives an executor and startup fails only when neither source exists.

## Fix

Historical STEP012B now accepts the current composition when:

- Host still exposes an injected executor option;
- one local `executor` is selected;
- `AutomationScheduler` receives that selected executor;
- production Conversation executor is allowed outside the scheduler package;
- startup remains fail-closed when no injected or configured-provider executor exists.

The scheduler package itself remains free of Protocol, Conversation, model, and UI imports.

## Recurrence prevention

Focused source gates verify invariant-based historical checks and reject restoration of exact `executor: options.automationExecutor` or obsolete deferred-message ownership.
