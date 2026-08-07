# OpenClaw Control UI Framework Selection Evidence

OpenClaw is reference evidence only. No OpenClaw source is imported or copied into OpenRill.

## Verified source tree

```text
reference ZIP=openclaw-main.zip
source root=ui/
```

## Evidence

- `[OC-UI-001] ui/src/api/gateway.ts:306-318` — the UI owns an independent `GatewayBrowserClient` and socket adapter rather than direct database access.
- `[OC-UI-002] ui/src/app-routes.ts:23` — Approvals is an independent route module.
- `[OC-UI-003] ui/src/app-routes.ts:26` — Chat is represented by route modules.
- `[OC-UI-004] ui/package.json:38` — current OpenClaw UI runtime is `lit` 3.3.3.
- `[OC-UI-005] ui/package.json:32-33` — transcript virtualization uses TanStack Lit/virtual-core packages.
- `[OC-UI-006] ui/package.json:46-52` — browser testing/build stack includes Vitest browser, Playwright, Vite and Vitest.

## Interpretation

The source proves that Lit can support a large route-based Control UI and that the browser client can remain a separate protocol boundary. It does **not** prove that OpenRill must use Lit. OpenRill compared Lit with Vue using its own Local Protocol and product workload.

## Adopted boundary

- independent browser protocol client
- route-oriented application shell
- explicit approval/chat surfaces
- bounded transcript virtualization
- browser build and test automation

## Not adopted as product dependency

- OpenClaw packages
- OpenClaw router
- OpenClaw UI components
- OpenClaw Lit application source
