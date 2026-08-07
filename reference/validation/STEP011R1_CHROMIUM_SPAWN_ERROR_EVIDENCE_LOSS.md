# STEP011R1 Chromium spawn error evidence loss

## 실제 증상

Windows STEP011R1 browser failure는 다음처럼 출력됐다.

```text
Error: Chromium exited -4058:
```

콜론 뒤의 browser output은 비어 있어 process creation 실패 원인이 보존되지 않았다.

## 코드로 확인한 정확한 원인

기존 `launchBrowser()`는 다음만 수집했다.

```text
child.stdout data
child.stderr data
child.exitCode
```

Node `child_process.spawn()`이 executable을 시작하지 못하면 핵심 증거는 stdout/stderr가 아니라 child의 `error` event에 전달된다. 기존 코드는 이 event를 관찰하지 않았다. 따라서 실행 파일 경로와 OS error code가 acceptance report에서 사라졌다.

## 영향

- ENOENT/EACCES 등 spawn 단계 실패가 일반 `Chromium exited <numeric>`로 축약된다.
- Windows libuv numeric exit 상태만 남아 원인 확인이 늦어진다.
- 실제 browser runtime failure와 executable launch failure를 구분할 수 없다.

## 수정

`captureChildSpawnFailure()`가 child 생성 직후 `error` listener를 등록한다.

보존하는 항목:

```text
stable error code
attempted executable
bounded OS message
```

DevToolsActivePort polling은 `spawnState.failure`를 exitCode보다 먼저 검사한다. Missing executable real-child fixture도 실제 `ENOENT` event를 발생시켜 diagnostic capture를 검증한다.

## 자동 재발 방지

- synthetic formatter test
- 실제 missing child executable `ENOENT` capture test
- live runner `captureChildSpawnFailure` 사용 gate
- `spawnState.failure` 선행 검사 gate
- empty-output-only launch diagnosis 금지 gate
