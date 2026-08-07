# Control UI

## 코드 관찰

- UI는 독립 Gateway browser client를 갖는다: `[OC-UI-001] ui/src/api/gateway.ts:306`.
- Approval과 Chat은 route module로 분리된다: `[OC-UI-002]`, `[OC-UI-003]`.
- 현재 OpenClaw UI package는 Vite와 Lit를 사용한다: `[OC-UI-004] ui/package.json:38`.

## 채택

- protocol client를 application view/runtime과 분리한다.
- route 단위 기능 경계를 유지한다.
- reconnect, event cursor, projection reconciliation을 UI framework 밖의 명시적 client 계약으로 둔다.

## 변경

- OpenClaw의 Lit 선택은 그대로 채택하지 않는다.
- React, Vue, Lit, Solid, Svelte 등의 이름을 architecture foundation에 넣지 않는다.
- 실제 OpenRill event workload가 준비된 STEP010A에서 동일 fixture로 후보를 비교하고 별도 ADR로 선택한다.

## 이유

프레임워크를 먼저 정하면 OpenClaw에서 얻어야 할 상위 정답인 browser client 분리, route 경계, reconnect 복구보다 구현 취향이 제품 구조를 지배한다. OpenRill은 protocol과 Host가 UI framework 교체에 영향을 받지 않는 구조를 우선한다.
