# STEP009 Approval Interrupt Wrapped as Tool Failure

## Exact symptom

Process Tool이 `ToolApprovalRequiredError`를 던져도 Agent Kernel의 approval branch에 도달하지 못하고 `TOOL_EXECUTION_FAILED`로 변환될 수 있었다.

## Code-confirmed root cause

`packages/tool-runtime/src/index.ts`의 catch가 `ToolRuntimeError` 외 모든 예외를 일반 Tool failure로 wrapping했다. STEP009의 typed approval interrupt는 예외 목록에 없었다.

## Impact

Run이 `WAITING_APPROVAL`이 아니라 `FAILED`가 되고, durable ApprovalRequest가 있어도 UI resolve 후 재개할 수 없었다.

## Fix

Tool Runtime이 `ToolApprovalRequiredError`를 그대로 rethrow하도록 수정했다. Kernel만 이 interrupt를 소비해 usage를 저장하고 `WAITING_APPROVAL`로 전이한다.

## Evidence

STEP009 live fixture가 별도 Host와 Model provider에서 실제 `WAITING_APPROVAL → approval.resolve → COMPLETED`를 검증한다.

## Recurrence-prevention gate

STEP009 acceptance는 Tool Runtime passthrough token, Kernel typed catch, live wait/resume marker를 모두 검사한다.
