# STEP015A — Execution Backend Contract and Docker Confinement Plan Foundation

## Identity

```text
STEP015A_EXECUTION_BACKEND_CONTRACT_AND_DOCKER_CONFINEMENT_PLAN_FOUNDATION
version=0.15.0-step015a
schema=14
previous_product_baseline=STEP014_PRODUCT_CORE_ACCEPTED
```

## Product scope

1. provider-neutral execution backend and handle contracts;
2. canonical workspace authority and confinement proof;
3. deny-by-default extra-bind, Docker-socket, network, and fallback policy;
4. actual Host argv backend that never claims container sandboxing;
5. Docker CLI backend with digest-pinned image, hardened create plan, exec, cancel, close, doctor,
   and exact-label stale prune;
6. injected Docker CLI tests without requiring a daemon.

## Deliberate split

STEP015A does not claim Docker live acceptance. Docker is unavailable in the local validation
environment. STEP015B will integrate the backend with `process.run` and execute real Docker daemon
fixtures for read-only/write, network, timeout, cancel, cleanup, and prune.

## Acceptance profile

- no browser or Chromium;
- build/typecheck;
- 12 focused sandbox tests;
- governance focused tests;
- canonical unit suite once for package candidate;
- architecture, exports, manifest, deterministic ZIP, and fresh extraction.

## Time ledger

```text
started_at=2026-08-04T21:01:00+09:00
ended_at=2026-08-04T21:29:40+09:00
human_work_minutes=NOT_RECORDED
automated_run_seconds=37.930
```

Only exact measured values may replace `NOT_RECORDED`.

## Result

```text
acceptance=72/72 PASS
focused=19/19 PASS
canonical=486/486 PASS across 87 files
architecture=28/68/121 PASS
exports=28/28 PASS
manifest=1197/1197 PASS
browser=NOT_RUN
docker_live=DEFERRED_TO_STEP015B
```

The canonical package-candidate run found and closed OR-ISSUE-194 and OR-ISSUE-195. Neither was a
Sandbox Product regression; both were historical tests owning mutable current-state identity.
