# OR-ISSUE-323 — Retry fixture did not advance the deterministic clock

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
SCHEMA=25
```

## Failure

The product correctly scheduled the next delivery attempt after `retryAfterMs`, but the test immediately claimed at the old deterministic time and reported no work.

## Correction

Advance the fixture clock before the second claim. The bounded retry contract remains unchanged.

## Prevention contract

The STEP022B focused and governance suites contain an explicit source or runtime assertion for this boundary. Historical accepted artifacts are not rewritten.
