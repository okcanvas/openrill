# Delegated-work control surface

## Protocol ownership

Exactly three operations are public in STEP014D:

```text
delegation.list   permission=delegation.read
delegation.get    permission=delegation.read
delegation.cancel permission=delegation.write
```

Inputs are closed and bounded. Outputs are `PublicDelegationView` projections owned by `ConversationService`, not raw repository rows.

## Privacy boundary

The public projection MUST NOT contain task text/hash, Conversation messages, reasoning, Tool payloads, provider payloads, event payloads, headers, cookies, or secrets. Event history is metadata-only and capped at the latest 100 records. Terminal summaries remain capped at 8,192 characters and Artifact references at 32.

## Cancellation boundary

Operator cancellation invokes the existing ordered subtree cancellation owner. It must clean Approval, Process, Browser and coordinator resources deepest-first before terminalizing each descendant. Repeated cancellation of an already-terminal delegation returns `replayed=true` and performs no mutation.

## UI boundary

The UI derives a tree from durable relation IDs and uses a seen set to prevent accidental render loops. It displays only the Protocol projection. No direct SQLite, repository, transcript, filesystem or Tool-ledger access is allowed.

## Live boundary

Windows acceptance requires an explicitly configured external model and a discovered/overridden Chromium executable. Protocol-only or static JavaScript-source inspection does not count as UI vertical-slice acceptance.
