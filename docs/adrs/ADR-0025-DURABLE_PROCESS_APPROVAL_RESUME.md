# ADR-0025 — Durable Process Approval Resume

## 상태

Accepted for STEP009.

## 문제

process Tool은 Host에서 실제 executable을 시작하므로 file read/write보다 강한 사용자 권한 경계가 필요하다. in-memory prompt나 process-local promise만 사용하면 Host restart, 다중 UI resolve, duplicate request에서 실행 여부를 증명할 수 없다.

## 결정

1. command를 `argv`와 explicit `shell`로 구분한다.
2. execution policy 결과를 `DENY|PROMPT|ALLOW`로 제한한다.
3. PROMPT는 process를 시작하지 않고 `tool_calls`와 `approval_requests`에 binding과 continuation을 먼저 저장한다.
4. Kernel Run과 Attempt를 `WAITING_APPROVAL`로 영속화한다.
5. UI resolve는 expected version을 요구한다.
6. 승인 consume과 Tool status `RUNNING` 전이를 한 SQLite transaction에서 수행한다.
7. consume winner만 process child를 시작한다.
8. Tool result를 Conversation ledger에 idempotently 추가한 뒤 기존 Run을 재개한다.
9. SecretRef는 process 시작 직전에만 실제 값으로 해석한다.
10. background child와 private output은 `process_records`로 추적하고 restart 시 ownership 상실을 `ORPHANED`로 표시한다.

## 결과

- 사용자 승인 전에 side effect가 없다.
- 동일 승인으로 중복 process가 시작되지 않는다.
- Host restart 후 pending request를 다시 표시할 수 있다.
- Model loop와 UI protocol은 process implementation을 직접 알지 않는다.
- SQLite와 private output directory가 lifecycle truth를 소유한다.

## 제외

Docker sandbox, arbitrary remote execution, PTY interactive session, OS-wide process adoption은 STEP009 범위가 아니다.
