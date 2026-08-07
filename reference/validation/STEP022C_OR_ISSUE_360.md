# OR-ISSUE-360 — Historical STEP022B protocol test froze the global Connector operation list at four

## Observed problem

STEP022C added `connector.status` and `connector.doctor`. The STEP022B test still deep-equaled every Connector capability to its original four ledger operations, so additive public operations failed historical validation.

## Correction

The historical test now proves that the four STEP022B ledger operations and permissions remain present and callable. Current STEP022C governance owns the expanded exact current contract.

## Recurrence gate

Historical protocol tests assert retained capabilities, not an immutable global capability count, unless the protocol is explicitly closed forever.
