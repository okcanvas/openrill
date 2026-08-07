# STEP002A — TYPESCRIPT6_EXPLICIT_NODE_TYPES

## 목적

Windows Node 24.18.0 + pnpm 11.15.1의 실제 `pnpm acceptance:step002`에서 드러난 TypeScript 6 ambient type 경계 결함을 수정한다. Host 생명주기 자체는 live process에서 통과했으므로 제품 동작을 변경하지 않고 compiler environment 계약만 명시적으로 닫는다.

## 기준선

- Input: `STEP002_CLI_AND_LOCAL_HOST_LIFECYCLE`, version `0.2.0-step002`
- Output: `STEP002A_TYPESCRIPT6_EXPLICIT_NODE_TYPES`, version `0.2.1-step002a`
- Previous Windows-live baseline: `STEP001D_WINDOWS_CLI_ENTRYPOINT_CANONICALIZATION`
- STEP002 Windows result: Host live process PASS, TypeScript build FAIL

## Reference Evidence

### 실제 Windows 실패 증거

`pnpm acceptance:step002`의 build 단계에서 다음 symbol이 해석되지 않았다.

- `process`
- `NodeJS.ProcessEnv`
- `node:fs/promises`, `node:path`, `node:http`, `node:crypto`
- `setTimeout`, `setImmediate`

동일 실행에서 `step002-live-process`, CLI version/help/status, loopback guard는 통과했다. 따라서 Host Runtime 결함이 아니라 compile-time Node ambient types 결함이다.

### 저장소 코드 증거

- root `package.json`에는 `@types/node@22.20.1`이 이미 존재한다.
- `tsconfig.base.json`과 `tsconfig.node.json`에는 `compilerOptions.types`가 없었다.
- Node workspace 23개가 `tsconfig.node.json`을 상속한다.
- web workspace 1개만 `tsconfig.web.json`을 상속한다.
- TypeScript version은 `6.0.3`이다.

### TypeScript 6 공식 동작

TypeScript 6은 `types` 기본값을 빈 배열로 변경한다. Node global과 `node:*` module declaration이 필요한 프로젝트는 `types: ["node"]`를 명시해야 한다.

## 원인

STEP001에서 TypeScript 6.0.3을 고정했지만 TypeScript 5.x 시대의 implicit visible `@types` 동작을 전제로 `tsconfig.node.json`을 작성했다. root에 `@types/node`가 설치되어도 TypeScript 6의 기본 `types: []` 때문에 Node declaration이 compilation에 포함되지 않았다.

## 구현 범위

1. `tsconfig.base.json`
   - `types: []`를 명시해 ambient type 기본 경계를 닫는다.
2. `tsconfig.node.json`
   - `types: ["node"]`를 명시한다.
3. `tsconfig.web.json`
   - `types: []`를 명시해 Node global이 browser source로 누출되지 않게 한다.
4. 23개 Node workspace
   - 개별 임시 `types` override 없이 공통 Node config를 상속한다.
5. root dependency
   - `@types/node@22.20.1` 단일 source를 유지한다.
6. acceptance
   - effective config, inheritance, Node source coverage, build, STEP001/STEP002 regression을 검증한다.

## 공개 계약

```text
Base TypeScript environment  ambient types = []
Node TypeScript environment  ambient types = ["node"]
Web TypeScript environment   ambient types = []
Node type package            @types/node@22.20.1
```

- Node ambient types는 `tsconfig.node.json`에서만 연다.
- browser package는 Node globals를 전제로 작성하지 않는다.
- 각 workspace에 `@types/node`를 중복 선언하지 않는다.
- `skipLibCheck`를 실패 은폐 수단으로 변경하지 않는다.

## 상태 전이

```text
STEP002_RUNTIME_LIVE_BUT_BUILD_FAILED
  → TYPESCRIPT_ENVIRONMENT_CLASSIFIED
  → NODE_AMBIENT_TYPES_EXPLICIT
  → BUILD_AND_RUNTIME_REGRESSION_PASSED
  → STEP002A_ACCEPTED
```

제품 Host lifecycle 상태 전이에는 변경이 없다.

## 실패 및 복구

- `types: ["node"]`가 없으면 Node workspace build를 실패시킨다.
- web config에 `node`가 포함되면 environment leakage로 실패시킨다.
- root `@types/node`가 제거되거나 버전이 바뀌면 frozen lock/build gate가 실패한다.
- Node source workspace가 web config를 상속하면 architecture gate가 실패한다.
- 실패 시 STEP002 Runtime 코드는 rollback하지 않고 compiler configuration만 수정한다.

## Acceptance

- root version/package manager
- base/node/web explicit `types` contract
- 23 Node workspace inheritance
- 1 web workspace inheritance
- Node source import/global inventory
- root `@types/node@22.20.1`
- lockfile snapshot presence
- `tsc --showConfig` effective Node types
- STEP001 regression
- STEP002 regression including live child process
- package cleanliness
- Windows CRLF launcher

Windows 명령:

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step002a
```

## 패키징 산출물

- version `0.2.1-step002a`
- `scripts/run_step002a_acceptance.py`
- `scripts/sh_run_step002a_acceptance.cmd`
- `scripts/sh_run_step002a_acceptance.sh`
- `scripts/package_step002a.py`
- `reference/validation/STEP002A_ACCEPTANCE_REPORT.txt`
- deterministic ZIP과 SHA-256

## 제외

- Host lifecycle 기능 변경
- public WebSocket/RPC
- SQLite
- Agent/Tool 실행
- OS service 설치
- UI framework 선택
