# STEP010 Pre-Kernel Skill Failure State

## Exact symptom

Skill discovery 또는 snapshot capture가 `executeAgentRun` 호출 전에 예외를 던지면 coordinator는 `run.updated FAILED` notice만 발행하고 durable Run/Attempt는 `CREATED`에 남았다.

## Code-confirmed root cause

`AgentRunCoordinator.schedule`의 system-instruction resolver가 Kernel 호출 바깥에 있었고 catch block에는 Conversation ledger transition이 없었다.

## Impact

UI와 SQLite가 서로 다른 terminal 상태를 보이며 재시작 recovery와 후속 작업이 비결정적으로 동작할 수 있었다.

## Fix

resolver 예외를 별도로 잡아 `ConversationService.failExecution`으로 Run과 Attempt를 `FAILED`, terminal reason을 `SKILL_PREPARATION_FAILED`로 기록하고 model/tool usage 0 결과를 반환한다.

## Recurrence-prevention gate

실제 SQLite Conversation fixture가 resolver 실패 후 Run/Attempt `FAILED`, terminal reason, model 미호출을 검사한다.
