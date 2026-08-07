# STEP022A — Local Extension Package Contract and Runtime Registry

```text
STEP=STEP022A_LOCAL_EXTENSION_PACKAGE_CONTRACT_AND_RUNTIME_REGISTRY
VERSION=0.22.0-step022a
STATE_SCHEMA=24
PARENT=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
OFFICIAL_PRODUCT_BASELINE=STEP021BR2 / 82/82 WINDOWS LIVE ACCEPTED
PROMOTION=WINDOWS_EXTENSION_LIVE_PENDING
```

## Goal

Replace the Extension SDK identity stub with the minimum closed boundary required before a real Connector or second Provider can live outside the Host core.

## Ownership

- `@openrill/extension-sdk`: manifest, compatibility, settings, lifecycle and public-view types plus pure validators.
- Config: explicit roots, enabled ids, scalar settings, and SecretRefs.
- Agent Host: discovery, realpath containment, preflight, import, activation, capability ownership, deactivation, diagnostics, and restart behavior.
- Local Protocol: list/get/enable/disable with closed inputs.
- Extension: trusted local implementation only; no durable state ownership.

## Implemented contract

- closed manifest schema 1 and API version 1;
- structured host min-inclusive/max-exclusive compatibility;
- connector/provider/skill-source/tool capability declarations;
- deterministic explicit-root discovery;
- manifest and entry realpath containment and size bounds;
- duplicate Extension id and capability rejection before import;
- deep-frozen manifest and revalidated exact runtime claims;
- required SecretRef availability preflight and activation-only resolution;
- bounded import/activation/deactivation;
- isolated generic public failure diagnostics;
- reverse-order shutdown;
- runtime-effective enable/disable and conflict recovery;
- duplicate-free Host restart;
- no notice emission for an empty registry.

## Exclusions

No DB migration, marketplace, remote install, npm scripts, hot reload, sandbox claim, Connector transport, Mattermost API, Provider implementation, or state repository access.

## Acceptance

Local acceptance must include source/lock/module-link/manifest/build gates, focused Extension tests, retained Goal/Plan Product tests, affected Config/Protocol/Host regression, cumulative governance, canonical suite, architecture, and exports. Windows Live must use a path containing spaces, dynamically import a real `.mjs` Extension, materialize a SecretRef at activation, exercise all four protocol operations, close and restart the Host, and prove one Extension/one capability with activation sequence 1 after restart.

## Repetition prevention

`OR-ISSUE-307` through `OR-ISSUE-321` are independently recorded and required by STEP022A governance.

## Local source acceptance

The final source state passed staged exact acceptance 65/65: Extension 14/14, retained Product 26/26, affected regression 27/27, governance 220/220, canonical 168 files and 879/879 tests, architecture 37/98/173, and exports 37/37. Evidence: `reference/validation/STEP022A_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md`. Windows Live remains pending.
