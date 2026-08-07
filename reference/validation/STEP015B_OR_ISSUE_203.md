# OR-ISSUE-203 — Docker stale-prune live evidence compared full and abbreviated container IDs

## Classification

```text
owner_dimension=HARNESS
product_runtime_impact=NONE_PROVEN
first_observed=STEP015B_WINDOWS_DOCKER_LIVE_ATTEMPT_1
aggregate=63/64
automated_run_seconds=120.499
```

## Observed failure

The real Windows Docker run reached the dedicated live stage after every source/package stage passed.
The fixture then failed with:

```text
AssertionError: exact-profile stale container was not pruned
```

## Direct cause

`docker create` supplied a full container ID. `DockerExecutionBackend.pruneStale()` lists containers
through `docker ps -aq`, whose default display may use an abbreviated container ID. The backend removes
each listed container before returning the listed IDs. The fixture compared the full create ID and the
possibly abbreviated prune result with exact string equality. A successful removal could therefore be
reported as a failed prune.

The evidence available from this attempt does not establish a Product stale-prune failure. It establishes
a Harness identity-normalization defect.

## Correction

- keep the STEP015B Product version and State schema unchanged;
- normalize and compare safe Docker IDs by exact value or valid prefix relation;
- independently query `docker ps -aq --no-trunc --filter id=<created-id>` after prune and require no result;
- emit created, pruned, remaining, and stderr evidence if the assertion fails;
- retain exact managed/profile label filtering in the Product backend.

## Stop-loss decision

No STEP015BR1 Product patch is created. This is `STEP015B_H1_CONTAINER_ID_EVIDENCE`, a Harness-only
correction under the independent acceptance-dimension rule. The Docker live promotion remains pending
until the corrected fixture is rerun on the real daemon.
