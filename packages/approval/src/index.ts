import { createHash, randomUUID } from "node:crypto";
import type { OpenRillStateDatabase, LedgerApprovalDecision, LedgerApprovalRequestRow, LedgerToolCallRow } from "@openrill/state";

export const PACKAGE_NAME = "@openrill/approval" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "APPROVAL" as const;

export type ExecutionPolicyDecision = "DENY" | "PROMPT" | "ALLOW";
export type ApprovalDecision = LedgerApprovalDecision;
export type ApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "CONSUMED" | "CANCELLED";

export interface ExecutionPolicyRule {
  readonly decision: ExecutionPolicyDecision;
  readonly toolName?: string;
  readonly commandKind?: "argv" | "shell";
  readonly executable?: string;
  readonly workspaceId?: string;
}
export interface ExecutionPolicy {
  readonly defaultDecision: ExecutionPolicyDecision;
  readonly rules?: readonly ExecutionPolicyRule[];
}
export interface ApprovalBindingInput {
  readonly runId: string; readonly attemptId: string; readonly conversationId: string; readonly workspaceId: string;
  readonly toolCallId: string; readonly toolName: string; readonly input: Readonly<Record<string, unknown>>;
  readonly toolSchema: Readonly<Record<string, unknown>>; readonly policySubject: Readonly<Record<string, unknown>>;
}
export interface ApprovalRequestView {
  readonly requestId: string; readonly version: number; readonly runId: string; readonly conversationId: string;
  readonly workspaceId: string; readonly toolCallId: string; readonly toolName: string; readonly bindingDigest: string;
  readonly policyFingerprint: string; readonly status: ApprovalStatus; readonly decision: ApprovalDecision | null;
  readonly summary: unknown; readonly expiresAt: number; readonly createdAt: number; readonly updatedAt: number;
}
export interface ApprovalResolveResult { readonly request: ApprovalRequestView; readonly replayed: boolean; }

export type ApprovalErrorCode = "APPROVAL_NOT_FOUND" | "APPROVAL_VERSION_CONFLICT" | "APPROVAL_STATE_INVALID" | "APPROVAL_BINDING_MISMATCH" | "APPROVAL_TOOL_CALL_CONFLICT";
export class ApprovalError extends Error {
  public constructor(public readonly code: ApprovalErrorCode, message: string) { super(message); this.name = "ApprovalError"; }
}
export class ToolApprovalRequiredError extends Error {
  public constructor(public readonly request: ApprovalRequestView) { super(`approval required: ${request.requestId}`); this.name = "ToolApprovalRequiredError"; }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}
export function approvalSha256(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }

