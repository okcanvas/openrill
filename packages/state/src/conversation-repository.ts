import type { DatabaseSync } from "node:sqlite";
import { StateDatabaseError } from "./errors.js";
import { StateTaskRepository } from "./task-repository.js";

export type LedgerConversationStatus = "ACTIVE" | "ARCHIVED";
export type LedgerMessageRole = "user" | "assistant" | "tool" | "system";
export type LedgerRunStatus = "CREATED" | "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
export type LedgerAttemptStatus = LedgerRunStatus | "ABORTED";
export type LedgerRecoveryState = "NONE" | "RESUMABLE" | "NON_RESUMABLE";
export type LedgerModelInvocationStatus = "STARTED" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface LedgerConversationRow {
  conversationId: string;
  workspaceId: string;
  modelProfile: string;
  title: string | null;
  status: LedgerConversationStatus;
  lastMessageSequence: number;
  createdAt: number;
  updatedAt: number;
}

export interface LedgerMessageRow {
  messageId: string;
  conversationId: string;
  sequence: number;
  role: LedgerMessageRole;
  content: unknown;
  createdAt: number;
}

export interface LedgerRunRow {
  runId: string;
  conversationId: string;
  triggerMessageId: string | null;
  status: LedgerRunStatus;
  recoveryState: LedgerRecoveryState;
  currentAttemptId: string | null;
  lastEventSequence: number;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  updatedAt: number;
}

export interface LedgerAttemptRow {
  attemptId: string;
  runId: string;
  attemptNumber: number;
  status: LedgerAttemptStatus;
  startedAt: number | null;
  endedAt: number | null;
  recoveryReason: string | null;
  providerId: string | null;
  modelId: string | null;
  maxTurns: number | null;
  maxModelCalls: number | null;
  maxToolCalls: number | null;
  maxOutputTokens: number | null;
  maxTotalTokens: number | null;
  maxDurationMs: number | null;
  usedTurns: number;
  usedInputTokens: number;
  usedOutputTokens: number;
  modelCallCount: number;
  toolCallCount: number;
  terminalReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LedgerEventRow {
  runId: string;
  sequence: number;
  eventId: string;
  attemptId: string | null;
  eventType: string;
  payload: unknown;
  idempotencyKey: string | null;
  emittedAt: number;
}

export interface LedgerSubmissionRow {
  conversationId: string;
  submissionKey: string;
  inputHash: string;
  messageId: string;
  runId: string;
  createdAt: number;
}

export interface LedgerProjectionRow {
  conversationId: string;
  messageCount: number;
  lastMessageSequence: number;
  lastRunId: string | null;
  lastRunStatus: LedgerRunStatus | null;
  rebuiltAt: number;
}

export interface LedgerModelInvocationRow {
  invocationId: string;
  runId: string;
  attemptId: string;
  turnNumber: number;
  requestNumber: number;
  providerId: string;
  modelId: string;
  requestHash: string;
  status: LedgerModelInvocationStatus;
  providerResponseId: string | null;
  inputTokens: number;
  outputTokens: number;
  errorCode: string | null;
  startedAt: number;
  endedAt: number | null;
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `${label} contains invalid JSON`);
  }
}

