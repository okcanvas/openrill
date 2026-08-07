# OR-ISSUE-306 — JavaScript RegExp string consumed the TAP numeric escape

```text
ISSUE=OR-ISSUE-306
FIRST_OBSERVED=STEP021BR1_WINDOWS_LIVE
CLASSIFICATION=ACCEPTANCE_HARNESS / JAVASCRIPT_STRING_ESCAPE
PRODUCT_IMPACT=NONE
PROMOTION_IMPACT=FALSE_NEGATIVE_BLOCK
```

## Failure

All 22 focused Product tests passed on actual Windows, but the Harness reported `focused-tests`, `focused-pass`, `focused-fail`, and `focused-skipped` as `-1` and ended at 20/24 FAILED.

## Direct cause

A dynamically constructed `RegExp` used `\d` inside a JavaScript template string with only one source backslash. The string parser removed that backslash before the regular-expression parser received it, yielding `(d+)`.

## Correction

- remove dynamic numeric regular-expression construction from the Harness;
- parse TAP summary as structured lines with explicit `[0-9]+` matching;
- normalize LF, CRLF, and lone CR line boundaries;
- retain explicit `-1` sentinels when a summary key is absent;
- reuse the parser in both the historical STEP021BR1 Harness and the current STEP021BR2 Harness;
- execute dedicated LF and Windows CRLF regression tests;
- make the STEP021BR2 Windows Harness self-check both line-ending forms before accepting Product evidence.

## Recurrence gate

`tests/unit/node-tap-summary-step021br2.test.mjs` and `tests/unit/validation-governance-step021br2.test.mjs` must prove the shared parser, both line-ending forms, historical Harness reuse, and the absence of the defective dynamic numeric pattern.
