# STEP016AR1 Windows DPAPI live attempt 1

```text
observed_at=2026-08-05T07:37+09:00
owner_dimension=HARNESS
aggregate=68/69 FAILED
automated_run_seconds=96.391
windows-dpapi-live state=PASS returncode=0 elapsed_seconds=7.265
child_marker=STEP016A_LOCAL_SETUP_DOCTOR_AND_WINDOWS_DPAPI_SECRET_FOUNDATION checks=12/12 state=PASSED
product_dpapi_result=PASSED
promotion=BLOCKED_BY_HARNESS_ENTRYPOINT_DRIFT
```

Every source/package stage passed. The real Windows DPAPI child also passed setup, doctor, DPAPI
CurrentUser round trip, duplicate protection, reference-only persistence, plaintext absence, and
cleanup. The enclosing STEP016AR1 aggregate failed only because it invoked the retained STEP016A
fixture and then required the current STEP016AR1 marker.

See `reference/validation/STEP016AR1_OR_ISSUE_207.md`.
