# STEP016A Windows DPAPI Live Profile

## Purpose

This is the only promotion profile that may claim real Windows OS secret integration for STEP016A.
It does not call an external model and does not use a browser.

## Command

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step016a:live
```

The fixture creates isolated temporary data, config, and workspace roots; generates a non-production
secret; sends that secret only through stdin; stores it using DPAPI CurrentUser; resolves it back;
proves the config contains only a `kind=os` reference; verifies duplicate setup does not overwrite
the prior value; searches all isolated files and command evidence for plaintext; and removes the
isolated root.

## Required marker

```text
STEP016A_LOCAL_SETUP_DOCTOR_AND_WINDOWS_DPAPI_SECRET_FOUNDATION checks=<N>/<N> state=PASSED version=0.16.0-step016a schema=15 ... windows_dpapi_live=PASSED promotion=READY ... browser=NOT_RUN
```

Until this marker is supplied, STEP015B remains the official accepted Product baseline and STEP016A
remains a source/package accepted candidate.
