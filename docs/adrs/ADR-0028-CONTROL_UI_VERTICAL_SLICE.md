# ADR-0028 — Same-Origin Vue Control UI Vertical Slice

- Status: Accepted
- Step: STEP011_CONTROL_UI_VERTICAL_SLICE

## Context

STEP010A selected Vue 3, but no production browser runtime or Host static UI boundary existed. The Host exposed lifecycle HTTP and Local Protocol WebSocket only. The first interactive UI must exercise Conversation, streaming, Tool, Approval and Artifact behavior without creating a second business-state authority.

## Decision

1. Package Vue 3.5.40 as a same-origin immutable vendor asset.
2. Serve the UI from the running loopback Host with strict host/origin/proxy-header checks and CSP.
3. Bootstrap the Local Protocol credential through a no-store same-origin endpoint; keep it in memory only.
4. Keep `LocalProtocolClient` and Control UI projection framework-neutral.
5. Expose public Workspace and Artifact projections through Local Protocol; never expose canonical roots or Artifact storage paths.
6. Treat notice gaps as explicit resynchronization, not cursor advancement.
7. Validate the vertical slice with a real Chromium page, separate Host process, Responses-compatible provider, Approval decision and Artifact content open.

## Consequences

- UI state is a projection; SQLite remains Host-owned.
- browser reload resumes from a persisted non-secret notice cursor.
- static asset and Artifact byte serving become security boundaries with explicit limits.
- future UI work can replace templates/components without changing protocol ordering semantics.

## Rejected

- direct SQLite access from browser code;
- token embedded in HTML or local storage;
- CDN runtime dependency at product runtime;
- silent notice-gap skipping;
- mocked-only browser acceptance.
