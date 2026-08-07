# STEP014DR4 Failure Prevention Audit

## Windows failure examined
- root Run: COMPLETED;
- attempt 1: ABORTED / DELEGATION_WAIT;
- attempt 2: COMPLETED;
- first `agent.spawn`: success;
- second `agent.spawn`: `isError=true`;
- one depth-1 delegation completed;
- no depth-2 delegation;
- acceptance timed out before structural assertions.

## Prevented recurrences
1. A default leaf and a default nested child must both fit after the root first model turn.
2. The nested child must still fit one default grandchild and retain a resume turn.
3. Typed Tool error codes are stored without Tool input/output payload.
4. A terminal root no longer waits until the full live timeout before reporting a structural mismatch.
5. Explicit budgets remain unchanged and are still rejected when they exceed remaining capacity.
