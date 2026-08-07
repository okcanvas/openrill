# OR-ISSUE-154 — Historical Protocol capability list rejected additive operations

## Symptom and code-confirmed cause

The STEP004 handshake test deep-compared the full current operation list from before STEP014D. Correctly advertised `delegation.list/get/cancel` therefore failed negotiation regression despite Protocol version compatibility.

## Correction

The current exact capability expectation includes the three STEP014D operations while retaining all prior operations and protocol version 1.

## Recurrence gate

STEP004 verifies the complete sorted current list; STEP014D boundary tests verify exactly three delegation operations and no unsafe additions.
