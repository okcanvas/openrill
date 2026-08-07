# STEP012C Windows historical browser runtime ownership failure

## 실제 명령

```cmd
pnpm acceptance:step012c
```

## 실제 증상

STEP012C의 focused integration과 canonical suite는 통과했지만 nested STEP012BR1이 다음 marker로 실패했다.

```text
STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP checks=186/187 state=FAILED schema=9 ... browser_regression=CHROMIUM prerequisite=runtime_unavailable
STEP012C_AUTOMATION_PROTOCOL_AND_CONVERSATION_RUN_INTEGRATION checks=169/170 state=FAILED schema=9 ... browser_regression=CHROMIUM
```

## 코드로 확정한 원인

`run_step012c_acceptance.py`는 backend-only STEP012C 검증 후 historical STEP012BR1 전체 acceptance를 다시 실행한다. 그 chain은 STEP012B → STEP012AR1 → STEP011까지 내려가며, `run_step011_acceptance.py`는 매 실행마다 exact Vue 3.5.40 npm tarball을 외부 네트워크에서 새로 획득한다.

STEP012BR1 대비 STEP012C의 브라우저 surface를 SHA-256으로 비교한 결과 다음 파일은 바이트 단위로 동일하다 (`byte-identical`).

- `apps/agent-web/src/browser-app.ts`
- `apps/agent-web/src/control-ui-projection.ts`
- `apps/agent-web/src/api/local-protocol-client.ts`
- `apps/agent-web/public/index.html`
- `apps/agent-web/public/assets/app.css`
- `apps/agent-web/public/assets/favicon.svg`

`run-step011-live.mjs`의 유일한 의미 변화는 schema 8 literal을 `OPENRILL_STATE_SCHEMA_VERSION` owner로 교체한 두 줄이다. 이 변경을 역정규화한 SHA-256은 accepted STEP012BR1 script SHA와 정확히 동일하다. STEP011 live config에는 Automation enablement가 없으므로 STEP012C production Automation executor는 이 historical browser fixture에서 비활성 경로다.

따라서 실패는 current STEP012C browser 제품 회귀가 아니라, UI를 변경하지 않은 backend release가 이미 Windows-live accepted된 browser acceptance를 외부 prerequisite와 함께 반복 소유한 validation defect다.

## 영향

- Protocol/Conversation integration 5/5와 canonical 206/206이 성공해도 외부 Vue 획득 상태에 따라 release가 실패한다.
- 같은 source ZIP이 네트워크 상태에 따라 PASS/FAIL할 수 있다.
- 실제 browser 변경이 없는 STEP012C와 browser 변경을 소유할 STEP012D의 acceptance 책임이 혼재한다.
- `runtime_unavailable`은 제품 결함 위치를 가리지 않지만, 불필요한 historical re-execution 자체를 제거하지 못한다.

## 수정

`STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP`은 다음 계약을 적용한다.

1. accepted STEP012BR1 ZIP SHA와 exact Windows 187/187 marker를 immutable evidence로 검증한다.
2. accepted browser surface SHA manifest와 current files를 비교한다.
3. current STEP011 live script를 schema-owner delta만 제거해 accepted SHA와 비교한다.
4. current canonical suite와 STEP012A/B/C focused integration을 모두 실행한다.
5. historical STEP012C acceptance는 `OPENRILL_BROWSER_REGRESSION_MODE=accepted-no-impact`에서 external Vue/Chromium chain을 재실행하지 않는다.
6. marker는 실제 Chromium 재실행을 주장하지 않고 `browser_regression=ACCEPTED_BASELINE_NO_IMPACT`로 명시한다.
7. UI와 Automation browser vertical slice를 변경하는 STEP012D는 actual Chromium을 다시 단독 소유한다.

## 수정 전 재현

수정 전 STEP012C source에서 다음이 동시에 참이다.

- `run_step012c_acceptance.py`가 `run_step012br1_acceptance.py`를 unconditional 실행한다.
- nested historical chain이 `run_step011_acceptance.py`까지 내려간다.
- STEP011 runner가 archive override가 없으면 `--download`를 사용한다.
- STEP012C browser-owned files는 accepted STEP012BR1과 동일하다.

이 조합은 현재 변경과 무관한 external runtime acquisition을 release PASS의 필수 조건으로 만든다.

## 자동 recurrence-prevention gate

- accepted browser surface six-file hash gate
- normalized STEP011 live script accepted-hash gate
- STEP011 live Automation reference zero gate
- delegated mode marker honesty gate
- default direct STEP012C mode retains actual Chromium path gate
- STEP012D actual browser ownership documentation gate
- historical browser no-impact focused test
