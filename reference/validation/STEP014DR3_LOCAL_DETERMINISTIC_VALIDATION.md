# STEP014DR3 Local Deterministic Validation

## Identity
- STEP014DR3_OPENAI_RESPONSES_STREAM_TOOL_IDENTITY_UNIFICATION_AND_EMPTY_NAME_FAIL_CLOSED
- version `0.14.6-step014dr3`
- schema 14
- baseline STEP013CR2 `163/163`

## Source aggregate
```text
checks=194/195
state=FAILED
only_failed_stage=external-model-control-ui-live
local_cause=OPENAI_API_KEY prerequisite missing
focused=95/95
canonical=425/425
unit_files=74
skipped=0
architecture=27 packages / 67 edges / 116 sources
exports=27/27
manifest=1080/1080
```

No external-model or Chromium success is claimed locally. All deterministic provider stream identity, alias, delegation, UI, diagnostics, build, architecture and manifest gates passed.

## Preliminary fresh-ZIP validation
The byte-identical preliminary ZIP was extracted into a new root. Root-owned workspace links were materialized only for validation. With source `dist` and `.artifacts` absent, the exact archive passed manifest `1080/1080`, source/version `28/27/3`, lock `28/70`, links `67/27`, source-root boundary, zero-dist build, focused `95/95`, canonical `425/425`, architecture `27/67/116`, and exports `27/27`.
