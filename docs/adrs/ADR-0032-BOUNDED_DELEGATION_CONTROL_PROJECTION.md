# ADR-0032 — Bounded delegation control projection

## Decision

Expose delegated work through a dedicated bounded public projection and three small Protocol operations. Do not expose repository rows or child Conversation content. Reuse the STEP014C subtree terminalization owner for operator cancellation. Render the Control UI from the same Protocol projection.

## Rationale

Delegation observability is operationally necessary, but raw child transcripts, Tool payloads and event payloads expand privacy and compatibility surfaces. A dedicated projection keeps relation/status/usage/evidence useful while retaining child execution isolation. Reusing cancellation ownership prevents a second cleanup path from drifting from timeout/parent-cancel behavior.

## Consequences

- public event history is bounded and metadata-only;
- task hashes remain internal despite being non-plaintext;
- UI cannot inspect raw child history;
- future transcript inspection requires a separate permissioned design;
- Windows acceptance must prove both Protocol and rendered Chromium UI.
