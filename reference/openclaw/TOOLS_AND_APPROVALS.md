# Tools and Approvals

관찰: security/ask/decision 타입과 approval manager가 존재한다: `[OC-APPROVAL-001] src/infra/exec-approvals-core.ts:9`~`[OC-APPROVAL-004] src/gateway/exec-approval-manager.ts:221`.

채택: policy gate, durable interrupt/resume, binding, expiry, idempotent resolution.

변경: OpenRill 정책 값은 DENY/PROMPT/ALLOW이고 scope grant도 별도 계약이다.
