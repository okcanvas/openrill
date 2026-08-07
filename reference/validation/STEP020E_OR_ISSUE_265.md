# OR-ISSUE-265 — Controller Tool governance drifted from actual Host and kernel symbols

## First observation

STEP020E governance searched for `runtimeForWakeRun` and a callback variable named `tool` while the implemented symbols are `bindingForWakeRun` and `definition`.

## Exact contradiction

The focused Host restart test already proved exact seven-Tool scope. The governance failure was caused only by stale or invented source-token names.

## Classification

Validation governance / code-symbol drift. No Product Tool-scope failure occurred in this run.

## Correction

Governance now checks `bindingForWakeRun` and the actual durable budget expression `modelToolDefinitions.map((definition) => definition.name)`.

## Recurrence gate

Source governance uses code-derived executable symbols and is updated from the inspected implementation before being promoted into a required assertion.
