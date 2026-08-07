# STEP015B Windows Docker live attempt 1

```text
date=2026-08-05
source_package_stages=PASS
canonical=PASS
docker_live_stage=FAILED
aggregate=63/64
automated_run_seconds=120.499
product_failure=NOT_ESTABLISHED
harness_issue=OR-ISSUE-203
```

All source/package stages passed, including zero-dist build, focused Product, affected regression,
governance, canonical, architecture, exports, and final manifest. The Docker live stage failed at its
first stale-prune evidence assertion.

The fixture compared the full ID returned by `docker create` with IDs returned by `docker ps -q`. Because
the latter may be abbreviated, exact string membership was not a valid proof of failed removal. The
backend had already completed each `docker rm -f` call before returning.

The correction is Harness-only: prefix-safe container-ID comparison plus an independent no-remaining-
container query using `--no-trunc`. Product version `0.15.1-step015b` and State schema 15 remain unchanged.
Docker live promotion is still pending a corrected rerun.
