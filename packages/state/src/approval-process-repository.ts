import type { DatabaseSync } from "node:sqlite";
import { StateDatabaseError } from "./errors.js";

export type LedgerToolCallStatus = "PENDING_APPROVAL" | "APPROVED" | "RUNNING" | "COMPLETED" | "FAILED" | "DENIED" | "CANCELLED";
export type LedgerApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "CONSUMED" | "CANCELLED";
export type LedgerApprovalDecision = "allow_once" | "allow_for_conversation" | "deny";
export type LedgerProcessStatus = "STARTING" | "RUNNING" | "EXITED" | "FAILED_TO_START" | "CANCELLED" | "ORPHANED";

export interface LedgerToolCallRow {
  readonly toolExecutionId: string; readonly runId: string; readonly attemptId: string;
  readonly conversationId: string; readonly workspaceId: string; readonly toolCallId: string;
  readonly toolName: string; readonly input: unknown; readonly inputHash: string;
  readonly schemaHash: string; readonly bindingDigest: string; readonly status: LedgerToolCallStatus;
  readonly result: unknown | null; readonly errorCode: string | null; readonly createdAt: number; readonly updatedAt: number;
}
export interface LedgerApprovalRequestRow {
  readonly requestId: string; readonly version: number; readonly toolExecutionId: string;
  readonly runId: string; readonly attemptId: string; readonly conversationId: string; readonly workspaceId: string;
  readonly toolCallId: string; readonly toolName: string; readonly bindingDigest: string; readonly policyFingerprint: string;
  readonly status: LedgerApprovalStatus; readonly decision: LedgerApprovalDecision | null;
  readonly summary: unknown; readonly continuation: unknown; readonly expiresAt: number;
  readonly resolvedAt: number | null; readonly consumedAt: number | null; readonly createdAt: number; readonly updatedAt: number;
}
export interface LedgerProcessRecordRow {
  readonly processId: string; readonly toolExecutionId: string; readonly runId: string; readonly attemptId: string;
  readonly workspaceId: string; readonly toolCallId: string; readonly mode: "FOREGROUND" | "BACKGROUND";
  readonly commandKind: "ARGV" | "SHELL"; readonly commandDisplay: string; readonly cwdRelative: string;
  readonly status: LedgerProcessStatus; readonly pid: number | null; readonly stdoutPath: string; readonly stderrPath: string;
  readonly backendKind: "HOST" | "DOCKER"; readonly backendHandleId: string | null; readonly sandboxed: boolean;
  readonly confinement: unknown | null; readonly exitCode: number | null; readonly exitSignal: string | null;
  readonly startedAt: number | null; readonly endedAt: number | null; readonly updatedAt: number;
}

function parseJson(raw: string | null, label: string): unknown | null {
  if (raw === null) return null;
  try { return JSON.parse(raw); }
  catch { throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `${label} is invalid JSON`); }
}
function toolCall(row: any): LedgerToolCallRow {
  return { ...row, input: parseJson(row.inputJson, "tool_calls.input_json"), result: parseJson(row.resultJson, "tool_calls.result_json") };
}
function approval(row: any): LedgerApprovalRequestRow {
  return { ...row, summary: parseJson(row.summaryJson, "approval_requests.summary_json"), continuation: parseJson(row.continuationJson, "approval_requests.continuation_json") };
}
function processRow(row: any): LedgerProcessRecordRow { return { ...row, sandboxed: row.sandboxed === 1, confinement: parseJson(row.confinementJson, "process_records.confinement_json") }; }

