# STEP013CR2 Focused Stage Timeout Inventory Omission

## Symptom

The first local STEP013CR2 aggregate completed the new null-prototype focused test, then raised:

```text
KeyError: 'focused-sqlite-row-assertion'
```

## Root cause

The stage was added to the execution list but not to `STAGE_TIMEOUTS`. `run_utf8()` indexes the timeout map before invoking every external stage.

## Correction

The stage now owns a bounded 120-second timeout. `OR-ISSUE-119` requires the stage declaration and timeout declaration to remain together.
