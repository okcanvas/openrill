# OR-ISSUE-312 — Capability-conflict state could not recover after runtime disable

```text
ISSUE=OR-ISSUE-312
FIRST_OBSERVED=STEP022A FOCUSED EXTENSION TEST
CLASSIFICATION=STEP022A EXTENSION / VALIDATION
PRODUCT_BASELINE=STEP021BR2_WINDOWS_LIVE_ACCEPTED
```

## Failure

Capability-conflict state could not recover after runtime disable.

## Direct cause

Both enabled owners of one capability were blocked, but disabling one did not deterministically unblock and activate the remaining owner.

## Correction

Capability conflicts are recomputed after every enable/disable; released ownership activates newly unblocked configured extensions in sorted order.

## Recurrence gate

extension-runtime-step022a duplicate-capability recovery fixture.
