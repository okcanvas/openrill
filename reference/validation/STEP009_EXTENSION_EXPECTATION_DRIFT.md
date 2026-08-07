# STEP009 Extension Expectation Drift

## Exact symptom

schema 6 migration 후 기존 전체 unit suite는 `6 !== 5`로 실패했고, protocol test는 새 `approval.*` capability 네 개 때문에 exact list comparison이 실패했다. 이어서 STEP008 live fixture는 Host가 기존 여섯 Workspace Tool 외에 STEP009 Process Tool 네 개를 정상 등록하자 `unexpected tools`로 Run을 실패시켰다.

## Code-confirmed root cause

`tests/unit/workspace-file-tools-step008.test.mjs`가 현재 schema를 5로 하드코딩했고 `tests/unit/local-protocol-step004.test.mjs`가 이전 단계 capability set을 고정했다. `scripts/run-step008-live.mjs`도 provider request의 Tool 목록을 STEP008 여섯 개와 정확히 같다고 가정해 additive Tool 등록을 제품 결함으로 오판했다.

## Impact

정상적인 additive schema, protocol, Tool surface 확장을 이전 STEP 회귀 gate가 제품 회귀로 오판했다. 이 상태에서는 새 기능이 기존 Workspace 동작을 보존해도 후속 STEP이 진행될 수 없다.

## Fix

Workspace ledger test는 `OPENRILL_STATE_SCHEMA_VERSION`을 사용한다. Protocol test는 STEP009 public operation set을 명시적으로 갱신했다. STEP008 live fixture는 여섯 Workspace Tool의 존재와 정확한 schema를 계속 검증하되, 현재 제품이 추가 등록한 Process Tool 네 개를 허용한다. STEP009 acceptance는 schema-derived assertion, approval capability, 정확한 Process Tool 등록을 각각 독립 검사한다.

## Evidence

수정 전 기존 전체 suite는 81/83이었다. schema/protocol 기대값 수정 후 83/83, STEP009 테스트 추가 후 95/95다. STEP008 live regression은 Tool surface 기대값 수정 전 Run FAILED, 수정 후 `OPENRILL_STEP008_LIVE_PASS schema=6 ...`를 반환했다.

## Recurrence-prevention gate

현재 schema assertion은 exported constant에서 계산해야 한다. additive public operation과 Tool surface는 이전 기능의 필수 subset/schema를 검증하고, 후속 STEP의 새 capability/Tool은 현재 STEP acceptance에서 별도로 정확히 검증한다.
