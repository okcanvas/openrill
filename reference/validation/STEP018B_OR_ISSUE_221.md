# OR-ISSUE-221 — Host lifecycle retained STEP018A runtime version literals

## First observation

STEP018B source/version alignment failed after the Product focused suite passed:

```text
OPENRILL_SOURCE_VERSION_ALIGNMENT_FAIL host-lifecycle:0.18.0-step018a host-lifecycle:0.18.0-step018a
```

## Direct cause

Two Host runtime-info construction paths in `services/agent-host/src/lifecycle.ts` retained `0.18.0-step018a` while package manifests and exported source identities had advanced to `0.18.1-step018b`.

## Classification

```text
owner_dimension=SOURCE_PACKAGE_IDENTITY
product_capability_impact=NONE
state_schema_change=NONE
```

## Correction

Both Host runtime-info literals now align with the current root/package/source identity.

## Recurrence prevention

`verify_source_version_alignment.py` continues to treat all Host runtime literals as current mutable identity and fails before package acceptance when any retained prior version remains.
