# OR-ISSUE-170 — Terminal root structural mismatch waited until live timeout

## Symptom
The root Run and its only child were terminal, but the fixture continued polling for three delegations until approximately 181 seconds.

## Cause
The loop break condition required `items.length>=3` before reaching the explicit structural assertions.

## Correction
Polling ends when the root and all existing children are terminal. Exact direct-child/depth-2 assertions then fail immediately with bounded evidence.

## Gate
The live script must not include `items.length>=3` in the terminal break condition and must retain the exact structural assertions.
