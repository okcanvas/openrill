# STEP022C — Mattermost Real Connector Durable Vertical Slice

```text
STEP=STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE
VERSION=0.24.0-step022c
STATE_SCHEMA=25
SOURCE_PACKAGE=LOCAL_SOURCE_ACCEPTED_PENDING_FINAL_GATE
PROMOTION=WINDOWS_MATTERMOST_REAL_LIVE_PENDING
OFFICIAL_PRODUCT_BASELINE=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
```

## Goal

Turn STEP022B's connector-neutral durable ledger into one real end-to-end channel without creating a second execution engine or allowing transport code to own durable Product state.

## Implemented slice

- packaged Mattermost Extension and SecretRef token;
- REST `/users/me` and `/posts` with response limits and bounded timeouts;
- WebSocket authentication challenge, posted-event processing, reconnect, and persistence-failure recovery;
- DM/group-DM, exact channel mention, channel/thread routing;
- durable ingress to atomic binding/Conversation/Message/Run;
- immediate Host scheduling of adopted Runs;
- terminal assistant output to idempotent logical delivery;
- exact Mattermost receipt persistence;
- public closed status/doctor operations;
- startup projection recovery and duplicate-free restart.

## Acceptance model

Local source acceptance requires build, 24 focused Mattermost tests, retained STEP022B/STEP022A/STEP021BR2 tests, affected Config/Protocol/Host tests, cumulative governance, full canonical suite, architecture, exports, and manifest.

Promotion additionally requires Windows with a real Mattermost server and separate bot/user credentials. The live harness creates a root post and a user reply that mentions the bot, observes one durable adopted Run, one completed assistant response, one threaded Mattermost reply and receipt, restarts Host, and proves all three remote/durable identities remain singular.

## Required Windows environment

```text
OPENRILL_MATTERMOST_BASE_URL
OPENRILL_MATTERMOST_BOT_TOKEN
OPENRILL_MATTERMOST_TEST_USER_TOKEN
OPENRILL_MATTERMOST_TEST_CHANNEL_ID
OPENRILL_MATTERMOST_ALLOW_PRIVATE_NETWORK=1   # only for an explicitly trusted private server
```

The bot and user tokens must represent different users. The user must be able to post in the channel; the bot must be able to read the WebSocket event stream and post replies.

## Deferred

Attachments/media, reactions, slash commands, streaming edits, multi-account policy, rate-limit coordination, operator dead-letter replay, and broader Connector security policy remain deferred.
