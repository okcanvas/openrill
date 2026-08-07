# STEP022A OpenClaw Extension Package and Runtime Registry Source Audit

```text
OPENCLAW_ARCHIVE=openclaw-main.zip
OPENCLAW_PACKAGE_VERSION=2026.7.2
OPENCLAW_SHA256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
OPENCLAW_ZIP_ENTRIES=31905
MODE=READ_ONLY_SOURCE_AUDIT
COPYING=NONE
```

## Inspected source

- `packages/plugin-package-contract/src/index.ts`
- `src/plugins/activation-planner.ts`
- `src/plugins/active-runtime-registry.ts`
- `src/plugins/api-lifecycle.ts`
- `src/plugins/bundle-manifest.ts`
- `extensions/mattermost/package.json`

## Extracted principles

1. Validate compatibility metadata before importing runtime code.
2. Build a deterministic activation plan from manifest ownership rather than import order.
3. Separate active runtime ownership from manifest discovery records.
4. Make lifecycle method availability explicit and reject unsafe late calls.
5. Treat operator-selected local roots as a trust boundary while still enforcing path containment and closed metadata.
6. Keep channel packages outside the core Host and declare host/API compatibility.

## OpenRill-native decisions

OpenRill does not copy OpenClaw APIs, types, field names, implementation text, install model, or plugin marketplace behavior. STEP022A defines `openrill.extension.json`, Extension API v1, exact capability pairs, Config-owned `SecretRef`, and a Host-owned registry that has no repository, Run, Task, Flow, or state authority. The runtime is trusted local code, not a sandbox. Remote installation, npm lifecycle scripts, hot reload, marketplace distribution, and Mattermost transport are outside STEP022A.
