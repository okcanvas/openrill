# Local Extension Contract

```text
CONTRACT=openrill.extension.json
SCHEMA_VERSION=1
EXTENSION_API_VERSION=1
TRUST=OPERATOR_SELECTED_LOCAL_CODE
SANDBOX=NOT_CLAIMED
```

## Manifest

```json
{
  "schemaVersion": 1,
  "id": "example.local",
  "displayName": "Example Local",
  "version": "1.0.0",
  "entry": "index.mjs",
  "compatibility": {
    "apiVersion": 1,
    "host": { "minInclusive": "0.22.0-step022a", "maxExclusive": "0.23.0" }
  },
  "capabilities": [{ "kind": "tool", "id": "example" }],
  "configSchema": {
    "additionalProperties": false,
    "fields": [{ "key": "token", "kind": "secret", "required": true }]
  }
}
```

The manifest and every nested object are closed and bounded. `entry` is a root-relative `.js` or `.mjs` regular file whose real path must remain inside the selected Extension root. This containment is not a JavaScript sandbox and does not constrain transitive imports performed by trusted Extension code.

## Host configuration

```yaml
extensions:
  roots:
    - extensions/example.local
  enabled:
    - example.local
  settings:
    example.local:
      values: {}
      secrets:
        token:
          kind: env
          key: EXAMPLE_TOKEN
```

Literal secret values are forbidden. Secret references are inspected before import and resolved only inside activation. Public views never include materialized secret values.

## Lifecycle

```text
DISCOVERED -> ACTIVATING -> READY -> DEACTIVATING -> DISABLED
       |          |                        |
       +-> BLOCKED+-> FAILED <-------------+
```

Discovery and configured activation are deterministic by Extension id. Every declared capability must be claimed exactly once during activation. Duplicate configured or active capability ownership is rejected. Import/activation and deactivation are bounded. Host shutdown deactivates in reverse activation order.

`extension.enable` and `extension.disable` affect only the current Host process. They do not rewrite configuration and therefore do not persist across restart. Persistent enablement remains Config ownership.

## Granted authority

The activation context contains only Extension identity, a frozen manifest, scalar config, `AbortSignal`, capability claim, and secret resolution. It does not expose state repositories or direct Conversation, Run, Attempt, Task, Task Flow, Goal, or Plan mutation authority. Future Connector and Provider bridges must be explicit Host-owned services.

## Excluded

- marketplace or remote package discovery;
- npm install and lifecycle scripts;
- hot reload;
- untrusted-code sandboxing;
- durable Connector ingress, delivery, and receipts;
- real Mattermost transport.
