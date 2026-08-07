# OR-ISSUE-327 — Registered adapter behavior remained mutable

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
SCHEMA=25
```

## Failure

The registry retained the Extension-owned adapter object, so later mutation could change behavior after validation.

## Correction

Bind methods into a frozen Host-owned adapter snapshot.

## Prevention contract

The STEP022B focused and governance suites contain an explicit source or runtime assertion for this boundary. Historical accepted artifacts are not rewritten.
