# STEP014B local deterministic validation

## Identity

```text
STEP014B_SINGLE_CHILD_DELEGATED_EXECUTION_AND_DURABLE_PARENT_RESUME
version=0.14.1-step014b
schema=13
baseline=STEP013CR2
```

## Source aggregate

```text
STEP014B_SINGLE_CHILD_DELEGATED_EXECUTION_AND_DURABLE_PARENT_RESUME checks=101/101 state=PASSED schema=13 baseline=STEP013CR2 delegation=SINGLE_CHILD tools=AGENT_SPAWN_WAIT wait=DURABLE result=EXACTLY_ONCE resume=PARENT_ATTEMPT_2 scope=MONOTONIC protocol=UNCHANGED reporter=TAP
```

The aggregate starts by deleting every workspace `dist` directory and `.artifacts`, so the build does not depend on retained output.

```text
source/version=PASS manifests=28 sources=27 host_literals=3
workspace_lock=PASS importers=28 dependencies=70
workspace_links=PASS edges=67 materialized=27
zero_dist_build=PASS
focused_foundation=15/15
focused_foundation_boundaries=10/10
focused_delegated_execution=9/9
focused_delegated_boundaries=10/10
focused_total=44/44
canonical=374/374 unit_files=60 skipped=0
architecture=PASS packages=27 edges=67 sources=115
exports=27/27
package_manifest=989/989 changed=0
```

## Covered vertical slice

```text
parent agent.spawn
→ one depth-1 child scheduled without blocking
→ parent agent.wait
→ parent attempt ABORTED/DELEGATION_WAIT
→ parent Run CREATED/RESUMABLE and WAITING_DELEGATION
→ child terminal
→ one bounded agent.wait Tool result and checkpoint
→ delivery marked DELIVERED
→ same parent Run resumes as attempt 2
→ parent terminal
```

The parent result excludes raw child transcript, reasoning and raw task. Child Tool schemas and dispatch are both constrained by the durable scope. Delegated Runs do not auto-activate Skills.

## Issue closure

OR-ISSUE-129 through OR-ISSUE-136 are separately documented, registered and covered by automated recurrence gates. OR-ISSUE-136 specifically verifies a clean TypeScript project graph so the new workspace cannot pass only because stale `dist` output exists.

## Deterministic package and fresh extraction

Two independent packages from the validated source state were byte-identical. The sealed package contained 990 files: 989 source-manifest entries plus `PACKAGE_MANIFEST.json`.

The package was extracted under a new root, all 27 `@openrill/*` workspace links were materialized against that root, and no prior `dist` or `.artifacts` output was copied. The complete aggregate passed again:

```text
fresh_manifest=989/989 changed=0
fresh_source_version=28/27/3 PASS
fresh_lock=28/70 PASS
fresh_workspace_links=67/27 PASS
fresh_zero_dist_build=PASS
fresh_focused=44/44 PASS
fresh_canonical=374/374 PASS
fresh_architecture=27/67/115 PASS
fresh_exports=27/27 PASS
fresh_aggregate=101/101 PASS
```

The immutable ZIP SHA-256 is emitted by `scripts/package_step014b.py` into the adjacent `.sha256.txt` sidecar. Because a ZIP cannot contain its own digest without changing that digest, the sidecar is the digest owner.
