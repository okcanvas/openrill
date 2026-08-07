# OR-ISSUE-226 — Reused workspace links loaded a prior candidate

```text
owner_dimension=HARNESS_PACKAGE
product_runtime_change=NONE
product_version_change=NONE
state_schema_change=NONE
```

## Observation

The first STEP019A Host focused run failed during goal preparation because the loaded State repository did not expose `goals.getOpen`.

## Direct cause

The copied `node_modules/@openrill/*` entries were absolute symbolic links to the prior STEP018C extraction. Node therefore loaded stale compiled State code even though the STEP019A source and build were correct.

## Correction

Every workspace package link was rematerialized to the current STEP019A root. `verify_workspace_module_links.py` proves that every declared `@openrill/*` edge resolves within the current root and to the exact current package directory.

## Classification

Harness/package materialization defect. No Product change was required.