const TOOL_SELECT = `SELECT tool_execution_id toolExecutionId,run_id runId,attempt_id attemptId,conversation_id conversationId,workspace_id workspaceId,tool_call_id toolCallId,tool_name toolName,input_json inputJson,input_hash inputHash,schema_hash schemaHash,binding_digest bindingDigest,status,result_json resultJson,error_code errorCode,created_at createdAt,updated_at updatedAt FROM tool_calls`;
const APPROVAL_SELECT = `SELECT request_id requestId,version,tool_execution_id toolExecutionId,run_id runId,attempt_id attemptId,conversation_id conversationId,workspace_id workspaceId,tool_call_id toolCallId,tool_name toolName,binding_digest bindingDigest,policy_fingerprint policyFingerprint,status,decision,summary_json summaryJson,continuation_json continuationJson,expires_at expiresAt,resolved_at resolvedAt,consumed_at consumedAt,created_at createdAt,updated_at updatedAt FROM approval_requests`;
const PROCESS_SELECT = `SELECT process_id processId,tool_execution_id toolExecutionId,run_id runId,attempt_id attemptId,workspace_id workspaceId,tool_call_id toolCallId,mode,command_kind commandKind,command_display commandDisplay,cwd_relative cwdRelative,status,pid,stdout_path stdoutPath,stderr_path stderrPath,backend_kind backendKind,backend_handle_id backendHandleId,sandboxed,confinement_json confinementJson,exit_code exitCode,exit_signal exitSignal,started_at startedAt,ended_at endedAt,updated_at updatedAt FROM process_records`;

