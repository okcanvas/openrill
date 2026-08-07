# Approval Contract

## 정책 결과

```text
DENY | PROMPT | ALLOW
```

ordered rule matcher는 `toolName`, `commandKind`, `executable`, `workspaceId`를 비교한다. 첫 matching rule이 승리하며 없으면 `defaultDecision`을 사용한다.

## 사용자 결정

```text
allow_once
allow_for_conversation
deny
```

`allow_for_conversation`은 동일 conversation과 정확한 policy fingerprint에만 적용된다. command wildcard나 executable 확대 권한을 자동 생성하지 않는다.

## 상태

```text
PENDING → APPROVED → CONSUMED
        → DENIED
        → EXPIRED
        → CANCELLED
```

`APPROVED`는 실행 완료가 아니다. 실행자는 `requestId + expectedVersion + bindingDigest`를 atomic consume한 뒤에만 Tool을 시작한다.

## Binding

binding digest는 다음을 canonical JSON과 SHA-256으로 결합한다.

- Run/Attempt/Conversation/Workspace identity
- `toolCallId`와 Tool name
- Tool input hash
- Tool schema hash
- command kind, executable, cwd, background 같은 policy subject

승인 후 binding이 달라지면 실행하지 않는다.

## Durable continuation

PROMPT 시 `tool_calls`와 `approval_requests`를 먼저 저장하고 Kernel Run을 `WAITING_APPROVAL`로 전이한다. continuation에는 Secret 값이 아니라 validated Tool input의 SecretRef만 저장한다.

승인·거부·취소·만료 결과는 durable Tool result로 정확히 한 번 Conversation에 추가된다. 동일 Run은 기존 attempt, usage, model invocation sequence와 completed Tool results를 복원해 다음 Model turn으로 재개한다.

## Protocol

```text
approval.list
approval.get
approval.resolve
approval.cancel
```

resolve 입력은 `requestId`, `expectedVersion`, `decision`이다. 동시 resolve는 SQLite version predicate로 한 호출만 상태를 변경한다. 동일 결정 replay는 기존 상태를 반환하며 다른 결정은 conflict다.
