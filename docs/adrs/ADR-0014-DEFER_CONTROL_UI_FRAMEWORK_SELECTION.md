# ADR-0014: Defer Control UI Framework Selection

- Status: Superseded
- Date: 2026-08-01
- Superseded by: `ADR-0027-CONTROL_UI_FRAMEWORK_VUE3` on 2026-08-02

## Context

STEP001은 repository와 toolchain 경계를 닫는 단계다. 특정 UI runtime을 미리 고정하면 아직 구현되지 않은 Local Protocol, conversation stream, tool/approval event 요구보다 프레임워크 선호가 앞서게 된다.

OpenClaw의 현재 Control UI는 Vite + Lit를 사용한다. 이는 OpenClaw의 선택이며 OpenRill의 필수 조건이 아니다. OpenRill은 동일한 제품 시나리오를 후보 기술에 적용한 뒤 선택한다.

## Decision

- STEP001의 `@openrill/web`은 `frameworkSelection: "DEFERRED"`를 공개한다.
- UI framework decision gate는 `STEP010A_CONTROL_UI_FRAMEWORK_SELECTION`이다.
- production UI runtime과 bundler integration은 STEP011에서 도입한다.
- 후보군은 최소 React, Vue 3, Lit, Solid, Svelte를 검토하되 후보 수 자체가 목표는 아니다.
- STEP010A는 2개 이하의 finalist spike로 좁히고 하나를 별도 ADR로 확정한다.

## Required Comparison Scenario

각 finalist는 같은 fixture로 다음을 증명해야 한다.

1. append-only text/event stream의 incremental projection
2. Tool, Approval, Artifact의 unknown-type fallback
3. disconnect/reconnect와 cursor resync
4. 긴 transcript virtualization
5. keyboard navigation과 accessibility smoke
6. Local Protocol client와 application state의 분리
7. browser build와 desktop shell embedding 가능성
8. unit/component/E2E test의 결정성

## Consequences

- STEP001에는 React/Vue/Lit/Svelte/Solid production dependency가 없다.
- STEP011 문서는 선택된 framework 이름을 선행조건에서 읽고 특정 기술을 선가정하지 않는다.
- service가 UI application 또는 알려진 UI runtime에 의존하면 architecture gate가 실패한다.
- 선택 결과는 변경 가능한 구현 결정이지만 Local Protocol 경계는 변하지 않는다.
