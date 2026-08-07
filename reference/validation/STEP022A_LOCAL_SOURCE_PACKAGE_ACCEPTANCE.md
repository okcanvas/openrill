# STEP022A Local Source Package Acceptance

```text
STEP=STEP022A_LOCAL_EXTENSION_PACKAGE_CONTRACT_AND_RUNTIME_REGISTRY
VERSION=0.22.0-step022a
STATE_SCHEMA=24
MODE=LOCAL_STAGED_EXACT_ACCEPTANCE
CHECKS=65/65
STATE=PASSED
SOURCE_PACKAGE=LOCAL_SOURCE_ACCEPTED
PROMOTION=WINDOWS_EXTENSION_LIVE_PENDING
OFFICIAL_PRODUCT_BASELINE=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
```

## Why the local run is staged

The official `scripts/run_step022a_acceptance.py` remains the canonical one-command aggregate and is not weakened or bypassed. In this container, a single long-running tool invocation is terminated by the outer execution transport while the canonical child process is still running. No Product or acceptance stage reported a failure. The exact acceptance predicates and the exact canonical runner were therefore executed in deterministic stages in the same final source tree. Canonical file chunks were generated from the complete sorted `tests/unit/*.test.mjs` list; the concatenated chunk list was checked for exact order, zero omissions, zero extras, and zero duplicates.

This execution mode is evidence for source/package acceptance only. It does not replace the required Windows Live transition. Fresh source-only checks stop before runtime exports because deterministic packaging excludes `dist`; export verification is build-dependent and runs after install and workspace build.

## Exact result

```text
STATIC_CONTRACT=51/51 PASSED
SOURCE_VERSION=0.22.0-step022a / 38 manifests / 37 sources / 3 Host literals
WORKSPACE_LOCK=38 importers / 101 dependencies
WORKSPACE_MODULE_LINKS=98 edges / 37 materialized
SOURCE_ROOT_ARCHIVE_VIOLATIONS=0
PACKAGE_MANIFEST=1703/1703
WORKSPACE_BUILD=PASSED
FOCUSED_EXTENSION=14/14
RETAINED_STEP021BR2_PRODUCT=26/26
AFFECTED_CONFIG_PROTOCOL_HOST=27/27
GOVERNANCE=220/220
CANONICAL_FILES=168
CANONICAL_TESTS=879/879
CANONICAL_FAILED=0
CANONICAL_SKIPPED=0
ARCHITECTURE=37 packages / 98 edges / 173 sources
EXPORTS=37/37
```

The 51 static predicates are the same predicates owned by `run_step022a_acceptance.py`. The remaining 14 checks are its exact stage set: source version, lock, module links, source-root boundary, initial manifest, build, focused Extension, retained Product, affected regression, cumulative governance, canonical suite, architecture, exports, and final manifest.

## Product boundary accepted locally

STEP022A replaces the identity-only Extension SDK with a closed local package contract and a Host-owned runtime registry. It proves deterministic explicit-root discovery, API and Host compatibility checks, unique capability ownership, bounded activation/deactivation, SecretRef-only materialization, closed Local Protocol lifecycle operations, extension failure isolation, and duplicate-free Host restart. Extension code receives no Run, Task, Task Flow, Goal, Conversation, or State repository authority.

STEP022A deliberately does not claim a sandbox, marketplace, remote installation, hot reload, Connector transport, Provider implementation, or durable extension-owned state.

## Required Windows transition

```powershell
pnpm install --frozen-lockfile
pnpm acceptance:step022a:live
```

Expected focused marker:

```text
STEP022A_LOCAL_EXTENSION_PACKAGE_CONTRACT_AND_RUNTIME_REGISTRY
checks=43/43
state=PASSED
version=0.22.0-step022a
schema=24
live_harness=STEP022A_H1_LOCAL_EXTENSION_PACKAGE_RUNTIME_RESTART
```

Expected aggregate marker:

```text
checks=66/66
windows_extension_live=PASSED
promotion=READY
```

Until that actual Windows run passes, STEP021BR2 remains the official Product baseline.