export class StateApprovalProcessRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public insertToolCall(row: LedgerToolCallRow): LedgerToolCallRow {
    const inputJson = JSON.stringify(row.input); if (inputJson === undefined) throw new TypeError("tool call input must be JSON serializable");
    const resultJson = row.result === null ? null : JSON.stringify(row.result);
    this.db.prepare(`INSERT INTO tool_calls (tool_execution_id,run_id,attempt_id,conversation_id,workspace_id,tool_call_id,tool_name,input_json,input_hash,schema_hash,binding_digest,status,result_json,error_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      row.toolExecutionId,row.runId,row.attemptId,row.conversationId,row.workspaceId,row.toolCallId,row.toolName,inputJson,row.inputHash,row.schemaHash,row.bindingDigest,row.status,resultJson,row.errorCode,row.createdAt,row.updatedAt,
    );
    return row;
  }
  public getToolCall(runId: string, toolCallId: string): LedgerToolCallRow | null {
    const row = this.db.prepare(`${TOOL_SELECT} WHERE run_id=? AND tool_call_id=?`).get(runId, toolCallId) as any;
    return row ? toolCall(row) : null;
  }
  public getToolCallByExecutionId(toolExecutionId: string): LedgerToolCallRow | null {
    const row = this.db.prepare(`${TOOL_SELECT} WHERE tool_execution_id=?`).get(toolExecutionId) as any;
    return row ? toolCall(row) : null;
  }
  public updateToolCall(input: { toolExecutionId: string; status: LedgerToolCallStatus; result?: unknown | null; errorCode?: string | null; updatedAt: number }): void {
    const resultJson = input.result === undefined ? undefined : input.result === null ? null : JSON.stringify(input.result);
    const current = this.getToolCallByExecutionId(input.toolExecutionId);
    if (!current) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "tool call update target missing");
    const result = this.db.prepare(`UPDATE tool_calls SET status=?,result_json=?,error_code=?,updated_at=? WHERE tool_execution_id=?`).run(
      input.status, resultJson === undefined ? (current.result === null ? null : JSON.stringify(current.result)) : resultJson,
      input.errorCode === undefined ? current.errorCode : input.errorCode, input.updatedAt, input.toolExecutionId,
    );
    if (result.changes !== 1) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "tool call update target missing");
  }

  public insertApproval(row: LedgerApprovalRequestRow): LedgerApprovalRequestRow {
    const summaryJson = JSON.stringify(row.summary); const continuationJson = JSON.stringify(row.continuation);
    if (summaryJson === undefined || continuationJson === undefined) throw new TypeError("approval payload must be JSON serializable");
    this.db.prepare(`INSERT INTO approval_requests (request_id,version,tool_execution_id,run_id,attempt_id,conversation_id,workspace_id,tool_call_id,tool_name,binding_digest,policy_fingerprint,status,decision,summary_json,continuation_json,expires_at,resolved_at,consumed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      row.requestId,row.version,row.toolExecutionId,row.runId,row.attemptId,row.conversationId,row.workspaceId,row.toolCallId,row.toolName,row.bindingDigest,row.policyFingerprint,row.status,row.decision,summaryJson,continuationJson,row.expiresAt,row.resolvedAt,row.consumedAt,row.createdAt,row.updatedAt,
    );
    return row;
  }
  public getApproval(requestId: string): LedgerApprovalRequestRow | null {
    const row = this.db.prepare(`${APPROVAL_SELECT} WHERE request_id=?`).get(requestId) as any;
    return row ? approval(row) : null;
  }
  public getApprovalByToolExecution(toolExecutionId: string): LedgerApprovalRequestRow | null {
    const row = this.db.prepare(`${APPROVAL_SELECT} WHERE tool_execution_id=?`).get(toolExecutionId) as any;
    return row ? approval(row) : null;
  }
  public listApprovals(status?: LedgerApprovalStatus): LedgerApprovalRequestRow[] {
    const rows = status
      ? this.db.prepare(`${APPROVAL_SELECT} WHERE status=? ORDER BY created_at,request_id`).all(status) as any[]
      : this.db.prepare(`${APPROVAL_SELECT} ORDER BY created_at,request_id`).all() as any[];
    return rows.map(approval);
  }
  public resolveApproval(input: { requestId: string; expectedVersion: number; status: "APPROVED" | "DENIED"; decision: LedgerApprovalDecision; resolvedAt: number }): boolean {
    const result = this.db.prepare(`UPDATE approval_requests SET version=version+1,status=?,decision=?,resolved_at=?,updated_at=? WHERE request_id=? AND version=? AND status='PENDING'`).run(
      input.status,input.decision,input.resolvedAt,input.resolvedAt,input.requestId,input.expectedVersion,
    );
    return result.changes === 1;
  }
  public consumeApproval(input: { requestId: string; expectedVersion: number; bindingDigest: string; consumedAt: number }): boolean {
    const result = this.db.prepare(`UPDATE approval_requests SET version=version+1,status='CONSUMED',consumed_at=?,updated_at=? WHERE request_id=? AND version=? AND status='APPROVED' AND binding_digest=?`).run(
      input.consumedAt,input.consumedAt,input.requestId,input.expectedVersion,input.bindingDigest,
    );
    return result.changes === 1;
  }
  public markApprovalTerminal(input: { requestId: string; status: "EXPIRED" | "CANCELLED"; updatedAt: number }): boolean {
    const result = this.db.prepare(`UPDATE approval_requests SET version=version+1,status=?,updated_at=? WHERE request_id=? AND status='PENDING'`).run(input.status,input.updatedAt,input.requestId);
    return result.changes === 1;
  }
  public expirePending(now: number): string[] {
    const rows = this.db.prepare(`SELECT request_id requestId FROM approval_requests WHERE status='PENDING' AND expires_at<=?`).all(now) as any[];
    this.db.prepare(`UPDATE approval_requests SET version=version+1,status='EXPIRED',updated_at=? WHERE status='PENDING' AND expires_at<=?`).run(now,now);
    return rows.map((row) => row.requestId);
  }
  public insertConversationGrant(input: { conversationId: string; policyFingerprint: string; requestId: string; createdAt: number }): void {
    this.db.prepare(`INSERT INTO approval_conversation_grants (conversation_id,policy_fingerprint,created_from_request_id,created_at) VALUES (?,?,?,?) ON CONFLICT(conversation_id,policy_fingerprint) DO NOTHING`).run(input.conversationId,input.policyFingerprint,input.requestId,input.createdAt);
  }
  public hasConversationGrant(conversationId: string, policyFingerprint: string): boolean {
    return Boolean(this.db.prepare(`SELECT 1 ok FROM approval_conversation_grants WHERE conversation_id=? AND policy_fingerprint=?`).get(conversationId,policyFingerprint));
  }

