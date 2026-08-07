# OR-ISSUE-324 — Extension fixture treated Conversation list as a paged object

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
SCHEMA=25
```

## Failure

The test used `.items` although `ConversationService.list` returns an array.

## Correction

Use the actual service return shape and retain protocol pagination only at the protocol boundary.

## Prevention contract

The STEP022B focused and governance suites contain an explicit source or runtime assertion for this boundary. Historical accepted artifacts are not rewritten.
