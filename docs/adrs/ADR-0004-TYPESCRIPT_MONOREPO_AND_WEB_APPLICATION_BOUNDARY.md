# ADR-0004: TypeScript Monorepo And Web Application Boundary

- Status: Accepted
- Date: 2026-08-01

## Context

OpenRill은 로컬 Host, protocol, tool runtime, browser Control UI, 이후 desktop shell을 하나의 제품으로 개발한다. 이 단계에서 필요한 결정은 UI 프레임워크 이름이 아니라 package graph, build ownership, browser-to-Host 통신 경계다.

OpenClaw의 실제 `ui/package.json`은 Vite와 Lit를 사용하지만, Gateway browser client와 route module 분리는 특정 프레임워크보다 상위의 구조적 결정이다. OpenRill이 같은 프레임워크를 선택해야 한다는 근거는 없다.

## Decision

- Host와 공유 계약은 TypeScript로 구현한다.
- workspace는 pnpm monorepo로 구성한다.
- `@openrill/web`은 browser Control UI application boundary다.
- UI는 Local Protocol client를 통해서만 제품 상태에 접근한다.
- foundational STEP에서는 React, Vue, Lit, Solid, Svelte 등 특정 UI runtime을 확정하지 않는다.
- 실제 UI 프레임워크는 STEP010A의 동일 시나리오 spike와 별도 ADR로 선택한다.

## Consequences

- service와 package는 UI application 또는 UI runtime에 의존하지 않는다.
- framework 교체가 Host, protocol, state schema를 변경하지 않는다.
- STEP001은 framework dependency 없이 web boundary와 deterministic build contract만 검증한다.
- 프레임워크 결정은 취향이 아니라 streaming, reconnect, virtualization, accessibility, testing, desktop packaging의 측정 결과로 남는다.

## Reference

OpenClaw 관찰은 `/reference/openclaw/UI.md`에 기록한다. 이 ADR의 계약과 선택 절차는 OpenRill이 독립 소유한다.
