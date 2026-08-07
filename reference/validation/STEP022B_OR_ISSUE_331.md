# OR-ISSUE-331 — Already-aborted activation could leave a zombie adapter

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
SCHEMA=25
```

## Failure

Registering with a signal that had already fired inserted the adapter and then attached an abort listener that would never run.

## Correction

Reject an already-aborted signal before registration and prove registry size remains zero.

## Prevention contract

The STEP022B focused and governance suites contain an explicit source or runtime assertion for this boundary. Historical accepted artifacts are not rewritten.
