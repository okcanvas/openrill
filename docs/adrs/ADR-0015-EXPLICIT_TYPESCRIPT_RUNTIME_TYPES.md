# ADR-0015 — Explicit TypeScript Runtime Type Boundaries

- Status: Accepted
- Date: 2026-08-01
- Step: STEP002A

## Context

OpenRill은 TypeScript 6.0.3을 사용한다. STEP002 Windows build에서 Node globals와 `node:*` declarations가 누락되었다. root에는 `@types/node`가 설치되어 있었지만 TypeScript 6은 ambient `types`를 자동 포함하지 않았다.

## Decision

- `tsconfig.base.json`: `types: []`
- `tsconfig.node.json`: `types: ["node"]`
- `tsconfig.web.json`: `types: []`
- Node package는 공통 Node config를 상속한다.
- Web package에 Node ambient globals를 열지 않는다.
- `@types/node`는 root에서 한 번만 고정한다.

## Consequences

- Runtime environment가 compiler config에 명시된다.
- package 추가 시 Node/Web 경계를 의식적으로 선택해야 한다.
- 우연한 ambient declaration 유입을 차단한다.
- 향후 test runner type도 필요한 config에서만 명시해야 한다.
