# STEP012DR4 accepted source version identity drift

## Issue

```text
OR-ISSUE-077
STEP012DR4_ACCEPTED_SOURCE_VERSION_IDENTITY_DRIFT
```

## Code-confirmed symptom

The immutable STEP012DR4 ZIP was Windows accepted as version `0.12.10-step012dr4`, and all 26 package manifests carried that version. A source audit before STEP013A found that 25 package/app/service `src/index.ts` files still exported:

```text
PACKAGE_VERSION = "0.12.7-step012dr1"
```

`services/agent-host/src/lifecycle.ts` also emitted `0.12.7-step012dr1` in private/public Host metadata and Skill snapshot `currentVersion`.

## Root cause

Corrective release packaging updated package manifests, generator/verifier identity, and release documents, but did not own source-level package identity constants or Host runtime version literals. Existing acceptance checked manifest alignment only.

## Impact

- public `getPackageIdentity()` could report a release older than the installed manifest;
- Host metadata/bootstrap could report a stale release;
- Skill snapshot provenance could retain a stale runtime version;
- a later diagnostic could compare manifest and runtime identity and reach a false conclusion.

The accepted DR4 artifact remains immutable; this is closed only in the next candidate.

## Fix

- update all 26 manifests to STEP013A version;
- update all 25 source package identity constants;
- update current Host metadata and Skill snapshot runtime literals;
- add `scripts/verify_source_version_alignment.py`;
- acceptance runs the verifier and requires exact manifest/source/Host alignment.

## Recurrence gate

The verifier enumerates the root plus every workspace manifest, compares each `src/index.ts` `PACKAGE_VERSION`, and checks current Host lifecycle version literals. Historical acceptance scripts and immutable evidence are excluded from current-runtime ownership.
