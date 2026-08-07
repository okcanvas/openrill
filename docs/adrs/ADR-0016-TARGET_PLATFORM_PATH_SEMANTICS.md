# ADR-0016 — Target Platform Selects Path Semantics

- Status: Accepted
- Date: 2026-08-01
- Step: STEP002B

## Context

`resolveProfilePaths`는 테스트와 향후 migration/doctor 기능을 위해 explicit target platform을 받는다. 기존 구현은 root 정책은 target platform으로 선택했지만 경로 조합은 host-native `node:path.resolve`를 사용했다. Windows에서 Linux target을 계산하면 Windows drive와 separator가 결과에 섞였다.

## Decision

- `platform === "win32"`이면 `node:path.win32`를 사용한다.
- 그 외 platform은 `node:path.posix`를 사용한다.
- 선택된 path implementation을 data/config/runtime/lock/metadata 전체 계산에 사용한다.
- `platform`이 생략된 정상 Runtime은 `process.platform`을 사용한다.

## Consequences

- 동일 입력과 target platform은 host OS와 무관하게 동일한 경로를 만든다.
- cross-platform doctor, migration planning, tests가 결정적이다.
- Windows와 Unix 환경변수 override의 path grammar가 명확해진다.
- 실제 filesystem access는 현재 host platform 경로로만 수행해야 하며 foreign target 경로는 계산/검증 용도다.
