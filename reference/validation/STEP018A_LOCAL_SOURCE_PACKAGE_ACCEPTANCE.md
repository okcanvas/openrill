# STEP018A Local Source/Package Acceptance

```text
STEP018A_DURABLE_AGENT_MEMORY_AND_CONTEXT_RECALL_FOUNDATION
checks=32/32
state=PASSED
version=0.18.0-step018a
schema=16
accepted_product_baseline=STEP016C_LOCAL_MULTI_TURN_CONTINUATION_AND_RUNNING_HOST_ATTACHMENT
accepted_checks=WINDOWS_MULTI_TURN_97/97
memory=SQLITE_FTS5_DURABLE
tools=REMEMBER_SEARCH_GET_FORGET
provenance=CONVERSATION_RUN
workspace=ISOLATED
sensitive=REJECTED
openclaw_reference=SOURCE_AUDITED
external_model=NOT_RUN
browser=NOT_RUN
connector=DEFERRED_NO_REAL_SYSTEM
windows_memory_live=PENDING_ENV
promotion=WINDOWS_MEMORY_LIVE_PENDING
automated_run_seconds=80.252
```

Detailed evidence:

```text
source/version=31 manifests / 30 sources / 3 Host literals
workspace_lock=31 importers / 81 dependencies
workspace_links=78 edges / 30 materialized
focused_product=6/6
focused_governance=52/52
canonical=105 files / 7 batches / 583/583 / skipped 0
architecture=30 packages / 78 edges / 131 sources
exports=30/30
manifest=1307/1307 before this evidence document
```

The OpenClaw implementation reference is fixed by archive SHA-256 in `reference/openclaw/OPENCLAW_SOURCE_BASELINE.md`. No commit SHA is claimed because the uploaded archive does not include `.git` metadata.
