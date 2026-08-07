# OR-ISSUE-188 — Lifecycle audit inventory omitted the current DR8 live fixtures

## Symptom risk

`scripts/check_live_acceptance_lifecycle.py` remained pinned to DR6 fixture paths. STEP014DR8 could therefore introduce direct HTTP, Host-close-order or Chromium-cleanup regressions while the aggregate `live-acceptance-lifecycle-audit` stage still returned PASS.

## Direct cause

The audit used a manually maintained historical fixture tuple and the DR8 release added new current live clients without extending that inventory. The stage name was current, but its inspected source set was not.

## Correction

The lifecycle audit now includes both DR8 live clients in the HTTP and Host inventories, includes the DR8 deterministic UI client in the Chromium inventory, checks body consumption for both retained DR6 and current DR8 deterministic fixtures, and explicitly verifies current partial-launch cleanup markers.

## Recurrence prevention

- every new live fixture family must be added to the lifecycle audit in the same release;
- current acceptance statically requires current live paths in the audit source;
- the lifecycle audit must inspect current HTTP, Host and Chromium ownership, not only retained historical exemplars;
- a passing audit reports the exact inspected fixture counts.
