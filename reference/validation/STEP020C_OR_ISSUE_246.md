# OR-ISSUE-246 — Fresh dependency materialization escaped the Fresh source root

## First observation

During STEP020C immutable ZIP Fresh verification, the already-resolved root `node_modules` directory was mounted into the Fresh extraction as one directory-level symbolic link.

## Exact failure

```text
OPENRILL_WORKSPACE_MODULE_LINKS_FAIL
... @openrill/*:outside_root
```

The `@openrill/*` entries inside that link farm are relative links. Because the entire `node_modules` directory resolved back to the original work tree, those relative links also resolved to the original work tree instead of the Fresh extraction.

## Classification

Fresh-package verification procedure / dependency-materialization boundary. This was not a Product runtime or source-build defect.

## Correction

- Never mount or symlink the entire resolved `node_modules` directory into a Fresh source root.
- `scripts/materialize_resolved_dependencies_for_fresh_verify.py` copies the small root link-farm layout while preserving each link text.
- Relative `@openrill/*` links therefore resolve against the Fresh root.
- The helper rejects a source `node_modules` that is itself a symlink and fails if any copied `@openrill/*` link resolves outside the Fresh root.
- Fresh verification then runs module-link validation, a clean workspace build and STEP020C focused Product tests.

## Verified corrected result

```text
workspace_module_links=93 edges / 36 materialized packages
workspace_build=PASSED
focused_product=18/18
```

This procedure reuses already-resolved dependency materialization because the isolated environment cannot perform a registry-backed Corepack bootstrap. It does not claim a Fresh `pnpm install`; OR-ISSUE-233 remains the authoritative offline-install limitation.
