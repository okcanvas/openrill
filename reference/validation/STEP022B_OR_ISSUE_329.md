# OR-ISSUE-329 — Receipt replay ignored provider conversation and thread identity

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
SCHEMA=25
```

## Failure

Receipt replay compared only the provider message and receipt payload.

## Correction

Compare provider message, conversation, thread and receipt content/hash before returning replay.

## Prevention contract

The STEP022B focused and governance suites contain an explicit source or runtime assertion for this boundary. Historical accepted artifacts are not rewritten.
