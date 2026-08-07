# OR-ISSUE-326 — Connector account upsert could rebind durable ownership

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
SCHEMA=25
```

## Failure

Re-registering the same connector/account could overwrite the original Extension or workspace owner.

## Correction

Reject ownership changes with `CONNECTOR_BINDING_CONFLICT`; an exact owner replay only increments revision.

## Prevention contract

The STEP022B focused and governance suites contain an explicit source or runtime assertion for this boundary. Historical accepted artifacts are not rewritten.
