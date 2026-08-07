# STEP015B Windows Real-Docker Acceptance

## Immutable accepted baseline

```text
step=STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT
version=0.15.1-step015b
state_schema=15
artifact=openrill-step015b-h1-docker-stale-prune-container-id-evidence-alignment-v1.zip
sha256=1990b189166a2547e0ae5aa81479591914b302e816bb088fd56e4a44f9ffd4db
```

## User-supplied Windows marker

```text
STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT checks=64/64 state=PASSED schema=15 previous_candidate=STEP015A_EXECUTION_BACKEND_CONTRACT_AND_DOCKER_CONFINEMENT_PLAN_FOUNDATION accepted_product_baseline=STEP014_PRODUCT_CORE_ACCEPTED source=ACCEPTED_PROFILE package=CANDIDATE process_tool=BACKEND_ROUTED backend=HOST_DOCKER fallback=EXPLICIT confinement=DURABLE state_upgrade=14_TO_15 browser=NOT_RUN docker_live=PASSED live_harness=STEP015B_H1_CONTAINER_ID_EVIDENCE promotion=READY automated_run_seconds=115.064
```

## Promotion decision

The real Windows run passed all 64 checks, including the Docker live confinement profile. STEP015B
therefore supersedes `STEP014_PRODUCT_CORE_ACCEPTED` as the official Product baseline.

Accepted behavior includes:

- actual Product Process Tool routing through explicit Host and Docker backends;
- fail-closed Docker selection unless Host fallback is separately explicit;
- durable backend kind, handle identity, sandbox claim, and confinement proof in State schema 15;
- digest-pinned hardened Docker execution;
- real read-only/read-write, network, timeout, cancellation, stale-prune, and cleanup evidence;
- no browser claim because browser behavior is outside STEP015B.

The first `63/64` stale-prune failure remains preserved as OR-ISSUE-203. It was a Harness-only
full-ID versus abbreviated-ID comparison defect and did not change Product version or State schema.
