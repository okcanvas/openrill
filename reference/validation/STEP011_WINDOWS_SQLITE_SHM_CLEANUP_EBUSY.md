# STEP011 Windows SQLite SHM cleanup EBUSY

## 실제 실패

```text
[PASS] build-unit-architecture-exports :: suite_pass
[FAIL] step011-real-chromium-live ::
Error: EBUSY: resource busy or locked, unlink
C:\Users\User\AppData\Local\Temp\openrill-step011-live-...\data\live\state\agent.db-shm
STEP011_CONTROL_UI_VERTICAL_SLICE checks=194/195 state=FAILED
```

Exact Vue 3.5.40 acquisition, runtime/hash/license/re-extraction, canonical suite와 STEP010 Skill regression은 모두 통과했다. 유일한 실패는 real Chromium live fixture의 최종 temp-root cleanup이었다.

## 코드 확인

실패한 runner는 다음 순서였다.

```text
Chromium cdp.close()
→ browser.kill() 호출만 수행
→ Host stop command와 Host exit wait
→ DatabaseSync(readOnly) ledger query
→ db.close()
→ success marker 작성
→ finally에서 provider.close()
→ rm(root, recursive=true, force=true) 단일 시도
```

`fs.rm`에 retry 계약이 없었으므로 Windows가 `agent.db-shm` handle release를 잠시 지연하면 첫 `unlink`의 `EBUSY`가 전체 live process exit 1이 되었다.

## 영향

- Conversation/Approval/process/Artifact/reconnect/mobile 기능이 모두 성공했어도 STEP011을 실패로 판정한다.
- Windows host scheduling과 filesystem handle release timing에 따라 비결정적이다.
- temp root는 OS 임시 디렉터리 아래에 남을 수 있다.

## 수정

`scripts/live-fixture-cleanup.mjs`를 추가했다.

- Chromium/Host child 종료 후 실제 `exit` event bounded wait
- timeout 시 bounded hard termination
- `EBUSY`, `EPERM`, `ENOTEMPTY`만 최대 40회, 100ms 선형 delay로 retry
- `EACCES` 등 non-transient error는 즉시 전파
- provider close callback 완료 wait

`run-step011-live.mjs`는 normal path와 `finally` 모두 동일 helper를 사용한다.

## 자동 재발 방지

`tests/unit/live-fixture-cleanup-step011r1.test.mjs`는 injected remove function으로 다음을 검증한다.

1. `EBUSY` 두 번 후 세 번째 성공
2. recursive/force option 유지
3. delay `100%`가 아니라 exact configured linear sequence
4. non-transient error one-shot failure
5. child exit event wait
6. server close completion wait

STEP011R1 acceptance는 helper source, unit marker, STEP011 full browser regression을 모두 검사한다.
