# OpenRill Control UI Framework Evaluation

## Decision summary

```text
step=STEP010A_CONTROL_UI_FRAMEWORK_SELECTION
selected=VUE_3
finalists=VUE_3,LIT_3
fixture=openrill-control-ui-step010a-v1
fixtureSha256=45ca6118a68277140ef84c9f0ccaa6fd8fd978e38ac5565741fa46066650cd57
matrixSha256=0fe6066ad50a6b69513157b7a1cc89be083f12c6cc3fdab9710d847c3d7d5579
```

The production Vue dependency is **not** introduced in STEP010A. It must be added through the pnpm lockfile in STEP011. Exact external ESM modules are used only by the comparison spikes so that the decision package does not silently change the production runtime.

## Repository workload

Both finalists consume the same immutable fixture and the same framework-neutral workload modules.

Validated scenarios:

1. append-only text stream projection
2. Tool card projection
3. Approval card and explicit decision
4. Artifact card projection
5. unknown event fallback
6. duplicate notice suppression
7. sequence-gap detection and snapshot resync
8. reconnect cursor resume
9. 10,000-row transcript virtualization with at most 30 rendered rows in the measured windows
10. ArrowUp/ArrowDown card navigation
11. banner/main/log/status accessibility landmarks
12. framework isolation from `LocalProtocolClient`

The production `@openrill/web` package exports the same framework-neutral projection and reconnect contract. Unit tests compare the spike result with the compiled package export.

## Candidate reduction

| Candidate | Result before finalist spike | Code-confirmed reason |
|---|---|---|
| React | Not selected as finalist | Would require React plus renderer/runtime conventions while the current repository has no React-specific code or team constraint. No repository evidence justified choosing it over Vue for this application workload. |
| Vue 3 | Finalist | App-scale routing, forms, settings, diagnostics and transcript screens align with Vue's application framework and TypeScript/SFC workflow. |
| Lit 3 | Finalist | OpenClaw proves Lit can support a large Control UI and its Web Component/runtime footprint is small. |
| Solid | Not selected as finalist | Fine-grained reactivity is attractive, but no OpenRill or OpenClaw code evidence provided a decisive ecosystem or maintenance advantage over the two finalists. |
| Svelte | Not selected as finalist | Compiler-based ergonomics are attractive, but adding a third build model did not improve the bounded comparison after Vue and Lit covered the app-framework and web-component ends of the design space. |

This reduction is not a universal ranking. It is specific to the current OpenRill repository and STEP011 workload.

## Exact finalist versions

| Candidate | Version | Spike runtime | Production package status |
|---|---:|---|---|
| Vue | 3.5.40 | exact production browser ESM URL | not yet a production dependency |
| Lit | 3.3.3 | exact official single-file core ESM URL | not yet a production dependency |

Research snapshot date: 2026-08-02.

Primary external sources retained for re-verification:

- Vue releases: `https://github.com/vuejs/core/releases`
- Vue changelog: `https://github.com/vuejs/core/blob/main/CHANGELOG.md`
- Vue production deployment: `https://vuejs.org/guide/best-practices/production-deployment`
- Vue quick start: `https://vuejs.org/guide/quick-start.html`
- Lit home and size statement: `https://lit.dev/`
- Lit adding to a project: `https://lit.dev/docs/tools/adding-lit/`
- Lit requirements: `https://lit.dev/docs/tools/requirements/`

## Measured spike results

The deterministic runner measures candidate-owned source/build output separately from the externally pinned runtime.

| Metric | Vue 3.5.40 | Lit 3.3.3 |
|---|---:|---:|
| candidate source lines | 53 | 52 |
| candidate source bytes | 2,613 | 2,769 |
| deterministic built app bytes | 2,604 | 2,761 |
| deterministic built app gzip bytes | 1,237 | 1,310 |
| published external runtime bytes recorded in lock | 106,440 | 15,400 |
| shared workload scenarios | PASS | PASS |
| shared DOM/accessibility contract | PASS | PASS |

The runtime byte values are metadata recorded for comparison; STEP010A does not download or repackage those third-party runtimes. Therefore this report does not claim an offline framework-engine execution. It proves the shared workload, candidate binding source, deterministic production-mode spike output, exact version pins and package isolation. Actual packaged Vue runtime and browser E2E begin in STEP011.

## Decision matrix

Weights total exactly 100. Scores use a closed 1–5 scale and are hash-bound in `apps/agent-web/spikes/decision-matrix.json`.

| Dimension | Weight | Vue | Lit | Repository-specific interpretation |
|---|---:|---:|---:|---|
| workload correctness | 30 | 5 | 5 | both consume the same fixture and contracts |
| maintainability and team productivity | 25 | 5 | 3 | OpenRill requires an application shell, routes, forms, settings and diagnostics rather than a component library alone |
| application ecosystem | 15 | 5 | 3 | Vue provides a cohesive app-oriented path for STEP011; Lit needs more product conventions to be assembled explicitly |
| runtime and bundle cost | 15 | 3 | 5 | Lit has the clear runtime-size advantage |
| desktop embedding | 10 | 5 | 5 | both are browser-native and can be embedded by the future desktop shell |
| test and failure clarity | 5 | 5 | 4 | both are testable; Vue's conventional application tooling is preferred for the planned full app |

Weighted totals:

```text
Vue=4.70
Lit=4.15
```

## Why Vue 3 was selected

- Both finalists passed the same repository-owned functional contract, so correctness did not decide the result.
- Lit's runtime-size advantage is real, but the OpenRill Control UI is local and dominated by app-scale route/state/form/diagnostic work rather than public-site transfer cost.
- Vue provides the more cohesive application development path for STEP011 while preserving the framework-neutral Local Protocol and projection packages.
- The selection does not authorize framework types in protocol, state, service or Host boundaries.

## Why Lit was not selected

Lit is not rejected as incapable. The OpenClaw source demonstrates a substantial Lit Control UI with an independent browser gateway client, route modules and transcript virtualization. The reason is narrower: OpenRill would need to define more application-level conventions around routing, forms, shared state and screen composition, while Vue gives a more direct path for this project's next step.

## Reproducibility

```text
node scripts/run-step010a-spikes.mjs
node scripts/workspace-runner.mjs build
node --test --test-reporter=tap tests/unit/control-ui-framework-step010a.test.mjs
python scripts/check_architecture.py
```

Generated comparison outputs live only under `.artifacts/step010a` and are removed by acceptance cleanup. The source fixture, lock, decision matrix and reports are packaged.
