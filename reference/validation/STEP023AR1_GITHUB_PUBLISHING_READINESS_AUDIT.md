# STEP023AR1 GitHub Publishing Readiness Audit

```text
CORRECTIVE=STEP023AR1_GITHUB_PUBLISHING_SOURCE_HYGIENE_AND_EOL_CONTRACT_CLOSURE
PRODUCT_STEP=STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE
PRODUCT_VERSION=0.25.0-step023a
STATE_SCHEMA=26
PRODUCT_RUNTIME_MODIFICATIONS=0
SOURCE_VISIBILITY_DECISION=PRIVATE_READY_PUBLIC_LICENSE_DECISION_REQUIRED
```

## Code-grounded pre-correction findings

The uploaded STEP023A ZIP was extracted and inspected directly.

- 1,883 files including `PACKAGE_MANIFEST.json`; 1,882 manifest-owned files.
- Extracted tree size: approximately 14 MiB.
- Largest file: `PACKAGE_MANIFEST.json`, 337,755 bytes.
- No `node_modules`, `dist`, `.artifacts`, runtime database, private-key file, or actual `.env` file was packaged.
- Root CMD byte evidence remained valid before the Git corrective:
  - `start-and-run-step022c-live.cmd`: 260 bytes, 12 CRLF lines, zero bare LF;
  - `start-mattermost-testbed.cmd`: 307 bytes, 12 CRLF lines, zero bare LF;
  - `reset-mattermost-testbed.cmd`: 209 bytes, 10 CRLF lines, zero bare LF;
  - `stop-mattermost-testbed.cmd`: 208 bytes, 10 CRLF lines, zero bare LF.
- Root `.gitattributes` was absent.
- Root `.gitignore` covered `.env` but not `.env.*` or key/certificate filename families.
- No root `LICENSE` file exists for OpenRill. `NOTICE.md` only records the referenced OpenClaw source license.

## Credential scan interpretation

A broad literal scan produces many `sk-*` matches because this repository intentionally uses synthetic IDs such as `sk-flow-registry-step020b` in deterministic test fixtures. Context inspection also found synthetic values such as `private-token`, `actual-secret-value`, and local-only Mattermost example passwords. No real OpenAI key, GitHub token, AWS access key or PEM private-key block was found.

The scan result is therefore not treated as zero-match evidence. Publication safety is based on contextual classification plus protected-filename rules, not on a naive `sk-` prefix count.

## Corrective changes

- added `.gitattributes` that keeps tracked source bytes unnormalized by default and owns CRLF checkout only for the four root CMD entrypoints;
- widened `.gitignore` local-secret coverage while preserving example environment files;
- added `GITHUB_PUBLISHING.md` with first-push, visibility, license, line-ending and release-artifact rules;
- recorded OR-ISSUE-405 through OR-ISSUE-410 and wired them into the existing governance/recurrence chain;
- added GitHub publication continuity to `README.md`, `HANDOFF.md`, and `docs/INDEX.md`;
- regenerated `PROJECT_TREE.txt` and `PACKAGE_MANIFEST.json` after source-document changes.

## Validation contract

The corrective is acceptable only when:

1. current STEP023A governance tests include the new Git publishing assets and OR-ISSUE-405..410;
2. `git check-attr eol -- start-and-run-step022c-live.cmd` resolves to `crlf`;
3. a staged Git worktree reports root CMD files as `w/crlf`;
4. `.env.local` and `testbeds/mattermost/.env` are ignored, while `testbeds/mattermost/.env.example` is not ignored;
5. root CMD bytes still contain only CRLF after the source package is regenerated and Fresh-extracted;
6. current package-manifest verification passes after regeneration;
7. no Product runtime file or state schema is changed by this corrective.

## Visibility decision

`PRIVATE` is publish-ready now. `PUBLIC` is technically possible, but public open-source licensing is **not** claimed until an explicit root OpenRill license is selected. This audit intentionally does not choose a license on the owner's behalf.

## Validation false-start retained

The first full source-vs-clone comparator included a locally generated `scripts/__pycache__/*.pyc` file and therefore reported one false missing file after clone, even though the clone manifest had already passed. OR-ISSUE-410 records the error. The corrected comparator uses the same source-package exclusions as the manifest.
## Git transport validation result

A temporary local Git repository was initialized from the corrected source, all package-owned files were staged, a validation commit was created, and a separate clone was checked. The temporary `.git` directories were removed afterward and are not part of the source package.

```text
CLONE_PACKAGE_MANIFEST=1891/1891 PASS
SOURCE_PACKAGE_FILES_INCLUDING_MANIFEST=1892
CLONE_PACKAGE_FILES_INCLUDING_MANIFEST=1892
BYTE_IDENTITY_MISSING=0
BYTE_IDENTITY_EXTRA=0
BYTE_IDENTITY_CHANGED=0
ROOT_CMD_CRLF=4/4 PASS
ENV_LOCAL=IGNORED
MATTERMOST_REAL_ENV=IGNORED
MATTERMOST_ENV_EXAMPLE=TRACKABLE
PEM_KEY_P12_PFX=IGNORED
```

Root CMD clone evidence remained exact: 260 bytes/12 CRLF, 307 bytes/12 CRLF, 209 bytes/10 CRLF, and 208 bytes/10 CRLF, each with zero bare LF.

## Full aggregate status in this container

The uploaded source ZIP intentionally excludes `node_modules`. A direct `python scripts/run_step023a_acceptance.py` therefore stopped at `workspace-module-links`, as expected before dependency materialization. The container has Node 22.16.0 and Corepack 0.32.0 but no installed `pnpm`; Corepack could not fetch the pinned pnpm 11.15.1 because `registry.npmjs.org` DNS/network access returned `EAI_AGAIN`.

This is an environment prerequisite, not a STEP023A Product regression. The uploaded package already contains its prior `LOCAL_SOURCE_ACCEPTED` evidence. For this publishing corrective, validation therefore uses Git clone byte identity, current governance tests, source/manifest/architecture checks, deterministic source packaging, and Fresh ZIP verification. Full aggregate and Windows Live remain commands to run after `pnpm install --frozen-lockfile` on a dependency-capable machine.
## Final source-package verification

After all publication-corrective source/document changes were applied, the GitHub-ready tree passed the source-package checks available without dependency installation:

```text
SOURCE_VERSION_ALIGNMENT=PASS version=0.25.0-step023a manifests=38 sources=37
WORKSPACE_LOCK_ALIGNMENT=PASS importers=38 dependencies=102
SOURCE_ROOT_ARCHIVE=PASS count=0
PACKAGE_MANIFEST=1891/1891 PASS
ARCHITECTURE=37 packages / 99 edges / 189 sources PASS
GITHUB_GOVERNANCE=8/8 PASS
ZIP_ENTRIES=1892
DETERMINISTIC_REPACK=BYTE_IDENTICAL
```

This corrective remains source-transport/governance only. The prior STEP023A Product acceptance evidence is retained unchanged, while full dependency-backed aggregate and Windows Live are intentionally left to the pinned-install environment described above.

