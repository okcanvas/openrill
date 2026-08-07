# OR-ISSUE-333 — Protocol advertised no connector recovery notice

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
SCHEMA=25
```

## Failure

The Host could publish `connector.recovered`, but the accepted capability list did not declare it.

## Correction

Add the exact notice topic to protocol capabilities and validate it in Windows live.

## Prevention contract

The STEP022B focused and governance suites contain an explicit source or runtime assertion for this boundary. Historical accepted artifacts are not rewritten.
