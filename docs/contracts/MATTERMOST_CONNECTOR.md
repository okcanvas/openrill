# Mattermost Connector Contract

## Ownership

The Mattermost package owns transport-specific URL handling, REST calls, WebSocket lifecycle, event normalization, mention/thread routing, and provider receipt parsing. It does not own Conversation, Run, Task, Task Flow, Goal, Plan, or SQLite transaction semantics.

The Host-owned Connector runtime owns durable ingress, binding, logical delivery, attempts, receipts, dead letters, Run scheduling, terminal-output projection, and restart recovery.

## Ingress

A Mattermost `posted` WebSocket event is acknowledged internally only after `connector_ingress_events` persistence succeeds. Exact replay of the same post id and payload is idempotent. Changed content under the same post id fails closed.

Routing rules:

- direct and group-direct channels bypass mention requirements;
- public/private channels require an exact bot username mention when `requireMention=true`;
- self posts, system posts, unsupported events, unmentioned channel posts, and empty normalized text are ignored;
- broadcast channel/user/team identities must agree with the embedded post;
- channel and optional root post id become the durable external conversation/thread keys.

## Execution and output

Adoption atomically creates or reuses the binding, Conversation, user Message, and Run. Agent Host immediately schedules the adopted Run. A terminal COMPLETED Run with assistant text projects one logical delivery using `run:<runId>:assistant-final:v1`.

## Delivery certainty

- explicit HTTP rejection is `REJECTED`;
- validation failure before dispatch is `NOT_SENT`;
- timeout, connection loss, invalid successful response, or other uncertainty after POST dispatch is `MAYBE_ACCEPTED`;
- `MAYBE_ACCEPTED` becomes durable `UNCERTAIN` and is never automatically replayed.

A successful Mattermost post stores exact provider message, channel, thread, and bounded receipt metadata.

## Extension and secrets

The package is loaded through `openrill.extension.json`. The bot token is a required `SecretRef` resolved only during activation. The Extension registers one real `mattermost` adapter and unregisters it on disable, failure, or Host shutdown.

## Public diagnostics

`connector.status` and `connector.doctor` expose only closed fields. Base URL, WebSocket URL, token, raw provider body, and internal exception details are not public.

Doctor performs configuration validation, `/users/me` authentication, account identity validation, and a bounded WebSocket open/authentication-challenge probe. The real Windows Live harness separately proves actual posted-event receipt and threaded reply.

## Current exclusions

STEP022C does not claim attachments, reactions, slash commands, streaming draft edits, allowlists, multi-account policy, rate-limit scheduling, or dead-letter operator replay. Those belong to later Connector hardening steps.
