# STEP011 cleanup error can mask primary failure

## 문제

기존 STEP011 live runner는 본문 `try` 뒤 `finally`에서 다음 작업을 직접 실행했다.

```text
browser.kill()
host.child.kill()
provider.close()
rm(tempRoot)
```

JavaScript에서는 `finally`에서 새 예외가 발생하면 이미 발생한 본문 예외를 대체한다. 따라서 browser assertion, ledger mismatch 또는 provider boundary 실패가 먼저 발생했더라도 마지막 `rm()`의 `EBUSY`만 외부에 보일 수 있었다.

실제 Windows 로그는 `agent.db-shm` cleanup 예외만 남겼다. 그 실행에서 앞선 기능 assertion이 실패했다고 주장할 근거는 없지만, 기존 코드가 원인 증거를 덮을 수 있다는 것은 제어 흐름으로 확정된다.

## 영향

- 최초 실패 지점과 assertion이 사라질 수 있다.
- cleanup 결함을 제품 기능 결함으로 오인하거나 반대로 기능 결함을 놓칠 수 있다.
- 추측 금지 원칙에 필요한 원문 증거가 손실된다.

## 수정

```text
catch(error)
→ primaryFailure 저장
→ 동일 error 재throw

finally
→ 각 cleanup 작업의 실패를 배열에 수집
→ primaryFailure가 있으면 cleanup failure를 bounded marker로만 기록
→ primaryFailure가 없으면 AggregateError로 cleanup failure를 실패 처리
```

따라서 본문 성공 후 cleanup 실패는 여전히 acceptance 실패이며, 본문 실패가 있으면 그 원래 예외가 유지된다.

## 자동 재발 방지

STEP011R1 acceptance는 다음 source contract를 검사한다.

- `primaryFailure` capture
- `cleanupFailures` aggregation
- `OPENRILL_STEP011_CLEANUP_AFTER_FAILURE` marker
- primary failure 존재 시 cleanup AggregateError 미발생
- temp-root one-shot `rm` 제거
- browser/Host unawaited `kill()` 제거

상세 runtime helper 동작은 `live-fixture-cleanup-step011r1.test.mjs`가 검증한다.
