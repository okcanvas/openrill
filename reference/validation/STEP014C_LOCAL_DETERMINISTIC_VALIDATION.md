# STEP014C local deterministic validation

```text
STEP014C_BOUNDED_NESTED_DELEGATION_PARALLELISM_AND_RESTART_RECOVERY
version=0.14.2-step014c
schema=14
baseline=STEP013CR2
```

## Source aggregate

```text
checks=146/146 PASS
focused=60/60 PASS
canonical=390/390 PASS
unit_files=65
skipped=0
architecture=27 packages / 67 edges / 115 sources PASS
exports=27/27 PASS
source_version=28 manifests / 27 sources / 3 Host literals PASS
workspace_lock=28 importers / 70 dependencies PASS
workspace_links=67 edges / 27 materialized PASS
```

The aggregate deletes all workspace `dist` directories and `.artifacts` before build. It uses explicit sorted canonical test-file arguments and TAP reporting.

## Candidate scope

Validated deterministically:

- schema 14 reservation/release migration;
- bounded depth-2 nested spawn;
- parallel active reservations and total-child limits;
- actual own-plus-descendant usage charging;
- composite parent budget enforcement;
- deepest-first cancellation and timeout terminal delivery;
- Host startup terminal reconciliation and runnable child rescheduling;
- no delegation Protocol or Control UI surface.

No Windows external-model delegated-work acceptance is claimed. STEP013CR2 remains the official Windows-live-accepted baseline.

## Package and fresh extraction

Two independent packages from the same source were byte-identical. The package was extracted to a new root, root-owned workspace links were materialized, and the same zero-dist aggregate passed again:

```text
fresh_checks=146/146 PASS
fresh_focused=60/60 PASS
fresh_canonical=390/390 PASS
fresh_architecture=27/67/115 PASS
fresh_exports=27/27 PASS
fresh_manifest=1010/1010 PASS
packaged_source_files=1011
```

The immutable ZIP digest is owned by the adjacent SHA-256 sidecar because an archive cannot contain its own digest.
