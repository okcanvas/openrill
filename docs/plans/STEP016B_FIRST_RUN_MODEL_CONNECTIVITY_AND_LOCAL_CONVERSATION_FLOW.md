# STEP016B — First-Run Model Connectivity and Local Conversation Flow

```text
step=STEP016B_FIRST_RUN_MODEL_CONNECTIVITY_AND_LOCAL_CONVERSATION_FLOW
version=0.16.2-step016b
state_schema=15
accepted_baseline=STEP016AR1_WINDOWS_DPAPI_ENCODED_COMMAND_ARGUMENT_TRANSPORT_ALIGNMENT
accepted_checks=WINDOWS_DPAPI_75/75
accepted_zip_sha256=8a4c0574fc90faffd332de861aab32f636e01694e8619a6c009700904aad3325
```

## Product objective
Turn the accepted local setup and DPAPI secret foundation into one practical command:

```text
prompt on stdin
→ actual ephemeral Host
→ configured DPAPI secret resolution
→ actual Responses adapter
→ durable Conversation and Run
→ assistant text
→ clean Host shutdown
```

## Scope
- `openrill ask` with stdin-only prompt input;
- actual `ConfiguredModelResolver` and OS secret provider injection;
- actual Host-owned durable one-shot Conversation execution;
- typed model authentication/transport failure preservation;
- deterministic Windows live through a loopback Responses SSE fixture;
- SQLite persistence and Host lock/metadata cleanup evidence.

## Explicit exclusions
- no external or paid model acceptance;
- no browser;
- no Connector or Mattermost implementation;
- no interactive multi-turn terminal UI;
- no attachment to an already-running Host;
- no State schema change.

## Validation profiles
Development: zero-dist build and focused Product/affected regression.
Package candidate: canonical, architecture, exports, manifest and deterministic ZIP.
Windows promotion: `pnpm acceptance:step016b:live`, using real DPAPI and loopback Responses only.

```text
human_work_minutes=NOT_RECORDED
external_model=NOT_RUN
browser=NOT_RUN
connector=DEFERRED_NO_REAL_SYSTEM
windows_first_run_live=PENDING_ENV
```

## Measured source/package result

```text
checks=67/67 state=PASSED
canonical=97 files / 546/546 / skipped 0
automated_run_seconds=70.357
windows_first_run_live=PENDING_ENV
```
