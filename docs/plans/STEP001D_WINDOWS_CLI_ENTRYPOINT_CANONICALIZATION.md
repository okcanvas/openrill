# STEP001D — Windows CLI Entrypoint Canonicalization

## 목적

Windows에서 `node openrill.mjs ...`를 직접 실행했는데도 CLI `main()`이 호출되지 않아 version/help/closed-start 검사가 모두 빈 출력으로 실패하는 결함을 제거한다. 직접 실행 판정은 URL 생성자의 임의 스킴 해석에 맡기지 않고, 운영체제 경로를 Node 표준 `pathToFileURL(resolve(...))` 경계로 정규화한다.

## Reference Evidence

- Windows live STEP001C 결과에서 build, unit, architecture, export suite는 통과했다.
- 같은 결과에서 실패한 항목은 정확히 `cli-version`, `cli-help`, `cli-start-closed` 세 개였다.
- `openrill.mjs`의 직접 실행 guard는 `new URL(process.argv[1], "file:").href`를 사용했다.
- WHATWG URL parser는 `D:\NODE_AGENTS\...`를 `file:` 상대 경로가 아니라 `d:` 스킴 URL로 해석한다.
- Node의 `pathToFileURL()`은 플랫폼 경로를 올바른 `file:///D:/...` URL로 변환하기 위한 표준 API다.
- CLI 내부 `runFoundationCli()` 단위 테스트는 통과했으므로 command routing이 아니라 root executable guard가 실패 경계다.

## 실패 증거

```text
[PASS] step001-suite :: suite_pass
[FAIL] cli-version
[FAIL] cli-help
[FAIL] cli-start-closed
STEP001 ... checks=245/248 state=FAILED
```

세 명령이 동시에 실패하고 `start`도 기대 종료코드 2가 아니라 main 미실행 상태로 종료된 것은 root executable이 CLI 함수에 도달하지 않았음을 뜻한다.

## 원인

기존 코드:

```js
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}
```

Windows `process.argv[1]`가 `D:\...`이면 URL parser는 앞의 `D:`를 URL scheme으로 취급한다. 결과는 `d:\...`이며 `import.meta.url`의 `file:///D:/...`와 절대 같아질 수 없다. 따라서 `main()`이 호출되지 않고 프로세스가 출력 없이 성공 종료한다.

## 구현 범위

- `openrill.mjs`가 `node:path.resolve`와 `node:url.pathToFileURL`을 사용하도록 변경한다.
- `isDirectExecution(moduleUrl, argv1)`을 export해 guard 자체를 단위 검증 가능하게 한다.
- `process.argv[1]`가 없으면 직접 실행이 아닌 것으로 닫는다.
- 현재 플랫폼에서 canonical file URL round-trip 단위 테스트를 추가한다.
- Windows drive path가 legacy URL constructor에서 `d:` 스킴으로 오분류되는 실패를 acceptance에서 재현한다.
- root CLI version/help/start를 executable boundary에서 다시 검증한다.
- STEP001~STEP001C 전체 regression을 유지한다.
- root와 24개 workspace 버전을 `0.1.4-step001d`로 정규화한다.

## 공개 계약

```text
root executable direct check = module file URL == pathToFileURL(resolve(argv1)).href
missing argv1                = not direct execution
Windows drive letter         = filesystem path, never URL scheme
--version                    = stdout + exit 0
--help                       = stdout + exit 0
start in STEP001             = stderr + exit 2
```

## 상태 전이

```text
STEP001C_UTF8_CAPTURE_FIXED
  → WINDOWS_STEP001_SUITE_PASSED
  → ROOT_CLI_GUARD_SKIPPED_ON_WINDOWS
  → STEP001D_ENTRYPOINT_CANONICALIZED
  → WINDOWS_ACCEPTANCE_RERUN_PENDING
```

## 실패 및 복구

- `argv1` 누락: module import로 취급하고 main을 실행하지 않는다.
- canonical URL 불일치: main을 실행하지 않는다.
- CLI command 자체 실패: 기존 exit code와 출력 계약으로 acceptance 실패한다.
- legacy `new URL(process.argv[1], "file:")` 재도입: STEP001D static gate 실패
- Windows live rerun 실패: STEP002 진입 금지

## Acceptance

정적·결정적 수용:

```bash
python scripts/run_step001d_acceptance.py
```

필수 조건:

- Windows drive path legacy 오분류가 `d:`로 재현됨
- canonical direct check round-trip 통과
- root executable에 legacy URL guard 0개
- version/help/start executable-boundary 검증 통과
- STEP001, STEP001A, STEP001B, STEP001C regression 모두 통과
- package manifest와 fresh ZIP 검증 통과

Windows live:

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step001d
```

## 패키징 산출물

- `openrill-step001d-windows-cli-entrypoint-v1.zip`
- matching SHA-256 file
- regenerated `PACKAGE_MANIFEST.json`
- STEP001D acceptance report

## 제외

- STEP002 Host lifecycle 구현
- CLI argument parser framework 도입
- global npm bin installation
- Windows Service 또는 desktop shell
- UI Runtime 선택
