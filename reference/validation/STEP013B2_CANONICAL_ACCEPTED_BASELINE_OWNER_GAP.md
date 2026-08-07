# OR-ISSUE-103 — canonical accepted-baseline owner gap

## Exact symptom

After STEP013B1A was Windows-live accepted and root documents correctly promoted it, the canonical suite failed:

```text
not ok ... current root documents own the current release and latest accepted baseline...
error: README.md
```

The test still required STEP013AR4, `190/190`, and its ZIP SHA.

## Code-confirmed root cause

OR-ISSUE-093 changed an older literal to STEP013AR4 but did not remove the ownership defect. `historical-acceptance-baseline-scope-step012br1.test.mjs` still duplicated the mutable latest accepted baseline in test source. Every future acceptance therefore required another historical-test edit.

## Impact

A correct accepted-baseline promotion was classified as a regression. The previous recurrence gate did not actually prevent the same failure class.

## Fix

`config/current-accepted-baseline.json` is now the single machine-readable owner of current accepted step, version, check total, immutable ZIP SHA, and evidence path. The historical scope test loads that record dynamically and verifies all mutable root documents against it. Historical dedicated evidence remains unchanged.

## Recurrence-prevention gates

- the canonical record has schema version 1 and a 64-hex ZIP SHA;
- its evidence path exists and names the accepted step;
- all root mutable documents contain current release identity plus every accepted-baseline field;
- the historical test contains no accepted STEP/check/SHA literals;
- STEP013B2 acceptance validates the same canonical record.
