# OR-ISSUE-320 — Legacy materialized Config without extensions crashed Host startup

```text
ISSUE=OR-ISSUE-320
FIRST_OBSERVED=STEP022A CANONICAL automation-scheduler-step012b
CLASSIFICATION=PRODUCT COMPATIBILITY / ADDITIVE CONFIG
```

## Failure

The retained Automation Host fixture failed with `TypeError: Cannot read properties of undefined (reading 'roots')`.

## Direct cause

STEP022A added `extensions` to materialized Config, but Host composition used `options.config?.extensions.roots`: only `config` was optional, while a legacy runtime object could still omit the additive `extensions` block.

## Correction

Host composition uses `options.config?.extensions?.roots/enabled/settings` with empty defaults. A focused Host regression starts from a materialized Config with the Extension block deliberately removed and requires an empty registry.

## Recurrence gate

`extension-host-step022a.test.mjs`, the retained Automation Host fixture, and canonical must all pass.
