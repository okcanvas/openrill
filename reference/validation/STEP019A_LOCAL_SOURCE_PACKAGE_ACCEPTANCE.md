# STEP019A Local Source and Package Acceptance

## Candidate identity

```text
STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE
version=0.19.0-step019a
state_schema=17
parent=STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK
parent_checks=WINDOWS_AGENT_BENCHMARK_36/36
parent_sha256=ebc745a8f109cc4dc6cc3d37ea9992adfeb0a7fb3d49920bc22892110a07809d
```

## Document-inclusive source/package marker

```text
STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE checks=37/37 state=PASSED version=0.19.0-step019a schema=17 accepted_product_baseline=STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK accepted_checks=WINDOWS_AGENT_BENCHMARK_36/36 goal=DURABLE_CONVERSATION plan=REVISIONED_ORDERED task_state=CHECKPOINTED_PROGRESS continuation=HOST_RESTART_INJECTED blocker=THREE_CONSECUTIVE completion=ALL_STEPS_REQUIRED provenance=WORKSPACE_CONVERSATION_RUN_ATTEMPT openclaw_reference=GOAL_TASK_FLOW_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product=4 affected_regression=10 governance=92 canonical_files=118 canonical_tests=650 windows_goal_live=PENDING_ENV live_harness=STEP019A_H1_STATE_SCHEMA_SOURCE_OF_TRUTH_ALIGNMENT promotion=WINDOWS_GOAL_LIVE_PENDING automated_run_seconds=87.598
```

## Detailed evidence

```text
focused Product=4/4 PASS
affected regression=10/10 PASS
governance=92/92 PASS
canonical=117 files / 8 batches / 646/646 PASS / skipped 0
source/version=35 manifests / 34 sources / 3 Host literals
workspace lock=35 importers / 90 dependencies
workspace links=87 edges / 31 scopes
architecture=34 packages / 87 edges / 144 sources
exports=34/34 PASS
manifest=1390/1390 PASS before this evidence file was added
```

The acceptance used a scripted local model and actual OpenRill State, Conversation, Goal, Tool and Host boundaries. External model, Browser live, Mattermost and Connector were not run. Windows live promotion remains pending.

## Failure assets

- `OR-ISSUE-226`: prior-extraction absolute workspace links.
- `OR-ISSUE-227`: history-aware Tool-result selection by role rather than exact identity.
- `OR-ISSUE-228`: historical STEP018A Memory test froze mutable current schema 16.


H1 source/package rerun preserves Product version/schema and validates OR-ISSUE-229 through the built State runtime export.
