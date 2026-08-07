# STEP018C Windows Agent Benchmark Live Acceptance

## Accepted identity

```text
STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK
version=0.18.2-step018c
state_schema=16
accepted_checks=WINDOWS_AGENT_BENCHMARK_36/36
artifact=openrill-step018c-agent-task-capability-benchmark-v1.zip
sha256=ebc745a8f109cc4dc6cc3d37ea9992adfeb0a7fb3d49920bc22892110a07809d
```

## Actual Windows marker supplied by the operator

```text
STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK checks=36/36 state=PASSED version=0.18.2-step018c schema=16 accepted_product_baseline=STEP018B_SKILL_OPERATIONS_AND_STRUCTURED_TOOL_DISCOVERY accepted_checks=WINDOWS_AGENT_CAPABILITY_32/32 benchmark=REPO_BACKED_AGENT_CORE scenarios=10 repetitions=2 provider=SCRIPTED_LOCAL scoring=ASSERTION_BUDGET_EVIDENCE reliability_target=100_PERCENT artifact=SHARE_SAFE openclaw_reference=PERSONAL_AGENT_PACK_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product=12 affected_regression=23 governance=74 canonical_files=114 canonical_tests=628 windows_agent_benchmark_live=PASSED promotion=READY automated_run_seconds=125.531
```

## Promotion decision

`STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK` is the official accepted Product baseline for STEP019A. The acceptance used actual Windows execution with the scripted local provider and did not use an external model, Browser live, Mattermost, or Connector.
