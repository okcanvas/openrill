# ADR-0027: Select Vue 3 for the OpenRill Control UI

- Status: Accepted
- Date: 2026-08-02
- Decision step: `STEP010A_CONTROL_UI_FRAMEWORK_SELECTION`
- Supersedes: `ADR-0014-DEFER_CONTROL_UI_FRAMEWORK_SELECTION`

## Context

OpenRill deferred its Control UI framework until the Local Protocol, conversation/event ledger, approval resume and Skill snapshot contracts existed. Those boundaries are now implemented through STEP010R1.

The next production slice requires an application shell and routes for Conversations, Workspaces, Skills, Approvals, Artifacts, Settings and Diagnostics. It must render streaming text, Tool/Approval/Artifact cards, reconnect by cursor, resync on sequence gaps, virtualize long transcripts and remain accessible from the keyboard.

## Evidence

STEP010A implemented Vue 3.5.40 and Lit 3.3.3 candidate bindings over one repository-owned fixture and one framework-neutral projection/DOM contract.

```text
fixture=openrill-control-ui-step010a-v1
fixtureSha256=45ca6118a68277140ef84c9f0ccaa6fd8fd978e38ac5565741fa46066650cd57
Vue weighted score=4.70
Lit weighted score=4.15
```

Both finalists passed the functional workload. Lit had the smaller recorded runtime. Vue scored higher for the app-scale maintainability, productivity and ecosystem requirements of STEP011.

OpenClaw source evidence was used as reference rather than copied code: its UI uses an independent `GatewayBrowserClient`, separate approval/chat route modules, Lit 3.3.3 and TanStack Lit virtualization. This proves Lit's viability but does not make Lit a mandatory OpenRill boundary.

## Decision

1. Select **Vue 3** as the production Control UI framework.
2. Record the canonical selection as `VUE_3` in `config/ui-framework.json` and `@openrill/web`.
3. Keep `LocalProtocolClient`, cursor ordering, projection, resync and public state contracts framework-neutral.
4. Do not introduce the production Vue dependency in STEP010A. STEP011 must add the exact Vue runtime and build tooling through the frozen pnpm lockfile.
5. Keep framework-specific types out of `@openrill/protocol`, Host, State and other service/package public contracts.
6. Retain the Lit finalist and decision evidence as packaged historical input; do not maintain it as a second production UI.

## Consequences

### Positive

- STEP011 has one explicit framework and no longer carries a deferred decision.
- The product can use Vue's application-oriented component, route, form and TypeScript conventions.
- Protocol and projection behavior remain independently testable without Vue.
- Desktop embedding remains possible because the UI is still a browser application served by the Host.

### Negative

- Vue has a larger recorded browser runtime than the Lit finalist.
- STEP011 must add and govern Vue/Vite-related supply-chain entries.
- The team must prevent convenience imports from moving Vue state into protocol or service packages.

## Rejected alternatives

### Lit 3

Technically valid and smaller. Not selected because the planned OpenRill UI is an application with many routes/forms/settings/diagnostics, and the matrix favored a cohesive app framework over the lowest runtime size.

### React, Solid and Svelte

Reviewed during candidate reduction but not advanced to bounded finalist implementation. Repository evidence did not justify expanding beyond the Vue app-framework and Lit web-component alternatives.

## Guardrails

- architecture output must read the canonical config, not a hardcoded framework name
- no UI runtime dependency outside `apps/agent-web`
- no Vue production dependency before STEP011
- same fixture hash and decision-matrix hash required by acceptance
- unknown event fallback and sequence-gap resync remain framework-neutral package tests

## Follow-up

`STEP011_CONTROL_UI_VERTICAL_SLICE` introduces the locked Vue production runtime, bundler integration, actual browser component/E2E tests and the first complete Control UI slice.
