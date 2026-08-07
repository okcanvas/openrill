# STEP012B Windows Historical Acceptance Baseline Ownership Drift

## Actual symptom

The real Windows command:

```text
pnpm acceptance:step012b
```

passed STEP012A focused tests, STEP012B scheduler tests, the canonical suite, Vue acquisition, the complete STEP011 real-Chromium live slice, and package-manifest verification. Nested STEP011 nevertheless ended `218/228 FAILED` because exactly ten root-document checks failed:

```text
baseline-step:README.md
baseline-next:README.md
baseline-step:HANDOFF.md
baseline-next:HANDOFF.md
baseline-step:PLANS.md
baseline-next:PLANS.md
baseline-step:ROADMAP.md
baseline-next:ROADMAP.md
baseline-step:VALIDATION.md
baseline-next:VALIDATION.md
```

The browser evidence itself passed and no product-runtime diagnostic was present.

## Code-confirmed root cause

`scripts/run_step011_acceptance.py` is retained as a historical feature regression, but its root-document block still asserted that every mutable root status document must contain:

```text
STEP011_CONTROL_UI_VERTICAL_SLICE
STEP012_AUTOMATION_SCHEDULER
```

Those strings were valid when STEP011 owned the package baseline and STEP012 was only the next broad plan. In STEP012B, the current release correctly owns the root documents and names `STEP012B...` as the candidate and `STEP012C...` as the next cut. The historical runner therefore treated correct current documentation as a regression.

The current STEP012B runner already validates current candidate, accepted baseline/SHA, history, and next-cut coherence. The STEP011 checks were duplicate ownership with stale historical literals.

## Impact

A fully passing Windows Chromium and scheduler run was rejected after all product behavior succeeded. Every future release would require preserving obsolete root wording or manually editing the historical runner, making the documentation either false or the nested regression unstable.

## Fix

Historical STEP011 acceptance no longer owns mutable root baseline or next-cut wording. The same delegation is applied proactively to nested STEP012AR1 and STEP012B runners so STEP012C cannot reproduce the defect. Historical runners now verify only:

1. each root status document contains the current `RELEASE_STEP` identity;
2. each document contains the current package `VERSION` where applicable;
3. retained STEP011R8 Windows history remains `198/198`;
4. no document claims STEP011 as the current candidate or official baseline.

The current release acceptance remains the sole owner of accepted baseline, SHA, current feature, and next-cut coherence.

## Detailed evidence

A direct pre-fix evaluation of the exact source ZIP reproduced exactly the ten Windows failures and no others. The fixed historical runner preserves the same twenty-document-check cardinality, so the nested STEP011 marker remains `228/228` rather than weakening the aggregate.

Focused regression:

```text
historical-acceptance-baseline-scope-step012br1.test.mjs 4/4 PASSED
```

## Recurrence-prevention gate

- Historical STEP011 source must contain `baseline-current-release-step` and use `RELEASE_STEP in text`.
- Historical STEP011 source must not contain a `baseline-next:` check or the stale `"STEP012_AUTOMATION_SCHEDULER" in text` assertion.
- STEP011 retained history and current-claim-zero checks are mandatory.
- Nested STEP011, STEP012AR1, and STEP012B runners must contain no `baseline-next:` checks.
- The current STEP012BR1 acceptance must own `baseline-current-step`, `baseline-accepted-step`, and `baseline-next` checks.
- Current root documents must contain the current revision identity and retained STEP011R8 `198/198` evidence.
