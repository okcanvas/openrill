# Conversation And Event Ledger Contract

## Aggregate

`Conversation → Message[] → AgentRun[] → RunAttempt[] → RunEvent[]`

Conversation은 workspace와 model profile에 속한다. Message와 RunEvent는 immutable row이며 순서를 갖는다. Run과 Attempt만 선언된 상태 전이 안에서 갱신된다.

## Message ordering

Message sequence는 conversation별 1부터 시작하는 연속 정수다. `BEGIN IMMEDIATE` transaction 안에서 conversation의 `last_message_sequence`를 증가시키고 같은 transaction에서 message를 삽입한다.

## Submission idempotency

`(conversationId, submissionKey)`는 유일하다. 동일 key와 동일 canonical input은 기존 Message/Run을 반환하고 `replayed=true`가 된다. 다른 input은 `SUBMISSION_CONFLICT`다.

## Run state

- `CREATED → RUNNING | FAILED | CANCELLED`
- `RUNNING → WAITING_APPROVAL | COMPLETED | FAILED | CANCELLED`
- `WAITING_APPROVAL → RUNNING | COMPLETED | FAILED | CANCELLED`
- terminal state는 추가 전이를 허용하지 않는다.

## Event ledger

RunEvent primary order는 `(runId, sequence)`다. `eventId`와 선택적 `idempotencyKey`도 run 안에서 유일하다. caller가 `expectedSequence`를 제공하면 현재 frontier와 정확히 일치해야 한다.

## Recovery

Host startup은 listener 이전에 incomplete Run을 분류한다.

- `WAITING_APPROVAL`은 `RESUMABLE`로 유지한다.
- latest event가 `run.checkpoint`인 `RUNNING`은 `CREATED/RESUMABLE`로 되돌린다.
- checkpoint 없는 `RUNNING`은 `FAILED/NON_RESUMABLE`이다.
- 기존 active Attempt는 `ABORTED`, reason은 `HOST_RESTART`다.
- checkpointed Run을 다시 `RUNNING`으로 전이할 때는 ABORTED Attempt를 재사용하지 않고 증가된 attempt number의 새 Attempt를 만든다.

## Projection

`conversation_projections`는 authority가 아니다. Message/Run ledger에서 언제든 rebuild할 수 있다.
