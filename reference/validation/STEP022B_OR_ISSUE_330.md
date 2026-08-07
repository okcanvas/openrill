# OR-ISSUE-330 — Public ledger service accepted malformed filter IDs

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
SCHEMA=25
```

## Failure

Protocol validation was closed, but direct public service calls could send malformed connector/account filters to the repository.

## Correction

Apply the same bounded ID contract in all public list methods.

## Prevention contract

The STEP022B focused and governance suites contain an explicit source or runtime assertion for this boundary. Historical accepted artifacts are not rewritten.
