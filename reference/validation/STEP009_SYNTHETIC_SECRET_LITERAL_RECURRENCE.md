# STEP009 Synthetic Secret Literal Recurrence

## Exact symptom

Deterministic ZIP 두 개는 바이트 단위로 동일했지만 source text 정밀 검사에서 고정된 STEP009 test-secret prefix와 두 개의 credential assignment marker가 발견되었다. 실제 자격증명 값은 아니었으나, source ZIP에 재사용 가능한 credential-shaped literal을 남기지 않는 STEP008 재발 방지 원칙을 다시 위반했다.

## Code-confirmed root cause

`tests/unit/process-approval-step009.test.mjs`가 SecretRef 비저장 검사를 위해 시간값이 붙는 고정 prefix를 만들었다. `scripts/run_step009_acceptance.py`는 report 금지 검사를 특정 환경변수 assignment 문자열 자체로 표현해 그 marker가 acceptance source에 포함되었다. 기존 recurrence gate는 live fixture의 static assignment만 검사했고 unit fixture와 gate source 자체는 검사하지 않았다.

## Impact

실제 credential leakage는 없었지만 배포 ZIP의 source literal zero 선언을 문자 그대로 충족하지 못했다. 같은 패턴을 실제 예제나 문서에서 복사하면 운영 자격증명 형태가 source에 정착할 위험이 있다.

## Fix

Unit fixture secret은 `randomBytes(32)`로 실행 시 생성하고 child는 값의 길이만 확인한다. Acceptance report 검사는 credential-shaped assignment를 generic regular expression으로 탐지한다. 전체 included source text에는 분리 구성한 forbidden fragments를 적용해 gate 구현 자체가 금지 문자열을 다시 포함하지 않도록 했다.

## Evidence

수정 전 ZIP 검사 결과는 `secret_literals=3`이었다. 수정 후 unit suite는 `95/95`, STEP009 source와 fresh-ZIP acceptance는 각각 `217/217 PASSED`다. 최종 ZIP은 471개 파일이며 금지 runtime/protected 파일 0, 세 credential-shaped byte sequence 0으로 검사됐다.

## Recurrence-prevention gate

모든 live/unit synthetic secret은 cryptographic runtime generation을 사용해야 한다. Acceptance는 source, report, final ZIP에서 고정 test-secret prefix와 credential assignment marker가 0인지 자동 검사한다.
