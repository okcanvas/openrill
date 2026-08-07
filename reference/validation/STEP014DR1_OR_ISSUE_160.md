# OR-ISSUE-160 — Historical STEP014C test retained a STEP014D current-manifest assumption

## Symptom and code-confirmed cause

After STEP014DR1 moved the mutable package generators to the corrective identity, one retained STEP014C test still required those generators to contain `STEP014D_DELEGATED_WORK_CONTROL_UI_AND_WINDOWS_VERTICAL_SLICE`. The same test correctly claimed STEP014C should not own current identity, but then delegated that ownership permanently to STEP014D.

## Correction

The retained STEP014C test now proves only that its immutable plan contains `0.14.2-step014c`, that current identity has advanced, and that mutable generators align with the root package version. The current STEP string is owned only by the current corrective boundary test.

## Recurrence gate

Future corrective releases may advance mutable STEP identity without editing STEP014C historical facts. Current generator/version coherence remains mandatory.
