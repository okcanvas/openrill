# OR-ISSUE-185 — Deterministic UI bootstrap failure collapsed to `delegation-nav:false`

## Symptom

DR7 reported only:

```text
OPENRILL_STEP014DR7_WAIT_TIMEOUT:delegation-nav:false
```

The output did not identify the current page URL, Vue runtime state, startup phase, failed network request, browser console exception or `Page.navigate` error.

## Root cause

The DR7 deterministic nested UI fixture used a private response-only CDP client and a boolean polling helper. It did not attach the already existing bounded browser page evidence collector, did not check `Page.navigate.errorText`, and did not preflight the served Vue runtime and lock.

## Correction

STEP014DR8 attaches runtime, console, log and network evidence before navigation, checks navigation errors immediately, preflights exact Host-served Vue assets, and waits for `startupPhase=READY` plus the delegation navigation element. Timeout evidence now includes bounded page state and browser diagnostics.

## Recurrence gate

- every actual Control UI Chromium fixture must either use or semantically match `browser-page-evidence.mjs`;
- navigation `errorText` must fail immediately with a typed marker;
- required static bootstrap dependencies are verified before Chromium;
- a generic selector timeout cannot be the sole evidence for bootstrap failure.
