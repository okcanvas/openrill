# OR-ISSUE-353 — WebSocket ingress persistence errors were swallowed

## Observed problem

The initial message handler chained persistence with a terminal catch that could discard an event when the database operation failed.

## Correction

Persistence is retried three times; persistent failure sets a bounded error code and closes the socket with 1011 so reconnect/replay can recover.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
