# OR-ISSUE-207 — STEP016AR1 aggregate invoked the retained STEP016A live fixture

## Classification

```text
owner_dimension=HARNESS
product_runtime_impact=NONE
first_observed=STEP016AR1_WINDOWS_DPAPI_LIVE_ATTEMPT_1
aggregate=68/69 FAILED
live_stage=PASS
product_version=0.16.1-step016ar1 UNCHANGED
state_schema=15 UNCHANGED
```

## Observed evidence

The real Windows run reported:

```text
OPENRILL_ACCEPTANCE_STAGE_END name=windows-dpapi-live state=PASS returncode=0 elapsed_seconds=7.265
STEP016A_LOCAL_SETUP_DOCTOR_AND_WINDOWS_DPAPI_SECRET_FOUNDATION checks=12/12 state=PASSED ... cleanup=QUIESCENT
```

The enclosing STEP016AR1 aggregate then reported `68/69 state=FAILED` and marked
`windows_dpapi_live=FAILED`.

## Direct cause

`scripts/run_step016ar1_acceptance.py` appended the historical
`scripts/run-step016a-windows-dpapi-live.mjs` when `--require-windows-dpapi-live` was present. The
actual DPAPI behavior passed, but the child emitted the immutable STEP016A marker. The aggregate
correctly required the current STEP016AR1 marker and therefore converted a successful live Product
run into a Harness false negative.

The current STEP016AR1 live fixture already existed and was correctly registered in `package.json`;
the aggregate simply did not invoke it.

## Correction

- keep Product version `0.16.1-step016ar1` and State schema 15 unchanged;
- invoke `scripts/run-step016ar1-windows-dpapi-live.mjs` from the current aggregate;
- statically reject the historical STEP016A live path in the current live-stage block;
- require fixture and aggregate STEP/version/schema marker identity to match;
- retain the first Windows attempt as evidence that DPAPI, setup, doctor, duplicate protection,
  reference-only persistence, and cleanup already passed.

## Stop-loss decision

No STEP016AR2 Product correction is created. This is
`STEP016AR1_H1_CURRENT_LIVE_ENTRYPOINT_MARKER_ALIGNMENT`, owned by the Harness dimension. Promotion
remains pending only until the corrected aggregate is rerun on Windows.
