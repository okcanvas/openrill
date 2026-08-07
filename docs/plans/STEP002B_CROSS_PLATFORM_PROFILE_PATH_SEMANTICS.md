# STEP002B — CROSS_PLATFORM_PROFILE_PATH_SEMANTICS

## 목적

Windows Node 24.18.0 + pnpm 11.15.1의 실제 `pnpm acceptance:step002a`에서 드러난 profile path 계산 결함을 수정한다. `ResolveProfilePathsOptions.platform`은 문서상 target platform 선택자였지만 실제 경로 조합은 실행 중인 host OS의 `node:path.resolve`를 사용했다. OpenRill은 명시된 target platform에 맞는 path grammar를 선택하도록 고정한다.

## 기준선

- Input: `STEP002A_TYPESCRIPT6_EXPLICIT_NODE_TYPES`, version `0.2.1-step002a`
- Output: `STEP002B_CROSS_PLATFORM_PROFILE_PATH_SEMANTICS`, version `0.2.2-step002b`
- Previous Windows-live baseline: `STEP001D_WINDOWS_CLI_ENTRYPOINT_CANONICALIZATION`
- STEP002A Windows result: TypeScript 6 Node types PASS, 18/19 unit tests PASS, cross-platform profile path test FAIL

## Reference Evidence

### 실제 Windows 실패 증거

`tests/unit/profile-paths.test.mjs`가 Linux target을 명시했지만 Windows host에서 다음 값을 반환했다.

```text
actual   D:\home\test\.local\share\openrill\alpha\runtime
expected /home/test/.local/share/openrill/alpha/runtime
```

같은 실행에서 build, TypeScript environment checks, Host live process, CLI status/stop, loopback guard는 통과했다. 실패는 profile path unit test 하나에 한정됐다.

### 저장소 코드 증거

`packages/config/src/index.ts`는 다음 두 값을 분리했다.

- platform branch: `platform === "win32"`
- path assembly: host-native `resolve` imported from `node:path`

따라서 `platform: "linux"`를 Windows에서 전달해도 branch만 Unix를 선택하고 실제 separator/root semantics는 Windows를 사용했다.

## 원인

`platform`을 경로 root 정책 선택에만 사용하고 path implementation 선택에는 사용하지 않았다. Target platform을 인자로 받는 API가 host process의 `process.platform` path semantics에 오염되었다.

## 구현 범위

1. `packages/config/src/index.ts`
   - bare `resolve` import를 제거한다.
   - `node:path`의 `win32`와 `posix`를 가져온다.
   - target platform에 따라 path semantics를 한 번 선택한다.
   - data/config/runtime/lock/metadata 경로 전체를 선택된 semantics로 계산한다.
2. `tests/unit/profile-paths.test.mjs`
   - Windows target 결과를 정확한 Windows path로 검증한다.
   - Linux/macOS target 결과를 정확한 POSIX path로 검증한다.
   - `OPENRILL_DATA_ROOT`와 `OPENRILL_CONFIG_ROOT` override도 target grammar를 유지하는지 검증한다.
3. acceptance
   - source contract, exact live paths, build/unit/architecture/export, STEP002A regression을 검증한다.

## 공개 계약

```text
platform = win32       path semantics = node:path.win32
platform != win32      path semantics = node:path.posix
platform omitted       platform = process.platform
profile path grammar   depends only on selected target platform
```

- 명시적 `platform`은 host OS와 독립적이다.
- Windows target은 drive/root/backslash semantics를 사용한다.
- Unix target은 POSIX root/slash semantics를 사용한다.
- profile canonicalization과 reserved-name 정책은 변경하지 않는다.
- 환경변수 override도 선택된 platform grammar로 하위 경로를 조합한다.

## 상태 전이

```text
STEP002A_TYPESCRIPT_ENVIRONMENT_FIXED
  → WINDOWS_PROFILE_PATH_TEST_FAILED
  → HOST_NATIVE_PATH_CONTAMINATION_IDENTIFIED
  → TARGET_PLATFORM_PATH_SEMANTICS_SELECTED
  → CROSS_PLATFORM_PATH_REGRESSION_PASSED
  → STEP002B_ACCEPTED
```

Host lifecycle 상태 전이에는 변경이 없다.

## 실패 및 복구

- `platform: "linux"` 결과에 drive letter 또는 backslash가 포함되면 실패한다.
- `platform: "win32"` 결과가 POSIX separator를 사용하면 실패한다.
- runtime, lock, metadata가 서로 다른 path semantics로 계산되면 실패한다.
- native Host lifecycle 회귀가 발생하면 STEP002B를 수용하지 않는다.
- 실패 시 STEP002A로 rollback할 수 있지만 Windows cross-platform test는 계속 실패 상태로 남는다.

## Acceptance

- root version/package manager
- required implementation and documentation files
- `win32`/`posix` explicit imports
- bare host-native `resolve` import 제거
- exact Windows default roots
- exact Unix default roots
- exact Windows override roots
- exact Unix override roots
- build/unit/architecture/export suite
- STEP002A full regression
- runtime/database/protected payload zero
- Windows CRLF launcher

Windows 명령:

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step002b
```

## 패키징 산출물

- version `0.2.2-step002b`
- `scripts/run_step002b_acceptance.py`
- `scripts/sh_run_step002b_acceptance.cmd`
- `scripts/sh_run_step002b_acceptance.sh`
- `scripts/package_step002b.py`
- `reference/validation/STEP002A_WINDOWS_PROFILE_PATH_FAILURE.md`
- `reference/validation/STEP002B_ACCEPTANCE_REPORT.txt`
- deterministic ZIP과 SHA-256

## 제외

- profile directory migration
- config snapshot schema
- public WebSocket/RPC
- SQLite
- Agent/Tool 실행
- OS service 설치
- UI framework 선택
- unrelated `DEP0190` warning remediation