function conversation(row: any): LedgerConversationRow {
  return {
    conversationId: row.conversationId,
    workspaceId: row.workspaceId,
    modelProfile: row.modelProfile,
    title: row.title,
    status: row.status,
    lastMessageSequence: row.lastMessageSequence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function run(row: any): LedgerRunRow {
  return {
    runId: row.runId,
    conversationId: row.conversationId,
    triggerMessageId: row.triggerMessageId,
    status: row.status,
    recoveryState: row.recoveryState,
    currentAttemptId: row.currentAttemptId,
    lastEventSequence: row.lastEventSequence,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    updatedAt: row.updatedAt,
  };
}

function attempt(row: any): LedgerAttemptRow {
  return {
    attemptId: row.attemptId,
    runId: row.runId,
    attemptNumber: row.attemptNumber,
    status: row.status,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    recoveryReason: row.recoveryReason,
    providerId: row.providerId ?? null,
    modelId: row.modelId ?? null,
    maxTurns: row.maxTurns ?? null,
    maxModelCalls: row.maxModelCalls ?? null,
    maxToolCalls: row.maxToolCalls ?? null,
    maxOutputTokens: row.maxOutputTokens ?? null,
    maxTotalTokens: row.maxTotalTokens ?? null,
    maxDurationMs: row.maxDurationMs ?? null,
    usedTurns: row.usedTurns ?? 0,
    usedInputTokens: row.usedInputTokens ?? 0,
    usedOutputTokens: row.usedOutputTokens ?? 0,
    modelCallCount: row.modelCallCount ?? 0,
    toolCallCount: row.toolCallCount ?? 0,
    terminalReason: row.terminalReason ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const ATTEMPT_SELECT = `
  SELECT attempt_id attemptId, run_id runId, attempt_number attemptNumber, status,
         started_at startedAt, ended_at endedAt, recovery_reason recoveryReason,
         provider_id providerId, model_id modelId, max_turns maxTurns,
         max_model_calls maxModelCalls, max_tool_calls maxToolCalls,
         max_output_tokens maxOutputTokens, max_total_tokens maxTotalTokens,
         max_duration_ms maxDurationMs, used_turns usedTurns,
         used_input_tokens usedInputTokens, used_output_tokens usedOutputTokens, model_call_count modelCallCount,
         tool_call_count toolCallCount, terminal_reason terminalReason,
         created_at createdAt, updated_at updatedAt
  FROM run_attempts`;

export class StateConversationRepository {
  readonly #tasks: StateTaskRepository;
  public constructor(private readonly db: DatabaseSync) {
    this.#tasks = new StateTaskRepository(db);
  }

  #taskText(triggerMessageId: string | null): string {
    if (!triggerMessageId) return "Background agent run";
    const value = this.db.prepare(`SELECT content_json contentJson FROM conversation_messages WHERE message_id = ?`).get(triggerMessageId) as { contentJson?: string } | undefined;
    if (!value?.contentJson) return "Background agent run";
    const content = parseJson(value.contentJson, "conversation_messages.content_json") as { text?: unknown };
    return typeof content?.text === "string" && content.text.trim() ? content.text : "Background agent run";
  }

  public createConversation(row: LedgerConversationRow): void {
    this.db.prepare(`INSERT INTO conversations (conversation_id,workspace_id,model_profile,title,status,last_message_sequence,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`).run(
      row.conversationId, row.workspaceId, row.modelProfile, row.title, row.status,
      row.lastMessageSequence, row.createdAt, row.updatedAt,
    );
  }

  public getConversation(id: string): LedgerConversationRow | null {
    const row = this.db.prepare(`SELECT conversation_id conversationId,workspace_id workspaceId,model_profile modelProfile,title,status,last_message_sequence lastMessageSequence,created_at createdAt,updated_at updatedAt FROM conversations WHERE conversation_id=?`).get(id);
    return row ? conversation(row) : null;
  }

  public listConversations(workspaceId: string, limit: number): LedgerConversationRow[] {
    return (this.db.prepare(`SELECT conversation_id conversationId,workspace_id workspaceId,model_profile modelProfile,title,status,last_message_sequence lastMessageSequence,created_at createdAt,updated_at updatedAt FROM conversations WHERE workspace_id=? ORDER BY updated_at DESC, conversation_id LIMIT ?`).all(workspaceId, limit) as any[]).map(conversation);
  }

  public nextMessageSequence(id: string, now: number): number {
    const row = this.db.prepare(`UPDATE conversations SET last_message_sequence=last_message_sequence+1,updated_at=? WHERE conversation_id=? RETURNING last_message_sequence sequence`).get(now, id) as any;
    if (!row) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "conversation disappeared while allocating message sequence");
    return row.sequence;
  }

  public insertMessage(row: LedgerMessageRow): void {
    const json = JSON.stringify(row.content);
    if (json === undefined) throw new TypeError("message content must be JSON serializable");
    this.db.prepare(`INSERT INTO conversation_messages (message_id,conversation_id,sequence,role,content_json,created_at) VALUES (?,?,?,?,?,?)`).run(
      row.messageId, row.conversationId, row.sequence, row.role, json, row.createdAt,
    );
  }

  public listMessages(id: string): LedgerMessageRow[] {
    return (this.db.prepare(`SELECT message_id messageId,conversation_id conversationId,sequence,role,content_json contentJson,created_at createdAt FROM conversation_messages WHERE conversation_id=? ORDER BY sequence`).all(id) as any[]).map((row) => ({
      messageId: row.messageId,
      conversationId: row.conversationId,
      sequence: row.sequence,
      role: row.role,
      content: parseJson(row.contentJson, "conversation_messages.content_json"),
      createdAt: row.createdAt,
    }));
  }

  public getMessage(id: string): LedgerMessageRow | null {
    const row = this.db.prepare(`SELECT message_id messageId,conversation_id conversationId,sequence,role,content_json contentJson,created_at createdAt FROM conversation_messages WHERE message_id=?`).get(id) as any;
    return row ? {
      messageId: row.messageId,
      conversationId: row.conversationId,
      sequence: row.sequence,
      role: row.role,
      content: parseJson(row.contentJson, "conversation_messages.content_json"),
      createdAt: row.createdAt,
    } : null;
  }

  public insertSubmission(row: LedgerSubmissionRow): void {
    this.db.prepare(`INSERT INTO conversation_submissions (conversation_id,submission_key,input_hash,message_id,run_id,created_at) VALUES (?,?,?,?,?,?)`).run(
      row.conversationId, row.submissionKey, row.inputHash, row.messageId, row.runId, row.createdAt,
    );
  }

  public getSubmission(conversationId: string, key: string): LedgerSubmissionRow | null {
    const row = this.db.prepare(`SELECT conversation_id conversationId,submission_key submissionKey,input_hash inputHash,message_id messageId,run_id runId,created_at createdAt FROM conversation_submissions WHERE conversation_id=? AND submission_key=?`).get(conversationId, key) as any;
    return row ? { ...row } : null;
  }

  public insertRun(row: LedgerRunRow): void {
    this.db.prepare(`INSERT INTO agent_runs (run_id,conversation_id,trigger_message_id,status,recovery_state,current_attempt_id,last_event_sequence,created_at,started_at,ended_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      row.runId, row.conversationId, row.triggerMessageId, row.status, row.recoveryState,
      row.currentAttemptId, row.lastEventSequence, row.createdAt, row.startedAt, row.endedAt, row.updatedAt,
    );
    const conversation = this.getConversation(row.conversationId);
    if (!conversation) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "run conversation missing while creating background task");
    this.#tasks.createForRun({
      taskId: `task:${row.runId}`, workspaceId: conversation.workspaceId, conversationId: row.conversationId,
      runId: row.runId, taskText: this.#taskText(row.triggerMessageId), createdAt: row.createdAt,
    });
  }

  public getRun(id: string): LedgerRunRow | null {
    const row = this.db.prepare(`SELECT run_id runId,conversation_id conversationId,trigger_message_id triggerMessageId,status,recovery_state recoveryState,current_attempt_id currentAttemptId,last_event_sequence lastEventSequence,created_at createdAt,started_at startedAt,ended_at endedAt,updated_at updatedAt FROM agent_runs WHERE run_id=?`).get(id);
    return row ? run(row) : null;
  }

  public listRuns(conversationId: string): LedgerRunRow[] {
    return (this.db.prepare(`SELECT run_id runId,conversation_id conversationId,trigger_message_id triggerMessageId,status,recovery_state recoveryState,current_attempt_id currentAttemptId,last_event_sequence lastEventSequence,created_at createdAt,started_at startedAt,ended_at endedAt,updated_at updatedAt FROM agent_runs WHERE conversation_id=? ORDER BY created_at,run_id`).all(conversationId) as any[]).map(run);
  }

  public listIncompleteRuns(): LedgerRunRow[] {
    return (this.db.prepare(`SELECT run_id runId,conversation_id conversationId,trigger_message_id triggerMessageId,status,recovery_state recoveryState,current_attempt_id currentAttemptId,last_event_sequence lastEventSequence,created_at createdAt,started_at startedAt,ended_at endedAt,updated_at updatedAt FROM agent_runs WHERE status IN ('RUNNING','WAITING_APPROVAL') ORDER BY created_at,run_id`).all() as any[]).map(run);
  }

  public listCreatedRuns(): LedgerRunRow[] {
    return (this.db.prepare(`SELECT run_id runId,conversation_id conversationId,trigger_message_id triggerMessageId,status,recovery_state recoveryState,current_attempt_id currentAttemptId,last_event_sequence lastEventSequence,created_at createdAt,started_at startedAt,ended_at endedAt,updated_at updatedAt FROM agent_runs WHERE status='CREATED' ORDER BY created_at,run_id`).all() as any[]).map(run);
  }

  public updateRun(input: {
    runId: string;
    status: LedgerRunStatus;
    recoveryState: LedgerRecoveryState;
    currentAttemptId: string | null;
    startedAt: number | null;
    endedAt: number | null;
    updatedAt: number;
    taskProjectionStatus?: "LOST";
    taskProjectionErrorCode?: string;
    taskCompletionText?: string | null;
  }): void {
    const result = this.db.prepare(`UPDATE agent_runs SET status=?,recovery_state=?,current_attempt_id=?,started_at=COALESCE(started_at,?),ended_at=?,updated_at=? WHERE run_id=?`).run(
      input.status, input.recoveryState, input.currentAttemptId, input.startedAt,
      input.endedAt, input.updatedAt, input.runId,
    );
    if (result.changes !== 1) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "run update target missing");
    this.#tasks.syncRunLifecycle({
      runId: input.runId, runStatus: input.status, recoveryState: input.recoveryState,
      startedAt: input.startedAt, endedAt: input.endedAt, updatedAt: input.updatedAt,
      currentAttemptId: input.currentAttemptId,
      ...(input.taskProjectionStatus ? { projectionStatus: input.taskProjectionStatus } : {}),
      ...(input.taskProjectionErrorCode ? { projectionErrorCode: input.taskProjectionErrorCode } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "taskCompletionText") ? { completionText: input.taskCompletionText ?? null } : {}),
    });
  }

  public nextEventSequence(runId: string, now: number): number {
    const row = this.db.prepare(`UPDATE agent_runs SET last_event_sequence=last_event_sequence+1,updated_at=? WHERE run_id=? RETURNING last_event_sequence sequence`).get(now, runId) as any;
    if (!row) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "run disappeared while allocating event sequence");
    return row.sequence;
  }

  public nextAttemptNumber(runId: string): number {
    const row = this.db.prepare(`SELECT COALESCE(MAX(attempt_number),0)+1 nextAttemptNumber FROM run_attempts WHERE run_id=?`).get(runId) as any;
    return row.nextAttemptNumber;
  }

  public insertAttempt(row: LedgerAttemptRow): void {
    this.db.prepare(`INSERT INTO run_attempts (
      attempt_id,run_id,attempt_number,status,started_at,ended_at,recovery_reason,
      provider_id,model_id,max_turns,max_model_calls,max_tool_calls,max_output_tokens,max_total_tokens,max_duration_ms,
      used_turns,used_input_tokens,used_output_tokens,model_call_count,tool_call_count,terminal_reason,
      created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      row.attemptId, row.runId, row.attemptNumber, row.status, row.startedAt, row.endedAt,
      row.recoveryReason, row.providerId, row.modelId, row.maxTurns, row.maxModelCalls,
      row.maxToolCalls, row.maxOutputTokens, row.maxTotalTokens, row.maxDurationMs,
      row.usedTurns, row.usedInputTokens, row.usedOutputTokens, row.modelCallCount,
      row.toolCallCount, row.terminalReason, row.createdAt, row.updatedAt,
    );
  }

  public getAttempt(id: string): LedgerAttemptRow | null {
    const row = this.db.prepare(`${ATTEMPT_SELECT} WHERE attempt_id=?`).get(id) as any;
    return row ? attempt(row) : null;
  }

  public updateAttempt(input: {
    attemptId: string;
    status: LedgerAttemptStatus;
    startedAt: number | null;
    endedAt: number | null;
    recoveryReason: string | null;
    updatedAt: number;
  }): void {
    const result = this.db.prepare(`UPDATE run_attempts SET status=?,started_at=COALESCE(started_at,?),ended_at=?,recovery_reason=?,updated_at=? WHERE attempt_id=?`).run(
      input.status, input.startedAt, input.endedAt, input.recoveryReason, input.updatedAt, input.attemptId,
    );
    if (result.changes !== 1) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "attempt update target missing");
  }

  public configureAttempt(input: {
    attemptId: string;
    providerId: string;
    modelId: string;
    maxTurns: number;
    maxModelCalls: number;
    maxToolCalls: number;
    maxOutputTokens: number;
    maxTotalTokens: number;
    maxDurationMs: number;
    updatedAt: number;
  }): void {
    const result = this.db.prepare(`UPDATE run_attempts SET provider_id=?,model_id=?,max_turns=?,max_model_calls=?,max_tool_calls=?,max_output_tokens=?,max_total_tokens=?,max_duration_ms=?,updated_at=? WHERE attempt_id=?`).run(
      input.providerId, input.modelId, input.maxTurns, input.maxModelCalls,
      input.maxToolCalls, input.maxOutputTokens, input.maxTotalTokens, input.maxDurationMs, input.updatedAt, input.attemptId,
    );
    if (result.changes !== 1) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "attempt configuration target missing");
  }

  public updateAttemptUsage(input: {
    attemptId: string;
    turns: number;
    inputTokens: number;
    outputTokens: number;
    modelCalls: number;
    toolCalls: number;
    terminalReason?: string | null;
    updatedAt: number;
  }): void {
    const result = this.db.prepare(`UPDATE run_attempts SET used_turns=?,used_input_tokens=?,used_output_tokens=?,model_call_count=?,tool_call_count=?,terminal_reason=COALESCE(?,terminal_reason),updated_at=? WHERE attempt_id=?`).run(
      input.turns, input.inputTokens, input.outputTokens, input.modelCalls, input.toolCalls,
      input.terminalReason ?? null, input.updatedAt, input.attemptId,
    );
    if (result.changes !== 1) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "attempt usage target missing");
  }

  public aggregateRunUsage(runId: string): { turns: number; inputTokens: number; outputTokens: number; modelCalls: number; toolCalls: number } {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(used_turns),0) turns,
             COALESCE(SUM(used_input_tokens),0) inputTokens,
             COALESCE(SUM(used_output_tokens),0) outputTokens,
             COALESCE(SUM(model_call_count),0) modelCalls,
             COALESCE(SUM(tool_call_count),0) toolCalls
      FROM run_attempts WHERE run_id=?
    `).get(runId) as any;
    return {
      turns: Number(row?.turns ?? 0),
      inputTokens: Number(row?.inputTokens ?? 0),
      outputTokens: Number(row?.outputTokens ?? 0),
      modelCalls: Number(row?.modelCalls ?? 0),
      toolCalls: Number(row?.toolCalls ?? 0),
    };
  }

  public aggregateRunUsageExcluding(runId: string, attemptId: string): { turns: number; inputTokens: number; outputTokens: number; modelCalls: number; toolCalls: number } {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(used_turns),0) turns,
             COALESCE(SUM(used_input_tokens),0) inputTokens,
             COALESCE(SUM(used_output_tokens),0) outputTokens,
             COALESCE(SUM(model_call_count),0) modelCalls,
             COALESCE(SUM(tool_call_count),0) toolCalls
      FROM run_attempts WHERE run_id=? AND attempt_id!=?
    `).get(runId, attemptId) as any;
    return {
      turns: Number(row?.turns ?? 0),
      inputTokens: Number(row?.inputTokens ?? 0),
      outputTokens: Number(row?.outputTokens ?? 0),
      modelCalls: Number(row?.modelCalls ?? 0),
      toolCalls: Number(row?.toolCalls ?? 0),
    };
  }

  public insertEvent(row: LedgerEventRow): void {
    const json = JSON.stringify(row.payload);
    if (json === undefined) throw new TypeError("run event payload must be JSON serializable");
    this.db.prepare(`INSERT INTO run_events (run_id,sequence,event_id,attempt_id,event_type,payload_json,idempotency_key,emitted_at) VALUES (?,?,?,?,?,?,?,?)`).run(
      row.runId, row.sequence, row.eventId, row.attemptId, row.eventType,
      json, row.idempotencyKey, row.emittedAt,
    );
  }

  public listEvents(runId: string): LedgerEventRow[] {
    return (this.db.prepare(`SELECT run_id runId,sequence,event_id eventId,attempt_id attemptId,event_type eventType,payload_json payloadJson,idempotency_key idempotencyKey,emitted_at emittedAt FROM run_events WHERE run_id=? ORDER BY sequence`).all(runId) as any[]).map((row) => ({
      runId: row.runId,
      sequence: row.sequence,
      eventId: row.eventId,
      attemptId: row.attemptId,
      eventType: row.eventType,
      payload: parseJson(row.payloadJson, "run_events.payload_json"),
      idempotencyKey: row.idempotencyKey,
      emittedAt: row.emittedAt,
    }));
  }

  public getEventByIdempotency(runId: string, key: string): LedgerEventRow | null {
    const row = this.db.prepare(`SELECT run_id runId,sequence,event_id eventId,attempt_id attemptId,event_type eventType,payload_json payloadJson,idempotency_key idempotencyKey,emitted_at emittedAt FROM run_events WHERE run_id=? AND idempotency_key=?`).get(runId, key) as any;
    return row ? {
      runId: row.runId,
      sequence: row.sequence,
      eventId: row.eventId,
      attemptId: row.attemptId,
      eventType: row.eventType,
      payload: parseJson(row.payloadJson, "run_events.payload_json"),
      idempotencyKey: row.idempotencyKey,
      emittedAt: row.emittedAt,
    } : null;
  }

  public latestEventType(runId: string): string | null {
    const row = this.db.prepare(`SELECT event_type eventType FROM run_events WHERE run_id=? ORDER BY sequence DESC LIMIT 1`).get(runId) as any;
    return row?.eventType ?? null;
  }

  public insertModelInvocation(row: LedgerModelInvocationRow): void {
    this.db.prepare(`INSERT INTO model_invocations (
      invocation_id,run_id,attempt_id,turn_number,request_number,provider_id,model_id,
      request_hash,status,provider_response_id,input_tokens,output_tokens,error_code,started_at,ended_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      row.invocationId, row.runId, row.attemptId, row.turnNumber, row.requestNumber,
      row.providerId, row.modelId, row.requestHash, row.status, row.providerResponseId,
      row.inputTokens, row.outputTokens, row.errorCode, row.startedAt, row.endedAt,
    );
  }

  public completeModelInvocation(input: {
    invocationId: string;
    status: LedgerModelInvocationStatus;
    providerResponseId: string | null;
    inputTokens: number;
    outputTokens: number;
    errorCode: string | null;
    endedAt: number;
  }): void {
    const result = this.db.prepare(`UPDATE model_invocations SET status=?,provider_response_id=?,input_tokens=?,output_tokens=?,error_code=?,ended_at=? WHERE invocation_id=?`).run(
      input.status, input.providerResponseId, input.inputTokens, input.outputTokens,
      input.errorCode, input.endedAt, input.invocationId,
    );
    if (result.changes !== 1) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "model invocation target missing");
  }

  public recoverStartedModelInvocations(input: { runId: string; endedAt: number }): number {
    const result = this.db.prepare(`UPDATE model_invocations
      SET status='FAILED',error_code='MODEL_INTERRUPTED_BY_RESTART',ended_at=?
      WHERE run_id=? AND status='STARTED'`).run(input.endedAt, input.runId);
    return Number(result.changes);
  }

  public listModelInvocations(runId: string): LedgerModelInvocationRow[] {
    return (this.db.prepare(`SELECT invocation_id invocationId,run_id runId,attempt_id attemptId,turn_number turnNumber,request_number requestNumber,provider_id providerId,model_id modelId,request_hash requestHash,status,provider_response_id providerResponseId,input_tokens inputTokens,output_tokens outputTokens,error_code errorCode,started_at startedAt,ended_at endedAt FROM model_invocations WHERE run_id=? ORDER BY request_number`).all(runId) as any[]).map((row) => ({ ...row }));
  }

  public rebuildProjection(conversationId: string, rebuiltAt: number): LedgerProjectionRow {
    const counts = this.db.prepare(`SELECT COUNT(*) messageCount,COALESCE(MAX(sequence),0) lastMessageSequence FROM conversation_messages WHERE conversation_id=?`).get(conversationId) as any;
    const latest = this.db.prepare(`SELECT run_id runId,status FROM agent_runs WHERE conversation_id=? ORDER BY created_at DESC,run_id DESC LIMIT 1`).get(conversationId) as any;
    this.db.prepare(`INSERT INTO conversation_projections (conversation_id,message_count,last_message_sequence,last_run_id,last_run_status,rebuilt_at) VALUES (?,?,?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET message_count=excluded.message_count,last_message_sequence=excluded.last_message_sequence,last_run_id=excluded.last_run_id,last_run_status=excluded.last_run_status,rebuilt_at=excluded.rebuilt_at`).run(
      conversationId, counts.messageCount, counts.lastMessageSequence,
      latest?.runId ?? null, latest?.status ?? null, rebuiltAt,
    );
    return {
      conversationId,
      messageCount: counts.messageCount,
      lastMessageSequence: counts.lastMessageSequence,
      lastRunId: latest?.runId ?? null,
      lastRunStatus: latest?.status ?? null,
      rebuiltAt,
    };
  }

  public deleteProjection(conversationId: string): void {
    this.db.prepare(`DELETE FROM conversation_projections WHERE conversation_id=?`).run(conversationId);
  }

  public getProjection(conversationId: string): LedgerProjectionRow | null {
    const row = this.db.prepare(`SELECT conversation_id conversationId,message_count messageCount,last_message_sequence lastMessageSequence,last_run_id lastRunId,last_run_status lastRunStatus,rebuilt_at rebuiltAt FROM conversation_projections WHERE conversation_id=?`).get(conversationId) as any;
    return row ? { ...row } : null;
  }
}
