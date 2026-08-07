# STEP009 Process Output Stream Completion Race

## Exact symptom

첫 foreground process unit test가 process 종료 후에도 pending Promise로 남았고 Node test runner는 `Promise resolution is still pending but the event loop has already resolved`로 하위 테스트를 취소했다.

## Code-confirmed root cause

`packages/tools-process/src/index.ts`가 child exit를 기다린 뒤 `WriteStream.close` listener를 새로 등록했다. pipe가 listener 등록 전에 stream을 이미 close하면 event를 영원히 놓쳤다.

## Impact

빠르게 종료하는 process가 Tool 호출과 Run 재개를 영구 대기시킬 수 있었다.

## Fix

`node:stream/promises.finished()`를 사용해 stream이 이미 종료된 경우와 이후 종료되는 경우를 동일하게 처리했다.

## Evidence

foreground approval execution, conversation grant second execution, SecretRef execution unit tests가 모두 실제 child process 종료를 통과한다.

## Recurrence-prevention gate

STEP009 acceptance는 `finished(stdoutFile)`/`finished(stderrFile)` 구현과 foreground process unit/live fixture를 검사한다.
