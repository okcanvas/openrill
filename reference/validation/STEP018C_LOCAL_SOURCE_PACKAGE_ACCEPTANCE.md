# STEP018C Local Source and Package Acceptance

## Identity

```text
step=STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK
version=0.18.2-step018c
state_schema=16
accepted_product_baseline=STEP018B_SKILL_OPERATIONS_AND_STRUCTURED_TOOL_DISCOVERY
accepted_checks=WINDOWS_AGENT_CAPABILITY_32/32
accepted_sha256=1cbe66542c9a41a71567e9c7b0978cbc5ba7afba906ebe158721d7c1b2bc2831
```

## Final source/package result

```text
checks=35/35
state=PASSED
focused_product=12/12
affected_regression=23/23
governance=74/74
canonical_files=114
canonical_batches=8
canonical_tests=628/628
canonical_skipped=0
source_version=33 manifests / 32 sources / 3 Host literals
workspace_lock=33 importers / 85 dependencies
workspace_links=82 edges / 29 scopes
architecture=32 packages / 82 edges / 138 sources
exports=32/32
manifest=1367/1367
automated_run_seconds=82.194
```

The focused Product run includes strict catalog/taxonomy validation, deterministic runner classification, share-safe reporting and execution of all ten actual local Agent scenarios. The benchmark passed 10/10 with one repetition during the source test; Windows promotion separately requires two repetitions and 20/20 attempts.

The preceding package-candidate aggregate before the evidence file was added also passed 35/35 with `automated_run_seconds=83.610` and manifest 1366/1366. The document-inclusive final aggregate above is the package source of truth.

## Environment and exclusions

```text
provider=SCRIPTED_LOCAL
external_model=NOT_RUN
browser_live=NOT_RUN
connector=DEFERRED_NO_REAL_SYSTEM
real_accounts=NOT_RUN
llm_judge=NOT_USED
```

## OpenClaw reference

The retained OpenClaw archive was source-audited for its Personal Agent Benchmark Pack. Archive SHA-256:

```text
1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
```

See `docs/research/OPENCLAW_PERSONAL_AGENT_BENCHMARK_PACK_CODE_AUDIT.md`.

## Promotion status

```text
source_package=ACCEPTED
windows_agent_benchmark_live=PENDING_ENV
promotion=WINDOWS_AGENT_BENCHMARK_LIVE_PENDING
```
