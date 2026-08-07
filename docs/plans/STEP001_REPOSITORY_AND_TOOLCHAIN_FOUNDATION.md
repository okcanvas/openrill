# STEP001 — REPOSITORY_AND_TOOLCHAIN_FOUNDATION

## 목적

OpenRill의 TypeScript/pnpm monorepo, 독립 package 경계, CLI/Host/Web foundation, deterministic architecture gate를 구현한다. 제품 기능·DB·네트워크 listener는 아직 만들지 않는다.

## Reference Evidence

- `[OC-CLI-001] openclaw.mjs:11` — 공개 런처가 실행 전에 지원 Runtime을 검증한다.
- `[OC-CLI-004] src/cli/run-main.ts:158` — 시작 비용과 import graph를 줄이기 위한 명령 fast path가 존재한다.
- `[OC-TEST-001] src/gateway/server-import-boundary.test.ts:91` — startup-critical facade의 eager import와 경계 침범을 테스트한다.

## Source Audit 결론

OpenRill은 세 결론만 채택한다.

1. 공개 런처는 unsupported Runtime에서 제품 코드를 import하기 전에 실패해야 한다.
2. package graph와 source import graph를 모두 검사해야 한다.
3. Host composition root는 UI와 다른 application을 import하지 않는다.

OpenClaw의 CLI catalogue, gateway package layout, import 문구 또는 test source는 복사하지 않는다.

## 선행조건

- STEP000A deterministic gate `165/165 PASSED`.
- 분석 환경 기록: Node `v22.16.0`, Python `3.13.5`, TypeScript CLI `5.8.3`.
- pnpm `11.15.1`은 packageManager/lockfile로 고정하지만 분석 컨테이너의 registry fetch 실패 때문에 fresh install은 Windows live gate로 남긴다.

## 구현 범위

- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- `tsconfig.base.json`, `tsconfig.node.json`, `tsconfig.web.json`, `tsconfig.build.json`
- `openrill.mjs`
- `config/package-boundaries.json`
- 모든 `apps/*`, `services/*`, `packages/*`, `connectors/*`, `skills/*`의 `package.json`, `tsconfig.json`, `src/index.ts`
- `scripts/check-runtime.mjs`
- `scripts/workspace-runner.mjs`, `scripts/package-task.mjs`
- `scripts/check_architecture.py`, `scripts/check-exports.mjs`
- `scripts/run_step001_acceptance.py`와 Windows/POSIX launcher
- `tests/unit/*`
- `docs/adrs/ADR-0014-DEFER_CONTROL_UI_FRAMEWORK_SELECTION.md`

## 공개 계약과 불변조건

- 모든 workspace package는 `name/version/type/exports/engines`를 명시한다.
- 내부 dependency는 정확히 `workspace:*`만 사용한다.
- `@openrill/protocol`은 dependency 0개의 leaf package다.
- app은 다른 app에 의존하거나 import하지 않는다.
- service는 UI application package와 React/Vue/Lit/Svelte/Solid 등 UI runtime을 의존하거나 import하지 않는다.
- workspace graph는 cycle 0건이다.
- OpenClaw package dependency와 source import는 0건이다.
- root build artifact는 package별 `dist/`, TypeScript incremental artifact는 `.artifacts/tsbuild/`만 사용한다.
- STEP001 Host는 listener 0개, runtime directory 생성 0개다.
- `openrill start`는 아직 지원하지 않으며 성공한 것처럼 동작하지 않는다.

## Runtime 지원 정책

- Node 22는 `22.16.0` 이상, Node 24 이상은 허용한다.
- 버전만 검사하지 않고 `node:sqlite` capability를 함께 검사한다.
- Runtime 검사 통과 전 `@openrill/cli`를 import하지 않는다.
- 정확한 Windows 지원 범위는 STEP001 Windows live 로그로 최종 확정한다.

## UI framework 결정 경계

STEP001은 `@openrill/web` application boundary와 TypeScript/browser artifact 규칙만 구현한다. 특정 UI framework는 확정하지 않는다. `@openrill/web`은 `frameworkSelection = DEFERRED`, `frameworkDecisionStep = STEP010A`, `stateAccess = LOCAL_PROTOCOL_ONLY`를 공개한다. React/Vue/Lit/Svelte/Solid runtime, component source, bundler integration, browser E2E는 코드 기반 비교와 ADR 이후 STEP011에서 도입한다.

## 상태·영속성 영향

- DB schema 0개.
- `%LOCALAPPDATA%\OpenRill`, `%APPDATA%\OpenRill`, `~/.openrill` 생성 0회.
- network listener 0개.
- user payload와 Secret 저장 0개.

## 실패·복구 의미

- unsupported Node 또는 `node:sqlite` 부재: CLI import 전에 exit code 1.
- unknown STEP001 CLI command: exit code 2, side effect 0회.
- package cycle, unknown internal dependency, UI/service 침범: architecture gate 실패.
- build/typecheck 실패: 다음 test와 packaging을 수행하지 않는다.
- acceptance가 만든 `dist/`, `.artifacts/`는 마지막에 제거하고 source tree clean을 확인한다.

## Acceptance

1. STEP000A 회귀 gate.
2. 필수 toolchain/manifest/lockfile 검사.
3. Runtime capability 검사.
4. clean → TypeScript build.
5. Node built-in test runner unit tests.
6. manifest/source architecture gate.
7. 24개 workspace public export import smoke.
8. `openrill --version`, `openrill --help`, unsupported command smoke.
9. Host side-effect 0 검증.
10. framework-neutral web foundation artifact와 deferred selection contract 검증.
11. OpenClaw reference evidence 76건 보존.
12. generated artifacts cleanup와 protected payload 0 검증.

## Windows Live Acceptance

실제 Windows에서 다음을 실행해야 한다.

```cmd
corepack enable
pnpm install --frozen-lockfile
pnpm acceptance:step001
```

필수 증거:

- 실제 `node --version`, `pnpm --version`, `python --version`
- frozen install 성공
- build/unit/architecture/export/CLI smoke 성공
- CMD launcher CRLF 및 `%~dp0` 경로 성공
- 마지막 protected payload 0, runtime directory 0

Windows 로그 없이는 `Windows live accepted`로 선언하지 않는다.

## 산출물

- 빌드 가능한 독립 monorepo source baseline
- exact package graph와 lockfile
- Runtime preflight와 독립 CLI launcher
- architecture/import/export gate
- STEP001 deterministic acceptance report
- source manifest, ZIP, SHA-256

## 제외

- Host start/stop/status와 network listener
- Local Protocol transport
- SQLite DB 파일과 migration
- 모델 호출과 Tool 실행
- production UI framework와 bundler runtime
- Desktop shell

## 완료 선언

정적·build·unit·architecture·export·CLI deterministic gate가 모두 통과하면 packaged source baseline을 만들 수 있다. fresh pnpm install과 Windows launcher는 실제 Windows 로그 전까지 `PENDING`으로 유지한다.
