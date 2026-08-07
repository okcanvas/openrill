# OR-ISSUE-325 — Empty connector recovery notice consumed the bounded notice window

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
SCHEMA=25
```

## Failure

Startup emitted a recovery notice even when all recovery counts were zero, changing replay cursors and breaking historical notice-window behavior.

## Correction

Publish `connector.recovered` only when at least one durable row changed.

## Prevention contract

The STEP022B focused and governance suites contain an explicit source or runtime assertion for this boundary. Historical accepted artifacts are not rewritten.
