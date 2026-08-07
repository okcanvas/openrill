# OR-ISSUE-085 — STEP013AR1 local workspace module-link cross-root contamination

## Exact symptom

The first local STEP013AR1 canonical run produced multiple unrelated failures, including:

```text
ToolApprovalRequiredError received an error with identical name but a different prototype
workspace path-policy operations wrapped as TOOL_EXECUTION_FAILED
```

## Root cause

The validation directory reused a root `node_modules` symlink from the prior STEP013A worktree. Its `node_modules/@openrill/*` absolute links resolved to the previous source root, while tests also imported the current worktree's local `dist` files. Node loaded two physical copies of classes and stateful packages.

This is a validation-workspace isolation defect, not a packaged product defect. ZIPs exclude `node_modules`.

## Impact

Canonical failures could be misclassified as product regressions, and class identity checks based on `instanceof` became invalid.

## Fix

Materialize workspace package links for the current root only. Add a verifier that resolves every `node_modules/@openrill/*` entry and rejects any target outside the current source root before focused or canonical tests.

## Recurrence gate

- `python scripts/verify_workspace_module_links.py`
- focused workspace alignment test
- acceptance gate before build/tests
- fresh extraction uses explicit current-root dependency materialization, never inherited absolute workspace links
