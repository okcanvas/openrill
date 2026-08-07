# OR-ISSUE-332 — Connector diagnostics exposed Extension-provided error summaries

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
SCHEMA=25
```

## Failure

Payloads and claim tokens were redacted, but persisted summary text could include provider paths or secrets supplied by Extension code.

## Correction

Expose durable reason/error codes while omitting ingress/delivery/dead-letter summary text from Local Protocol.

## Prevention contract

The STEP022B focused and governance suites contain an explicit source or runtime assertion for this boundary. Historical accepted artifacts are not rewritten.
