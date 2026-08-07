# OR-ISSUE-328 — Adopted ingress replay ignored changed route or text

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
SCHEMA=25
```

## Failure

A replay of an already adopted claim could return the old result even if the caller supplied a different route or message text.

## Correction

Reload binding, Conversation and Message evidence and reject semantic mismatch with `CONNECTOR_INGRESS_CONFLICT`.

## Prevention contract

The STEP022B focused and governance suites contain an explicit source or runtime assertion for this boundary. Historical accepted artifacts are not rewritten.
