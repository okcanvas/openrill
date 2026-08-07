# OpenClaw Process Tool and Approval Resume Evidence

분석 대상은 별도 제공된 `openclaw-main.zip`의 실제 코드다. OpenRill은 코드를 복사하거나 dependency로 사용하지 않고 경계와 실패 의미만 검토했다.

## 확인한 코드

- `OC-APPROVAL-001` — `src/infra/exec-approvals-core.ts:9`: execution security가 제한된 union이다.
- `OC-APPROVAL-002` — `src/infra/exec-approvals-core.ts:10`: ask 정책이 제한된 union이다.
- `OC-APPROVAL-003` — `src/infra/exec-approvals-core.ts:12`: operator decision이 제한된다.
- `OC-APPROVAL-004` — `src/gateway/exec-approval-manager.ts:221`: approval lifecycle 전담 manager가 있다.
- `OC-APPROVAL-005` — `src/gateway/exec-approval-manager.ts:833`: expiry timer scheduling이 manager 내부 책임이다.

## 채택

- policy와 decision을 closed value set으로 제한
- approval registration을 execution보다 먼저 완료
- duplicate pending registration의 idempotency
- explicit expiration lifecycle
- reviewer presentation과 durable record의 결합

## OpenRill식 재설계

OpenRill은 process-local promise를 실행 truth로 사용하지 않는다. SQLite `approval_requests`와 `tool_calls`가 truth이며, `expectedVersion + bindingDigest + consume`가 정확히 한 번 실행 경계를 만든다. Run은 terminal failure 대신 `WAITING_APPROVAL`로 유지되고 durable Tool result가 들어온 뒤 같은 attempt를 재개한다.

## 배제

- OpenClaw protocol/package/UI compatibility
- source import 또는 package dependency
- device/reviewer routing 구조의 복제
- global allowlist 자동 확대
