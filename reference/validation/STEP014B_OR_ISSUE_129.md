# OR-ISSUE-129 — Parent usage not durable before child reservation

## Symptom
A parent could request `agent.spawn` after the current model/tool usage changed in memory while `run_budget_envelopes` still contained older usage, allowing an oversized child reservation.

## Root cause
Kernel usage persistence occurred after completed turns/tools, not immediately before Tool dispatch where delegation capacity is reserved.

## Correction
Persist model token usage after every model turn and increment/persist Tool usage before Tool execution. `createDelegatedRun()` calculates remaining capacity only from durable usage and active reservations.

## Gate
The STEP014B integration suite creates children through real Kernel execution and verifies remaining-capacity enforcement.
