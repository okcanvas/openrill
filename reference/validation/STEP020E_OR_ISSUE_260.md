# OR-ISSUE-260 — Restarted controller wake inherited the global Tool registry

## First observation

The Host restart test showed the first controller wake Attempt had exactly seven `task_flow.*` tools, but the resumed Attempt received the broader global Tool set.

## Direct cause

The root delegation budget envelope persisted all registered Tool names. On recovery that durable envelope took precedence over the Host's controller-specific `modelToolDefinitions`.

## Correction

The kernel now persists only the actual Tool definitions supplied to that Run. A restarted wake Run therefore retains the exact seven-tool controller scope; normal child and delegation Runs still expose none of them.

## Recurrence gate

Durable Run provenance must preserve the effective Tool scope, not the global registry. Host restart evidence asserts exact tool-name equality before and after recovery.
