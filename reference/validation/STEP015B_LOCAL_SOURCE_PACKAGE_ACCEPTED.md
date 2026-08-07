# STEP015B Local Source/Package Accepted Evidence

```text
step=STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT
version=0.15.1-step015b
schema=15
checks=63/63
state=PASSED
source=ACCEPTED_PROFILE
package=CANDIDATE
docker_live=PENDING_ENV
promotion=DOCKER_LIVE_PENDING
browser=NOT_RUN
automated_run_seconds=46.453
```

The retained aggregate report is `.artifacts/acceptance/STEP015B_ACCEPTANCE_REPORT.txt` during a
working-tree run. Packaged continuation relies on this evidence file, `VALIDATION.md`, `HANDOFF.md`,
and the deterministic source ZIP because `.artifacts` is intentionally excluded.

No real Docker daemon result is claimed. The official Product baseline remains
`STEP014_PRODUCT_CORE_ACCEPTED` until separate Docker live promotion succeeds.
