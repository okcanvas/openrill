# OR-ISSUE-177 — Live loopback transport and lifecycle rules were fragmented

## Symptom

STEP011, STEP012D and STEP014 fixtures independently implemented bootstrap, static asset and Chromium DevTools requests. Timeout, byte bounds, body drain and diagnostics were inconsistent.

## Root cause

There was no single acceptance-owned loopback HTTP boundary. Global `fetch()` behavior and response consumption were left to each fixture.

## Correction

`scripts/live-loopback-http.mjs` is the shared acceptance transport owner. `scripts/check_live_acceptance_lifecycle.py` audits the complete fixture inventory and cleanup ordering.

## Recurrence gate

All audited fixtures must import the common helper, contain no executable direct `fetch()`, emit bounded request evidence, and retain browser/Host cleanup ownership.