  public insertProcess(row: LedgerProcessRecordRow): void {
    const confinementJson = row.confinement === null ? null : JSON.stringify(row.confinement);
    if (row.confinement !== null && confinementJson === undefined) throw new TypeError("process confinement must be JSON serializable");
    this.db.prepare(`INSERT INTO process_records (process_id,tool_execution_id,run_id,attempt_id,workspace_id,tool_call_id,mode,command_kind,command_display,cwd_relative,status,pid,stdout_path,stderr_path,backend_kind,backend_handle_id,sandboxed,confinement_json,exit_code,exit_signal,started_at,ended_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      row.processId,row.toolExecutionId,row.runId,row.attemptId,row.workspaceId,row.toolCallId,row.mode,row.commandKind,row.commandDisplay,row.cwdRelative,row.status,row.pid,row.stdoutPath,row.stderrPath,row.backendKind,row.backendHandleId,row.sandboxed ? 1 : 0,confinementJson,row.exitCode,row.exitSignal,row.startedAt,row.endedAt,row.updatedAt,
    );
  }
  public getProcess(processId: string): LedgerProcessRecordRow | null {
    const row = this.db.prepare(`${PROCESS_SELECT} WHERE process_id=?`).get(processId) as any;
    return row ? processRow(row) : null;
  }
  public getProcessByToolExecution(toolExecutionId: string): LedgerProcessRecordRow | null {
    const row = this.db.prepare(`${PROCESS_SELECT} WHERE tool_execution_id=?`).get(toolExecutionId) as any;
    return row ? processRow(row) : null;
  }
  public listProcesses(runId?: string): LedgerProcessRecordRow[] {
    const rows = runId ? this.db.prepare(`${PROCESS_SELECT} WHERE run_id=? ORDER BY updated_at,process_id`).all(runId) as any[] : this.db.prepare(`${PROCESS_SELECT} ORDER BY updated_at,process_id`).all() as any[];
    return rows.map(processRow);
  }
  public listActiveProcesses(): LedgerProcessRecordRow[] {
    return (this.db.prepare(`${PROCESS_SELECT} WHERE status IN ('STARTING','RUNNING') ORDER BY updated_at,process_id`).all() as any[]).map(processRow);
  }
  public bindProcessBackend(input: { processId: string; backendKind: "HOST" | "DOCKER"; backendHandleId: string; sandboxed: boolean; confinement: unknown; updatedAt: number }): void {
    const confinementJson = JSON.stringify(input.confinement);
    if (confinementJson === undefined) throw new TypeError("process confinement must be JSON serializable");
    const result = this.db.prepare(`UPDATE process_records SET backend_kind=?,backend_handle_id=?,sandboxed=?,confinement_json=?,updated_at=? WHERE process_id=? AND status='STARTING'`).run(
      input.backendKind,input.backendHandleId,input.sandboxed ? 1 : 0,confinementJson,input.updatedAt,input.processId,
    );
    if (result.changes !== 1) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "process backend bind target missing or not starting");
  }
  public updateProcess(input: { processId: string; status: LedgerProcessStatus; pid?: number | null; exitCode?: number | null; exitSignal?: string | null; startedAt?: number | null; endedAt?: number | null; updatedAt: number }): void {
    const current = this.getProcess(input.processId); if (!current) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "process update target missing");
    const result = this.db.prepare(`UPDATE process_records SET status=?,pid=?,exit_code=?,exit_signal=?,started_at=?,ended_at=?,updated_at=? WHERE process_id=?`).run(
      input.status,input.pid === undefined ? current.pid : input.pid,input.exitCode === undefined ? current.exitCode : input.exitCode,input.exitSignal === undefined ? current.exitSignal : input.exitSignal,input.startedAt === undefined ? current.startedAt : input.startedAt,input.endedAt === undefined ? current.endedAt : input.endedAt,input.updatedAt,input.processId,
    );
    if (result.changes !== 1) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "process update target missing");
  }
  public markActiveProcessesOrphaned(now: number): string[] {
    const rows = this.db.prepare(`SELECT process_id processId FROM process_records WHERE status IN ('STARTING','RUNNING')`).all() as any[];
    this.db.prepare(`UPDATE process_records SET status='ORPHANED',ended_at=?,updated_at=? WHERE status IN ('STARTING','RUNNING')`).run(now,now);
    return rows.map((row) => row.processId);
  }
}
