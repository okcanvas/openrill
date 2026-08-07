# OR-ISSUE-146 — Historical no-Protocol/no-UI gates froze the current surface

## Symptom and code-confirmed cause

Retained STEP014B and STEP014C boundary tests asserted that the current repository must never contain `delegation.list/get/cancel` or a delegation UI. Those assertions encoded temporary exclusions as permanent present-day ownership and failed after the intended STEP014D cutover.

## Correction

Historical tests now verify the old plan documents and retained feature boundaries. STEP014D alone owns the exact current Protocol and UI surface.

## Recurrence gate

Retained A/B/C boundary tests and `delegation-control-boundaries-step014d.test.mjs` verify additive ownership without freezing future current identity.