export function matchExecutionPolicy(policy: ExecutionPolicy, subject: { readonly toolName: string; readonly commandKind?: "argv" | "shell"; readonly executable?: string; readonly workspaceId: string }): { readonly decision: ExecutionPolicyDecision; readonly fingerprint: string } {
  const rule = policy.rules?.find((candidate) =>
    (candidate.toolName === undefined || candidate.toolName === subject.toolName)
    && (candidate.commandKind === undefined || candidate.commandKind === subject.commandKind)
    && (candidate.executable === undefined || candidate.executable === subject.executable)
    && (candidate.workspaceId === undefined || candidate.workspaceId === subject.workspaceId));
  const decision = rule?.decision ?? policy.defaultDecision;
  return { decision, fingerprint: approvalSha256({ decision, subject, rule: rule ?? null }) };
}
function view(row: LedgerApprovalRequestRow): ApprovalRequestView {
  return {
    requestId: row.requestId, version: row.version, runId: row.runId, conversationId: row.conversationId,
    workspaceId: row.workspaceId, toolCallId: row.toolCallId, toolName: row.toolName, bindingDigest: row.bindingDigest,
    policyFingerprint: row.policyFingerprint, status: row.status, decision: row.decision, summary: row.summary,
    expiresAt: row.expiresAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

export interface ApprovalServiceOptions { readonly state: OpenRillStateDatabase; readonly now?: () => number; readonly createId?: () => string; readonly timeoutMs?: number; }
export class ApprovalService {
  readonly #now: () => number; readonly #createId: () => string; readonly #timeoutMs: number;
  public constructor(private readonly options: ApprovalServiceOptions) {
    this.#now = options.now ?? Date.now; this.#createId = options.createId ?? randomUUID; this.#timeoutMs = options.timeoutMs ?? 120_000;
  }

  public authorizeOrRequest(input: ApprovalBindingInput & { readonly policy: ExecutionPolicy; readonly summary: unknown; readonly continuation: unknown }):
    | { readonly decision: "ALLOW"; readonly bindingDigest: string; readonly policyFingerprint: string; readonly toolExecutionId: string; readonly grantedByConversation: boolean }
    | { readonly decision: "DENY"; readonly bindingDigest: string; readonly policyFingerprint: string; readonly toolExecutionId: string }
    | { readonly decision: "PROMPT"; readonly request: ApprovalRequestView; readonly toolExecutionId: string } {
    const inputHash = approvalSha256(input.input); const schemaHash = approvalSha256(input.toolSchema);
    const commandKind = input.policySubject.commandKind === "argv" || input.policySubject.commandKind === "shell" ? input.policySubject.commandKind : undefined;
    const executable = typeof input.policySubject.executable === "string" ? input.policySubject.executable : undefined;
    const policy = matchExecutionPolicy(input.policy, {
      toolName: input.toolName,
      workspaceId: input.workspaceId,
      ...(commandKind !== undefined ? { commandKind } : {}),
      ...(executable !== undefined ? { executable } : {}),
    });
    const bindingDigest = approvalSha256({ runId: input.runId, attemptId: input.attemptId, conversationId: input.conversationId, workspaceId: input.workspaceId, toolCallId: input.toolCallId, toolName: input.toolName, inputHash, schemaHash, policySubject: input.policySubject });
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const existing = repositories.approvalProcess.getToolCall(input.runId, input.toolCallId);
      if (existing) {
        if (existing.bindingDigest !== bindingDigest) throw new ApprovalError("APPROVAL_TOOL_CALL_CONFLICT", "tool call id reused with different approval binding");
        const approval = repositories.approvalProcess.getApprovalByToolExecution(existing.toolExecutionId);
        if (approval?.status === "PENDING") return { decision: "PROMPT" as const, request: view(approval), toolExecutionId: existing.toolExecutionId };
        if (existing.status === "RUNNING" || existing.status === "COMPLETED") return { decision: "ALLOW" as const, bindingDigest, policyFingerprint: policy.fingerprint, toolExecutionId: existing.toolExecutionId, grantedByConversation: false };
      }
      const toolExecutionId = existing?.toolExecutionId ?? this.#createId();
      const granted = repositories.approvalProcess.hasConversationGrant(input.conversationId, policy.fingerprint);
      const effective = granted ? "ALLOW" : policy.decision;
      if (!existing) {
        repositories.approvalProcess.insertToolCall({
          toolExecutionId, runId: input.runId, attemptId: input.attemptId, conversationId: input.conversationId,
          workspaceId: input.workspaceId, toolCallId: input.toolCallId, toolName: input.toolName, input: input.input,
          inputHash, schemaHash, bindingDigest, status: effective === "PROMPT" ? "PENDING_APPROVAL" : effective === "DENY" ? "DENIED" : "APPROVED",
          result: null, errorCode: effective === "DENY" ? "PROCESS_POLICY_DENIED" : null, createdAt: now, updatedAt: now,
        });
      }
      if (effective === "ALLOW") return { decision: "ALLOW" as const, bindingDigest, policyFingerprint: policy.fingerprint, toolExecutionId, grantedByConversation: granted };
      if (effective === "DENY") return { decision: "DENY" as const, bindingDigest, policyFingerprint: policy.fingerprint, toolExecutionId };
      const request: LedgerApprovalRequestRow = {
        requestId: this.#createId(), version: 1, toolExecutionId, runId: input.runId, attemptId: input.attemptId,
        conversationId: input.conversationId, workspaceId: input.workspaceId, toolCallId: input.toolCallId, toolName: input.toolName,
        bindingDigest, policyFingerprint: policy.fingerprint, status: "PENDING", decision: null,
        summary: input.summary, continuation: input.continuation, expiresAt: now + this.#timeoutMs,
        resolvedAt: null, consumedAt: null, createdAt: now, updatedAt: now,
      };
      repositories.approvalProcess.insertApproval(request);
      return { decision: "PROMPT" as const, request: view(request), toolExecutionId };
    });
  }

  public get(requestId: string): ApprovalRequestView {
    return this.options.state.transaction((repositories) => { const row = repositories.approvalProcess.getApproval(requestId); if (!row) throw new ApprovalError("APPROVAL_NOT_FOUND", "approval request not found"); return view(row); });
  }
  public list(status?: ApprovalStatus): ApprovalRequestView[] {
    this.expirePending();
    return this.options.state.transaction((repositories) => repositories.approvalProcess.listApprovals(status).map(view));
  }
  public resolve(input: { readonly requestId: string; readonly expectedVersion: number; readonly decision: ApprovalDecision }): ApprovalResolveResult {
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const row = repositories.approvalProcess.getApproval(input.requestId); if (!row) throw new ApprovalError("APPROVAL_NOT_FOUND", "approval request not found");
      if (row.status !== "PENDING") {
        if (row.decision === input.decision && (row.status === "APPROVED" || row.status === "DENIED" || row.status === "CONSUMED")) return { request: view(row), replayed: true };
        throw new ApprovalError("APPROVAL_STATE_INVALID", `approval is not pending: ${row.status}`);
      }
      if (row.expiresAt <= now) { repositories.approvalProcess.markApprovalTerminal({ requestId: row.requestId, status: "EXPIRED", updatedAt: now }); repositories.approvalProcess.updateToolCall({ toolExecutionId: row.toolExecutionId, status: "CANCELLED", errorCode: "APPROVAL_EXPIRED", updatedAt: now }); throw new ApprovalError("APPROVAL_STATE_INVALID", "approval request expired"); }
      if (row.version !== input.expectedVersion) throw new ApprovalError("APPROVAL_VERSION_CONFLICT", "approval version conflict");
      const status = input.decision === "deny" ? "DENIED" : "APPROVED";
      if (!repositories.approvalProcess.resolveApproval({ requestId: row.requestId, expectedVersion: input.expectedVersion, status, decision: input.decision, resolvedAt: now })) throw new ApprovalError("APPROVAL_VERSION_CONFLICT", "approval was resolved concurrently");
      repositories.approvalProcess.updateToolCall({ toolExecutionId: row.toolExecutionId, status: input.decision === "deny" ? "DENIED" : "APPROVED", errorCode: input.decision === "deny" ? "APPROVAL_DENIED" : null, updatedAt: now });
      if (input.decision === "allow_for_conversation") repositories.approvalProcess.insertConversationGrant({ conversationId: row.conversationId, policyFingerprint: row.policyFingerprint, requestId: row.requestId, createdAt: now });
      return { request: view(repositories.approvalProcess.getApproval(row.requestId)!), replayed: false };
    });
  }
  public consume(input: { readonly requestId: string; readonly expectedVersion: number; readonly bindingDigest: string }): { readonly request: ApprovalRequestView; readonly toolCall: LedgerToolCallRow; readonly continuation: unknown } {
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const row = repositories.approvalProcess.getApproval(input.requestId); if (!row) throw new ApprovalError("APPROVAL_NOT_FOUND", "approval request not found");
      if (row.bindingDigest !== input.bindingDigest) throw new ApprovalError("APPROVAL_BINDING_MISMATCH", "approval binding changed before execution");
      if (row.status === "CONSUMED") throw new ApprovalError("APPROVAL_STATE_INVALID", "approval has already been consumed");
      if (row.status !== "APPROVED") throw new ApprovalError("APPROVAL_STATE_INVALID", `approval is not executable: ${row.status}`);
      if (!repositories.approvalProcess.consumeApproval({ requestId: row.requestId, expectedVersion: input.expectedVersion, bindingDigest: input.bindingDigest, consumedAt: now })) throw new ApprovalError("APPROVAL_VERSION_CONFLICT", "approval consume conflict");
      repositories.approvalProcess.updateToolCall({ toolExecutionId: row.toolExecutionId, status: "RUNNING", errorCode: null, updatedAt: now });
      return { request: view(repositories.approvalProcess.getApproval(row.requestId)!), toolCall: repositories.approvalProcess.getToolCallByExecutionId(row.toolExecutionId)!, continuation: row.continuation };
    });
  }
  public beginAllowedToolCall(toolExecutionId: string): void {
    const now = this.#now();
    this.options.state.transaction((repositories) => {
      const row = repositories.approvalProcess.getToolCallByExecutionId(toolExecutionId);
      if (!row) throw new ApprovalError("APPROVAL_NOT_FOUND", "tool call not found");
      if (row.status === "RUNNING") return;
      if (row.status !== "APPROVED") throw new ApprovalError("APPROVAL_STATE_INVALID", `tool call is not allowed: ${row.status}`);
      repositories.approvalProcess.updateToolCall({ toolExecutionId, status: "RUNNING", errorCode: null, updatedAt: now });
    });
  }

  public completeToolCall(toolExecutionId: string, result: unknown, isError: boolean, errorCode?: string | null): void {
    const now = this.#now();
    this.options.state.transaction((repositories) => repositories.approvalProcess.updateToolCall({ toolExecutionId, status: isError ? "FAILED" : "COMPLETED", result, errorCode: errorCode ?? null, updatedAt: now }));
  }
  public recordApprovalTerminalResult(requestId: string, status: "DENIED" | "CANCELLED", result: unknown, errorCode: string): ApprovalRequestView {
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const row = repositories.approvalProcess.getApproval(requestId);
      if (!row) throw new ApprovalError("APPROVAL_NOT_FOUND", "approval request not found");
      repositories.approvalProcess.updateToolCall({ toolExecutionId: row.toolExecutionId, status, result, errorCode, updatedAt: now });
      return view(row);
    });
  }
  public cancelRun(runId: string): ApprovalRequestView[] {
    const pending = this.list("PENDING").filter((request) => request.runId === runId);
    return pending.map((request) => this.cancel(request.requestId));
  }

  public cancel(requestId: string): ApprovalRequestView {
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const row = repositories.approvalProcess.getApproval(requestId); if (!row) throw new ApprovalError("APPROVAL_NOT_FOUND", "approval request not found");
      if (row.status === "PENDING") { repositories.approvalProcess.markApprovalTerminal({ requestId, status: "CANCELLED", updatedAt: now }); repositories.approvalProcess.updateToolCall({ toolExecutionId: row.toolExecutionId, status: "CANCELLED", errorCode: "APPROVAL_CANCELLED", updatedAt: now }); }
      return view(repositories.approvalProcess.getApproval(requestId)!);
    });
  }
  public expirePending(): string[] {
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const ids = repositories.approvalProcess.expirePending(now);
      for (const id of ids) { const row = repositories.approvalProcess.getApproval(id); if (row) repositories.approvalProcess.updateToolCall({ toolExecutionId: row.toolExecutionId, status: "CANCELLED", errorCode: "APPROVAL_EXPIRED", updatedAt: now }); }
      return ids;
    });
  }
}

export function getPackageIdentity() { return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const; }
