import { createHash, randomUUID } from "node:crypto";
import type {
  LedgerAttemptStatus,
  LedgerRunStatus,
  OpenRillStateDatabase,
  StateRepositories,
} from "@openrill/state";
import { ConversationError } from "./errors.js";
import type {
  AgentExecutionBudgetRecord,
  AgentExecutionContext,
  AgentExecutionUsage,
  AgentRun,
  CancelRunResult,
  Conversation,
  ConversationMessage,
  ConversationProjection,
  ConversationSummary,
  ConversationView,
  ModelInvocation,
  RecoveryClassification,
  RunAttempt,
  RunEvent,
  SendMessageResult,
} from "./types.js";

const TERMINAL = new Set<LedgerRunStatus>(["COMPLETED", "FAILED", "CANCELLED"]);
const TRANSITIONS: Readonly<Record<LedgerRunStatus, ReadonlySet<LedgerRunStatus>>> = {
  CREATED: new Set(["RUNNING", "FAILED", "CANCELLED"]),
  RUNNING: new Set(["WAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED"]),
  WAITING_APPROVAL: new Set(["RUNNING", "COMPLETED", "FAILED", "CANCELLED"]),
  COMPLETED: new Set(),
  FAILED: new Set(),
  CANCELLED: new Set(),
};

const SAFE_AFTER_CHECKPOINT = new Set(["model.requested", "model.retry"]);

function hasRecoverableCheckpoint(events: readonly { eventType: string }[]): boolean {
  let checkpoint = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.eventType === "run.checkpoint") {
      checkpoint = index;
      break;
    }
  }
  if (checkpoint < 0) return false;
  for (let index = checkpoint + 1; index < events.length; index += 1) {
    const eventType = events[index]?.eventType;
    if (!eventType || !SAFE_AFTER_CHECKPOINT.has(eventType)) return false;
  }
  return true;
}

function bounded(value: string, label: string, max: number, pattern?: RegExp): string {
  if (!value || value.length > max || (pattern && !pattern.test(value))) {
    throw new ConversationError("INVALID_ARGUMENT", `invalid ${label}`);
  }
  return value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function same(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function asConversation(row: any): Conversation {
  const { lastMessageSequence: _ignored, ...rest } = row;
  return rest;
}

function asRun(row: any): AgentRun { return row; }
function asMessage(row: any): ConversationMessage { return row; }
function asAttempt(row: any): RunAttempt { return row; }
function asInvocation(row: any): ModelInvocation { return row; }

function emptyAttemptFields() {
  return {
    providerId: null,
    modelId: null,
    maxTurns: null,
    maxModelCalls: null,
    maxToolCalls: null,
    maxOutputTokens: null,
    maxTotalTokens: null,
    maxDurationMs: null,
    usedTurns: 0,
    usedInputTokens: 0,
    usedOutputTokens: 0,
    modelCallCount: 0,
    toolCallCount: 0,
    terminalReason: null,
  } as const;
}

export interface ConversationServiceOptions {
  readonly state: OpenRillStateDatabase;
  readonly workspaceIds: readonly string[];
  readonly now?: () => number;
  readonly createId?: () => string;
}

export class ConversationService {
  readonly #allowed: Set<string>;
  readonly #now: () => number;
  readonly #createId: () => string;

  public constructor(private readonly options: ConversationServiceOptions) {
    this.#allowed = new Set(options.workspaceIds);
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? randomUUID;
  }

  #authorize(workspaceId: string): void {
    bounded(workspaceId, "workspaceId", 64, /^[a-z][a-z0-9._-]{0,63}$/);
    if (!this.#allowed.has(workspaceId)) {
      throw new ConversationError("WORKSPACE_ACCESS_DENIED", `workspace access denied: ${workspaceId}`);
    }
  }

  #summary(repositories: any, row: any): ConversationSummary {
    const projection = repositories.conversations.getProjection(row.conversationId)
      ?? repositories.conversations.rebuildProjection(row.conversationId, this.#now());
    return { ...asConversation(row), projection };
  }

  #createWithRepositories(
    repositories: StateRepositories,
    input: { workspaceId: string; modelProfile?: string; title?: string },
  ): ConversationSummary {
    this.#authorize(input.workspaceId);
    const now = this.#now();
    const row = {
      conversationId: this.#createId(),
      workspaceId: input.workspaceId,
      modelProfile: bounded(input.modelProfile ?? "default", "modelProfile", 64, /^[a-zA-Z0-9._-]+$/),
      title: input.title === undefined ? null : bounded(input.title, "title", 256),
      status: "ACTIVE" as const,
      lastMessageSequence: 0,
      createdAt: now,
      updatedAt: now,
    };
    repositories.conversations.createConversation(row);
    repositories.conversations.rebuildProjection(row.conversationId, now);
    return this.#summary(repositories, row);
  }

  public create(input: { workspaceId: string; modelProfile?: string; title?: string }): ConversationSummary {
    return this.options.state.transaction((repositories) => this.#createWithRepositories(repositories, input));
  }

  /** Internal composition point for atomic Connector binding and first-message admission. */
  public createInTransaction(
    repositories: StateRepositories,
    input: { workspaceId: string; modelProfile?: string; title?: string },
  ): ConversationSummary {
    return this.#createWithRepositories(repositories, input);
  }

  public list(input: { workspaceId: string; limit?: number }): ConversationSummary[] {
    this.#authorize(input.workspaceId);
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ConversationError("INVALID_ARGUMENT", "limit must be 1..100");
    }
    return this.options.state.transaction((repositories) =>
      repositories.conversations.listConversations(input.workspaceId, limit)
        .map((row: any) => this.#summary(repositories, row)));
  }

  public get(input: { workspaceId: string; conversationId: string }): ConversationView {
    this.#authorize(input.workspaceId);
    bounded(input.conversationId, "conversationId", 128);
    return this.options.state.transaction((repositories) => {
      const row = repositories.conversations.getConversation(input.conversationId);
      if (!row) throw new ConversationError("CONVERSATION_NOT_FOUND", "conversation not found");
      if (row.workspaceId !== input.workspaceId) {
        throw new ConversationError("WORKSPACE_ACCESS_DENIED", "conversation belongs to a different workspace");
      }
      return {
        ...this.#summary(repositories, row),
        messages: repositories.conversations.listMessages(row.conversationId).map(asMessage),
        runs: repositories.conversations.listRuns(row.conversationId).map(asRun),
      };
    });
  }

  #validateSendInput(input: { workspaceId: string; conversationId: string; submissionKey: string; text: string }): void {
    this.#authorize(input.workspaceId);
    bounded(input.conversationId, "conversationId", 128);
    bounded(input.submissionKey, "submissionKey", 128, /^[A-Za-z0-9._:-]+$/);
    bounded(input.text, "text", 65_536);
  }

  #sendWithRepositories(
    repositories: StateRepositories,
    input: { workspaceId: string; conversationId: string; submissionKey: string; text: string },
    role: "user" | "system" = "user",
  ): SendMessageResult {
    const inputHash = role === "user" ? hash({ text: input.text }) : hash({ role, text: input.text });
    const conversation = repositories.conversations.getConversation(input.conversationId);
    if (!conversation) throw new ConversationError("CONVERSATION_NOT_FOUND", "conversation not found");
    if (conversation.workspaceId !== input.workspaceId) {
      throw new ConversationError("WORKSPACE_ACCESS_DENIED", "conversation belongs to a different workspace");
    }
    const existing = repositories.conversations.getSubmission(conversation.conversationId, input.submissionKey);
    if (existing) {
      if (existing.inputHash !== inputHash) {
        throw new ConversationError("SUBMISSION_CONFLICT", "submission key reused with different input");
      }
      const message = repositories.conversations.getMessage(existing.messageId);
      const run = repositories.conversations.getRun(existing.runId);
      if (!message || !run) throw new Error("submission references missing ledger rows");
      return {
        conversation: this.#summary(repositories, repositories.conversations.getConversation(conversation.conversationId)),
        message: asMessage(message),
        run: asRun(run),
        replayed: true,
      };
    }

    const now = this.#now();
    const messageId = this.#createId();
    const runId = this.#createId();
    const attemptId = this.#createId();
    const sequence = repositories.conversations.nextMessageSequence(conversation.conversationId, now);
    const message = {
      messageId,
      conversationId: conversation.conversationId,
      sequence,
      role,
      content: { type: "text", text: input.text },
      createdAt: now,
    };
    repositories.conversations.insertMessage(message);
    const run = {
      runId,
      conversationId: conversation.conversationId,
      triggerMessageId: messageId,
      status: "CREATED" as const,
      recoveryState: "NONE" as const,
      currentAttemptId: attemptId,
      lastEventSequence: 0,
      createdAt: now,
      startedAt: null,
      endedAt: null,
      updatedAt: now,
    };
    repositories.conversations.insertRun(run);
    repositories.conversations.insertAttempt({
      attemptId,
      runId,
      attemptNumber: 1,
      status: "CREATED",
      startedAt: null,
      endedAt: null,
      recoveryReason: null,
      ...emptyAttemptFields(),
      createdAt: now,
      updatedAt: now,
    });
    this.#appendEventWithRepositories(repositories, {
      runId,
      attemptId,
      eventType: "run.created",
      payload: { triggerMessageId: messageId },
      idempotencyKey: `submission:${input.submissionKey}`,
      expectedSequence: 1,
      emittedAt: now,
    });
    repositories.conversations.insertSubmission({
      conversationId: conversation.conversationId,
      submissionKey: input.submissionKey,
      inputHash,
      messageId,
      runId,
      createdAt: now,
    });
    repositories.conversations.rebuildProjection(conversation.conversationId, now);
    return {
      conversation: this.#summary(repositories, repositories.conversations.getConversation(conversation.conversationId)),
      message,
      run: asRun(repositories.conversations.getRun(runId)),
      replayed: false,
    };
  }

  /** Internal composition point for atomic cross-ledger admission inside an existing state transaction. */
  public sendInTransaction(
    repositories: StateRepositories,
    input: { workspaceId: string; conversationId: string; submissionKey: string; text: string },
  ): SendMessageResult {
    this.#validateSendInput(input);
    return this.#sendWithRepositories(repositories, input, "user");
  }

  /** Internal durable system-event composition point for controller wake admission. */
  public sendSystemInTransaction(
    repositories: StateRepositories,
    input: { workspaceId: string; conversationId: string; submissionKey: string; text: string },
  ): SendMessageResult {
    this.#validateSendInput(input);
    return this.#sendWithRepositories(repositories, input, "system");
  }

  public send(input: { workspaceId: string; conversationId: string; submissionKey: string; text: string }): SendMessageResult {
    this.#validateSendInput(input);
    return this.options.state.transaction((repositories) => this.#sendWithRepositories(repositories, input, "user"));
  }

  public currentTime(): number {
    return this.#now();
  }

  public executionContext(runId: string): AgentExecutionContext {
    return this.options.state.transaction((repositories) => {
      const run = repositories.conversations.getRun(runId);
      if (!run) throw new ConversationError("RUN_NOT_FOUND", "run not found");
      const conversation = repositories.conversations.getConversation(run.conversationId);
      if (!conversation) throw new ConversationError("CONVERSATION_NOT_FOUND", "conversation not found");
      if (!run.currentAttemptId) throw new ConversationError("RUN_STATE_INVALID", "run has no current attempt");
      const attempt = repositories.conversations.getAttempt(run.currentAttemptId);
      if (!attempt) throw new ConversationError("RUN_STATE_INVALID", "run current attempt is missing");
      return {
        conversation: asConversation(conversation),
        messages: repositories.conversations.listMessages(conversation.conversationId).map(asMessage),
        run: asRun(run),
        attempt: asAttempt(attempt),
        budgetEnvelope: repositories.delegations.getBudgetEnvelope(run.runId),
      };
    });
  }

  public prepareExecutionAttempt(runId: string): AgentExecutionContext {
    return this.options.state.transaction((repositories) => {
      const run = repositories.conversations.getRun(runId);
      if (!run) throw new ConversationError("RUN_NOT_FOUND", "run not found");
      if (run.status !== "CREATED" && run.status !== "WAITING_APPROVAL") {
        throw new ConversationError("RUN_STATE_INVALID", `run is not preparable: ${run.status}`);
      }
      const conversation = repositories.conversations.getConversation(run.conversationId);
      if (!conversation) throw new ConversationError("CONVERSATION_NOT_FOUND", "conversation not found");
      if (!run.currentAttemptId) throw new ConversationError("RUN_STATE_INVALID", "run has no current attempt");
      let attempt = repositories.conversations.getAttempt(run.currentAttemptId);
      if (!attempt) throw new ConversationError("RUN_STATE_INVALID", "run current attempt is missing");
      if (run.status === "CREATED" && attempt.status === "ABORTED") {
        const now = this.#now();
        const previousAttemptId = attempt.attemptId;
        const previousRecoveryReason = attempt.recoveryReason;
        const attemptId = this.#createId();
        repositories.conversations.insertAttempt({
          attemptId,
          runId: run.runId,
          attemptNumber: repositories.conversations.nextAttemptNumber(run.runId),
          status: "CREATED",
          startedAt: null,
          endedAt: null,
          recoveryReason: null,
          ...emptyAttemptFields(),
          createdAt: now,
          updatedAt: now,
        });
        repositories.conversations.updateRun({
          runId: run.runId,
          status: run.status,
          recoveryState: run.recoveryState,
          currentAttemptId: attemptId,
          startedAt: run.startedAt,
          endedAt: null,
          updatedAt: now,
        });
        this.#appendEventWithRepositories(repositories, {
          runId: run.runId,
          attemptId,
          eventType: "run.attempt.prepared",
          payload: { previousAttemptId, previousRecoveryReason },
          idempotencyKey: null,
          emittedAt: now,
        });
        repositories.conversations.rebuildProjection(run.conversationId, now);
        attempt = repositories.conversations.getAttempt(attemptId);
        if (!attempt) throw new ConversationError("RUN_STATE_INVALID", "prepared run attempt is missing");
      }
      if (run.status === "CREATED" && attempt.status !== "CREATED") {
        throw new ConversationError("RUN_STATE_INVALID", `created run attempt is not preparable: ${attempt.status}`);
      }
      if (run.status === "WAITING_APPROVAL" && attempt.status !== "WAITING_APPROVAL") {
        throw new ConversationError("RUN_STATE_INVALID", `approval run attempt is not waiting: ${attempt.status}`);
      }
      const currentRun = repositories.conversations.getRun(run.runId);
      if (!currentRun || !currentRun.currentAttemptId) {
        throw new ConversationError("RUN_STATE_INVALID", "prepared run state is missing");
      }
      const currentAttempt = repositories.conversations.getAttempt(currentRun.currentAttemptId);
      if (!currentAttempt) throw new ConversationError("RUN_STATE_INVALID", "prepared run current attempt is missing");
      return {
        conversation: asConversation(conversation),
        messages: repositories.conversations.listMessages(conversation.conversationId).map(asMessage),
        run: asRun(currentRun),
        attempt: asAttempt(currentAttempt),
        budgetEnvelope: repositories.delegations.getBudgetEnvelope(run.runId),
      };
    });
  }

  public runnableRunIds(): string[] {
    return this.options.state.transaction((repositories) => repositories.conversations.listCreatedRuns().map((run) => run.runId));
  }

  public startExecution(input: {
    runId: string;
    providerId: string;
    modelId: string;
    budget: AgentExecutionBudgetRecord;
  }): AgentExecutionContext {
    const executionBudget: AgentExecutionBudgetRecord = {
      ...input.budget,
      maxTotalTokens: input.budget.maxTotalTokens ?? 65_536,
      maxDurationMs: input.budget.maxDurationMs ?? 15 * 60 * 1000,
    };
    return this.options.state.transaction((repositories) => {
      const run = repositories.conversations.getRun(input.runId);
      if (!run) throw new ConversationError("RUN_NOT_FOUND", "run not found");
      if (run.status !== "CREATED") throw new ConversationError("RUN_STATE_INVALID", `run is not executable: ${run.status}`);
      let attemptId = run.currentAttemptId;
      let attempt = attemptId ? repositories.conversations.getAttempt(attemptId) : null;
      const now = this.#now();
      if (!attempt || attempt.status === "ABORTED") {
        attemptId = this.#createId();
        repositories.conversations.insertAttempt({
          attemptId,
          runId: run.runId,
          attemptNumber: repositories.conversations.nextAttemptNumber(run.runId),
          status: "CREATED",
          startedAt: null,
          endedAt: null,
          recoveryReason: null,
          ...emptyAttemptFields(),
          createdAt: now,
          updatedAt: now,
        });
      }
      if (!attemptId) throw new ConversationError("RUN_STATE_INVALID", "run attempt identity is missing");
      const conversation = repositories.conversations.getConversation(run.conversationId);
      if (!conversation) throw new ConversationError("CONVERSATION_NOT_FOUND", "conversation not found");
      const existingEnvelope = repositories.delegations.getBudgetEnvelope(run.runId);
      if (existingEnvelope) {
        if (existingEnvelope.maxTurns !== executionBudget.maxTurns
          || existingEnvelope.maxModelCalls !== executionBudget.maxModelCalls
          || existingEnvelope.maxToolCalls !== executionBudget.maxToolCalls
          || existingEnvelope.maxOutputTokens !== executionBudget.maxOutputTokens
          || existingEnvelope.maxTotalTokens !== executionBudget.maxTotalTokens
          || existingEnvelope.maxDurationMs !== executionBudget.maxDurationMs) {
          throw new ConversationError("DELEGATION_BUDGET_CONFLICT", "execution budget differs from the durable run budget envelope");
        }
      } else {
        repositories.delegations.insertBudgetEnvelope({
          runId: run.runId, rootRunId: run.runId, parentRunId: null, depth: 0,
          ...executionBudget, deadlineAt: (run.startedAt ?? now) + executionBudget.maxDurationMs,
          maxDelegationDepth: 0, maxActiveChildren: 0, maxTotalChildren: 0,
          allowedWorkspaceIds: [conversation.workspaceId], allowedSkillIds: [], allowedToolNames: [],
          usedTurns: 0, usedInputTokens: 0, usedOutputTokens: 0, usedModelCalls: 0, usedToolCalls: 0,
          delegatedUsedTurns: 0, delegatedUsedInputTokens: 0, delegatedUsedOutputTokens: 0,
          delegatedUsedModelCalls: 0, delegatedUsedToolCalls: 0, createdAt: now, updatedAt: now,
        });
      }
      repositories.conversations.configureAttempt({
        attemptId,
        providerId: input.providerId,
        modelId: input.modelId,
        ...executionBudget,
        updatedAt: now,
      });
      repositories.conversations.updateAttempt({
        attemptId,
        status: "RUNNING",
        startedAt: now,
        endedAt: null,
        recoveryReason: null,
        updatedAt: now,
      });
      repositories.conversations.updateRun({
        runId: run.runId,
        status: "RUNNING",
        recoveryState: "NONE",
        currentAttemptId: attemptId,
        startedAt: now,
        endedAt: null,
        updatedAt: now,
      });
      this.#appendEventWithRepositories(repositories, {
        runId: run.runId,
        attemptId,
        eventType: "run.started",
        payload: { providerId: input.providerId, modelId: input.modelId, budget: executionBudget },
        idempotencyKey: `run-start:${attemptId}`,
        emittedAt: now,
      });
      repositories.conversations.rebuildProjection(run.conversationId, now);
      return {
        conversation: asConversation(conversation),
        messages: repositories.conversations.listMessages(run.conversationId).map(asMessage),
        run: asRun(repositories.conversations.getRun(run.runId)),
        attempt: asAttempt(repositories.conversations.getAttempt(attemptId)),
        budgetEnvelope: repositories.delegations.getBudgetEnvelope(run.runId),
      };
    });
  }

  public appendExecutionMessage(input: {
    runId: string;
    role: "assistant" | "tool" | "system";
    content: unknown;
  }): ConversationMessage {
    return this.options.state.transaction((repositories) => {
      const run = repositories.conversations.getRun(input.runId);
      if (!run) throw new ConversationError("RUN_NOT_FOUND", "run not found");
      if (TERMINAL.has(run.status)) throw new ConversationError("RUN_STATE_INVALID", `cannot append message to terminal run: ${run.status}`);
      const now = this.#now();
      const message = {
        messageId: this.#createId(),
        conversationId: run.conversationId,
        sequence: repositories.conversations.nextMessageSequence(run.conversationId, now),
        role: input.role,
        content: input.content,
        createdAt: now,
      };
      repositories.conversations.insertMessage(message);
      repositories.conversations.rebuildProjection(run.conversationId, now);
      return message;
    });
  }

  public startModelInvocation(input: {
    runId: string;
    attemptId: string;
    turnNumber: number;
    requestNumber: number;
    providerId: string;
    modelId: string;
    requestHash: string;
  }): ModelInvocation {
    const now = this.#now();
    const row = {
      invocationId: this.#createId(),
      ...input,
      status: "STARTED" as const,
      providerResponseId: null,
      inputTokens: 0,
      outputTokens: 0,
      errorCode: null,
      startedAt: now,
      endedAt: null,
    };
    this.options.state.transaction((repositories) => repositories.conversations.insertModelInvocation(row));
    return row;
  }

  public finishModelInvocation(input: {
    invocationId: string;
    status: "COMPLETED" | "FAILED" | "CANCELLED";
    providerResponseId?: string | null;
    inputTokens: number;
    outputTokens: number;
    errorCode?: string | null;
  }): void {
    this.options.state.transaction((repositories) => repositories.conversations.completeModelInvocation({
      invocationId: input.invocationId,
      status: input.status,
      providerResponseId: input.providerResponseId ?? null,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      errorCode: input.errorCode ?? null,
      endedAt: this.#now(),
    }));
  }

  public updateExecutionUsage(runId: string, usage: AgentExecutionUsage, terminalReason?: string | null): RunAttempt {
    return this.options.state.transaction((repositories) => {
      const run = repositories.conversations.getRun(runId);
      if (!run?.currentAttemptId) throw new ConversationError("RUN_NOT_FOUND", "run or current attempt not found");
      const prior = repositories.conversations.aggregateRunUsageExcluding(runId, run.currentAttemptId);
      const attemptUsage = {
        turns: Math.max(0, usage.turns - prior.turns),
        inputTokens: Math.max(0, usage.inputTokens - prior.inputTokens),
        outputTokens: Math.max(0, usage.outputTokens - prior.outputTokens),
        modelCalls: Math.max(0, usage.modelCalls - prior.modelCalls),
        toolCalls: Math.max(0, usage.toolCalls - prior.toolCalls),
      };
      const now = this.#now();
      repositories.conversations.updateAttemptUsage({
        attemptId: run.currentAttemptId,
        ...attemptUsage,
        terminalReason: terminalReason ?? null,
        updatedAt: now,
      });
      if (repositories.delegations.getBudgetEnvelope(runId)) {
        repositories.delegations.updateBudgetUsage({
          runId,
          usedTurns: usage.turns,
          usedInputTokens: usage.inputTokens,
          usedOutputTokens: usage.outputTokens,
          usedModelCalls: usage.modelCalls,
          usedToolCalls: usage.toolCalls,
          updatedAt: now,
        });
      }
      return asAttempt(repositories.conversations.getAttempt(run.currentAttemptId));
    });
  }


  public waitForApproval(runId: string, usage: AgentExecutionUsage, requestId: string): AgentRun {
    this.updateExecutionUsage(runId, usage, "WAITING_APPROVAL");
    return this.transitionRun({
      runId, status: "WAITING_APPROVAL", eventType: "approval.requested",
      payload: { requestId },
    });
  }

  public waitForDelegation(
    runId: string,
    usage: AgentExecutionUsage,
    input: { delegationId: string; toolCallId: string },
  ): AgentRun {
    this.updateExecutionUsage(runId, usage, "WAITING_DELEGATION");
    return this.options.state.transaction((repositories) => {
      const run = repositories.conversations.getRun(runId);
      if (!run?.currentAttemptId) throw new ConversationError("RUN_NOT_FOUND", "run or current attempt not found");
      if (run.status !== "RUNNING") throw new ConversationError("RUN_STATE_INVALID", `run is not running: ${run.status}`);
      const wait = repositories.delegations.getResultDelivery(input.delegationId);
      if (!wait || wait.parentRunId !== run.runId || wait.parentAttemptId !== run.currentAttemptId || wait.parentToolCallId !== input.toolCallId || wait.status !== "PENDING") {
        throw new ConversationError("RUN_STATE_INVALID", "durable delegation wait delivery is missing or conflicts with the current Tool call");
      }
      const now = this.#now();
      repositories.conversations.updateAttempt({
        attemptId: run.currentAttemptId,
        status: "ABORTED",
        startedAt: null,
        endedAt: now,
        recoveryReason: "DELEGATION_WAIT",
        updatedAt: now,
      });
      repositories.conversations.updateRun({
        runId: run.runId,
        status: "CREATED",
        recoveryState: "RESUMABLE",
        currentAttemptId: run.currentAttemptId,
        startedAt: run.startedAt,
        endedAt: null,
        updatedAt: now,
      });
      this.#appendEventWithRepositories(repositories, {
        runId: run.runId,
        attemptId: run.currentAttemptId,
        eventType: "delegation.waiting",
        payload: { delegationId: input.delegationId, toolCallId: input.toolCallId },
        idempotencyKey: `delegation-wait:${input.delegationId}`,
        emittedAt: now,
      });
      repositories.conversations.rebuildProjection(run.conversationId, now);
      return asRun(repositories.conversations.getRun(run.runId));
    });
  }

  public resumeExecution(runId: string): AgentExecutionContext {
    return this.options.state.transaction((repositories) => {
      const run = repositories.conversations.getRun(runId);
      if (!run) throw new ConversationError("RUN_NOT_FOUND", "run not found");
      if (run.status !== "WAITING_APPROVAL" || !run.currentAttemptId) throw new ConversationError("RUN_STATE_INVALID", `run is not waiting for approval: ${run.status}`);
      const attempt = repositories.conversations.getAttempt(run.currentAttemptId);
      if (!attempt || attempt.status !== "WAITING_APPROVAL") throw new ConversationError("RUN_STATE_INVALID", "waiting run attempt is missing");
      const now = this.#now();
      repositories.conversations.updateRun({ runId, status: "RUNNING", recoveryState: "NONE", currentAttemptId: run.currentAttemptId, startedAt: run.startedAt ?? now, endedAt: null, updatedAt: now });
      repositories.conversations.updateAttempt({ attemptId: run.currentAttemptId, status: "RUNNING", startedAt: attempt.startedAt ?? now, endedAt: null, recoveryReason: null, updatedAt: now });
      this.#appendEventWithRepositories(repositories, { runId, attemptId: run.currentAttemptId, eventType: "run.resumed", payload: { from: "WAITING_APPROVAL" }, idempotencyKey: null, emittedAt: now });
      repositories.conversations.rebuildProjection(run.conversationId, now);
      const conversation = repositories.conversations.getConversation(run.conversationId);
      return { conversation: asConversation(conversation), messages: repositories.conversations.listMessages(run.conversationId).map(asMessage), run: asRun(repositories.conversations.getRun(runId)), attempt: asAttempt(repositories.conversations.getAttempt(run.currentAttemptId)), budgetEnvelope: repositories.delegations.getBudgetEnvelope(runId) };
    });
  }

  public appendApprovalToolResult(input: { runId: string; requestId: string; toolCallId: string; name: string; output: unknown; isError: boolean }): ConversationMessage {
    return this.options.state.transaction((repositories) => {
      const run = repositories.conversations.getRun(input.runId);
      if (!run) throw new ConversationError("RUN_NOT_FOUND", "run not found");
      if (TERMINAL.has(run.status)) throw new ConversationError("RUN_STATE_INVALID", `cannot append approval result to terminal run: ${run.status}`);
      if (!run.currentAttemptId) throw new ConversationError("RUN_STATE_INVALID", "run has no current attempt");
      const existing = repositories.conversations.listMessages(run.conversationId).find((candidate: any) => {
        if (candidate.role !== "tool" || candidate.content === null || typeof candidate.content !== "object" || Array.isArray(candidate.content)) return false;
        const content = candidate.content as Record<string, unknown>;
        return content.type === "tool_result" && content.toolCallId === input.toolCallId;
      });
      if (existing) {
        const content = existing.content as Record<string, unknown>;
        if (content.name !== input.name || content.isError !== input.isError || !same(content.output, input.output)) {
          throw new ConversationError("EVENT_IDEMPOTENCY_CONFLICT", "approval tool result conflicts with the durable tool result");
        }
        return asMessage(existing);
      }
      const now = this.#now();
      const message = {
        messageId: this.#createId(),
        conversationId: run.conversationId,
        sequence: repositories.conversations.nextMessageSequence(run.conversationId, now),
        role: "tool" as const,
        content: { type: "tool_result", toolCallId: input.toolCallId, name: input.name, output: input.output, isError: input.isError },
        createdAt: now,
      };
      repositories.conversations.insertMessage(message);
      this.#appendEventWithRepositories(repositories, {
        runId: run.runId, attemptId: run.currentAttemptId, eventType: "approval.resolved",
        payload: { requestId: input.requestId, toolCallId: input.toolCallId, name: input.name, isError: input.isError },
        idempotencyKey: `approval-result:${input.requestId}`, emittedAt: now,
      });
      this.#appendEventWithRepositories(repositories, {
        runId: run.runId, attemptId: run.currentAttemptId, eventType: "tool.completed",
        payload: { toolCallId: input.toolCallId, name: input.name, isError: input.isError, resumedFromApproval: true },
        idempotencyKey: `tool-complete:${input.toolCallId}`, emittedAt: now,
      });
      repositories.conversations.rebuildProjection(run.conversationId, now);
      return asMessage(message);
    });
  }

  public completeExecution(runId: string, usage: AgentExecutionUsage, terminalReason: string, completionText?: string | null): AgentRun {
    this.updateExecutionUsage(runId, usage, terminalReason);
    return this.transitionRun({
      runId,
      status: "COMPLETED",
      eventType: "run.completed",
      payload: { terminalReason, usage },
      taskCompletionText: completionText ?? null,
    });
  }

  public failExecution(runId: string, usage: AgentExecutionUsage, errorCode: string, message: string): AgentRun {
    this.updateExecutionUsage(runId, usage, errorCode);
    return this.transitionRun({
      runId,
      status: "FAILED",
      eventType: "run.failed",
      payload: { errorCode, message },
    });
  }

  public transitionRun(input: { runId: string; status: LedgerRunStatus; eventType?: string; payload?: unknown; taskCompletionText?: string | null }): AgentRun {
    return this.options.state.transaction((repositories) => {
      const run = repositories.conversations.getRun(input.runId);
      if (!run) throw new ConversationError("RUN_NOT_FOUND", "run not found");
      if (!TRANSITIONS[run.status].has(input.status)) {
        throw new ConversationError("RUN_STATE_INVALID", `invalid run transition ${run.status} -> ${input.status}`);
      }
      const now = this.#now();
      const terminal = TERMINAL.has(input.status);
      let currentAttemptId = run.currentAttemptId;
      let attempt = currentAttemptId ? repositories.conversations.getAttempt(currentAttemptId) : null;
      if (input.status === "RUNNING" && (!attempt || attempt.status === "ABORTED")) {
        currentAttemptId = this.#createId();
        repositories.conversations.insertAttempt({
          attemptId: currentAttemptId,
          runId: run.runId,
          attemptNumber: repositories.conversations.nextAttemptNumber(run.runId),
          status: "CREATED",
          startedAt: null,
          endedAt: null,
          recoveryReason: null,
          ...emptyAttemptFields(),
          createdAt: now,
          updatedAt: now,
        });
        attempt = repositories.conversations.getAttempt(currentAttemptId);
      }
      repositories.conversations.updateRun({
        runId: run.runId,
        status: input.status,
        recoveryState: "NONE",
        currentAttemptId,
        startedAt: input.status === "RUNNING" ? now : run.startedAt,
        endedAt: terminal ? now : null,
        updatedAt: now,
        ...(Object.prototype.hasOwnProperty.call(input, "taskCompletionText") ? { taskCompletionText: input.taskCompletionText ?? null } : {}),
      });
      if (currentAttemptId) {
        repositories.conversations.updateAttempt({
          attemptId: currentAttemptId,
          status: input.status as LedgerAttemptStatus,
          startedAt: input.status === "RUNNING" ? now : null,
          endedAt: terminal ? now : null,
          recoveryReason: null,
          updatedAt: now,
        });
      }
      this.#appendEventWithRepositories(repositories, {
        runId: run.runId,
        attemptId: currentAttemptId,
        eventType: input.eventType ?? `run.${input.status.toLowerCase()}`,
        payload: input.payload ?? {},
        idempotencyKey: null,
        emittedAt: now,
      });
      repositories.conversations.rebuildProjection(run.conversationId, now);
      return asRun(repositories.conversations.getRun(run.runId));
    });
  }

  public appendEvent(input: {
    runId: string;
    attemptId?: string | null;
    eventType: string;
    payload: unknown;
    idempotencyKey?: string | null;
    expectedSequence?: number;
    emittedAt?: number;
  }): RunEvent {
    return this.options.state.transaction((repositories) => this.#appendEventWithRepositories(repositories, {
      ...input,
      attemptId: input.attemptId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      emittedAt: input.emittedAt ?? this.#now(),
    }));
  }

  #appendEventWithRepositories(repositories: any, input: {
    runId: string;
    attemptId: string | null;
    eventType: string;
    payload: unknown;
    idempotencyKey: string | null;
    expectedSequence?: number;
    emittedAt: number;
  }): RunEvent {
    bounded(input.eventType, "eventType", 128, /^[a-z][a-z0-9._-]+$/);
    const run = repositories.conversations.getRun(input.runId);
    if (!run) throw new ConversationError("RUN_NOT_FOUND", "run not found");
    if (input.idempotencyKey) {
      bounded(input.idempotencyKey, "event idempotencyKey", 128, /^[A-Za-z0-9._:-]+$/);
      const existing = repositories.conversations.getEventByIdempotency(run.runId, input.idempotencyKey);
      if (existing) {
        if (existing.eventType !== input.eventType || existing.attemptId !== input.attemptId || !same(existing.payload, input.payload)) {
          throw new ConversationError("EVENT_IDEMPOTENCY_CONFLICT", "event idempotency key reused with different event");
        }
        return { ...existing, replayed: true };
      }
    }
    const expected = run.lastEventSequence + 1;
    if (input.expectedSequence !== undefined && input.expectedSequence !== expected) {
      throw new ConversationError("EVENT_SEQUENCE_CONFLICT", `expected event sequence ${expected}, received ${input.expectedSequence}`);
    }
    const sequence = repositories.conversations.nextEventSequence(run.runId, input.emittedAt);
    const event = {
      runId: run.runId,
      sequence,
      eventId: this.#createId(),
      attemptId: input.attemptId,
      eventType: input.eventType,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      emittedAt: input.emittedAt,
    };
    repositories.conversations.insertEvent(event);
    return event;
  }

  public cancel(input: { workspaceId: string; conversationId: string; runId: string }): CancelRunResult {
    this.#authorize(input.workspaceId);
    return this.options.state.transaction((repositories) => {
      const conversation = repositories.conversations.getConversation(input.conversationId);
      if (!conversation) throw new ConversationError("CONVERSATION_NOT_FOUND", "conversation not found");
      if (conversation.workspaceId !== input.workspaceId) {
        throw new ConversationError("WORKSPACE_ACCESS_DENIED", "conversation belongs to a different workspace");
      }
      const run = repositories.conversations.getRun(input.runId);
      if (!run || run.conversationId !== conversation.conversationId) {
        throw new ConversationError("RUN_NOT_FOUND", "run not found");
      }
      if (TERMINAL.has(run.status)) return { run: asRun(run), alreadyTerminal: true };
      const now = this.#now();
      repositories.conversations.updateRun({
        runId: run.runId,
        status: "CANCELLED",
        recoveryState: "NONE",
        currentAttemptId: run.currentAttemptId,
        startedAt: run.startedAt,
        endedAt: now,
        updatedAt: now,
      });
      if (run.currentAttemptId) {
        repositories.conversations.updateAttempt({
          attemptId: run.currentAttemptId,
          status: "CANCELLED",
          startedAt: null,
          endedAt: now,
          recoveryReason: null,
          updatedAt: now,
        });
      }
      this.#appendEventWithRepositories(repositories, {
        runId: run.runId,
        attemptId: run.currentAttemptId,
        eventType: "run.cancelled",
        payload: { reason: "user" },
        idempotencyKey: "cancel",
        emittedAt: now,
      });
      repositories.conversations.rebuildProjection(conversation.conversationId, now);
      return { run: asRun(repositories.conversations.getRun(run.runId)), alreadyTerminal: false };
    });
  }

  public rebuildProjection(conversationId: string): ConversationProjection {
    return this.options.state.transaction((repositories) => {
      if (!repositories.conversations.getConversation(conversationId)) {
        throw new ConversationError("CONVERSATION_NOT_FOUND", "conversation not found");
      }
      return repositories.conversations.rebuildProjection(conversationId, this.#now());
    });
  }

  public markExecutionLost(runId: string, errorCode = "RUNTIME_AUTHORITY_LOST"): RecoveryClassification {
    bounded(errorCode, "execution lost errorCode", 128, /^[A-Z][A-Z0-9_]+$/);
    return this.options.state.transaction((repositories) => {
      const run = repositories.conversations.getRun(runId);
      if (!run) throw new ConversationError("RUN_NOT_FOUND", "run not found");
      if (TERMINAL.has(run.status)) {
        return { runId: run.runId, previousStatus: run.status, status: run.status, recoveryState: run.recoveryState };
      }
      if (run.status === "WAITING_APPROVAL") {
        throw new ConversationError("RUN_STATE_INVALID", "waiting approval run cannot be marked lost");
      }
      const now = this.#now();
      repositories.conversations.recoverStartedModelInvocations({ runId: run.runId, endedAt: now });
      if (run.currentAttemptId) {
        const attempt = repositories.conversations.getAttempt(run.currentAttemptId);
        if (attempt && !new Set<LedgerAttemptStatus>(["COMPLETED", "FAILED", "CANCELLED", "ABORTED"]).has(attempt.status)) {
          repositories.conversations.updateAttempt({
            attemptId: attempt.attemptId,
            status: "ABORTED",
            startedAt: attempt.startedAt,
            endedAt: now,
            recoveryReason: errorCode,
            updatedAt: now,
          });
        }
        if (attempt) {
          repositories.conversations.updateAttemptUsage({
            attemptId: attempt.attemptId,
            turns: attempt.usedTurns,
            inputTokens: attempt.usedInputTokens,
            outputTokens: attempt.usedOutputTokens,
            modelCalls: attempt.modelCallCount,
            toolCalls: attempt.toolCallCount,
            terminalReason: errorCode,
            updatedAt: now,
          });
        }
      }
      repositories.conversations.updateRun({
        runId: run.runId,
        status: "FAILED",
        recoveryState: "NON_RESUMABLE",
        currentAttemptId: run.currentAttemptId,
        startedAt: run.startedAt,
        endedAt: now,
        updatedAt: now,
        taskProjectionStatus: "LOST",
        taskProjectionErrorCode: errorCode,
      });
      this.#appendEventWithRepositories(repositories, {
        runId: run.runId,
        attemptId: run.currentAttemptId,
        eventType: "run.execution_lost",
        payload: { previousStatus: run.status, status: "FAILED", recoveryState: "NON_RESUMABLE", errorCode },
        idempotencyKey: "execution-lost",
        emittedAt: now,
      });
      repositories.conversations.rebuildProjection(run.conversationId, now);
      return { runId: run.runId, previousStatus: run.status, status: "FAILED", recoveryState: "NON_RESUMABLE" };
    });
  }

  public interruptExecution(runId: string, recoveryReason = "HOST_SHUTDOWN"): RecoveryClassification {
    return this.options.state.transaction((repositories) => {
      const run = repositories.conversations.getRun(runId);
      if (!run) throw new ConversationError("RUN_NOT_FOUND", "run not found");
      if (run.status !== "RUNNING") {
        return { runId: run.runId, previousStatus: run.status, status: run.status, recoveryState: run.recoveryState };
      }
      const now = this.#now();
      const events = repositories.conversations.listEvents(run.runId);
      const checkpointRecoverable = hasRecoverableCheckpoint(events);
      const status: LedgerRunStatus = checkpointRecoverable ? "CREATED" : "FAILED";
      const recoveryState: "RESUMABLE" | "NON_RESUMABLE" = checkpointRecoverable ? "RESUMABLE" : "NON_RESUMABLE";
      repositories.conversations.recoverStartedModelInvocations({ runId: run.runId, endedAt: now });
      if (run.currentAttemptId) {
        repositories.conversations.updateAttempt({
          attemptId: run.currentAttemptId,
          status: "ABORTED",
          startedAt: null,
          endedAt: now,
          recoveryReason,
          updatedAt: now,
        });
      }
      repositories.conversations.updateRun({
        runId: run.runId,
        status,
        recoveryState,
        currentAttemptId: run.currentAttemptId,
        startedAt: run.startedAt,
        endedAt: status === "FAILED" ? now : null,
        updatedAt: now,
      });
      this.#appendEventWithRepositories(repositories, {
        runId: run.runId,
        attemptId: run.currentAttemptId,
        eventType: "run.interrupted",
        payload: { previousStatus: run.status, status, recoveryState, recoveryReason, checkpointRecoverable },
        idempotencyKey: null,
        emittedAt: now,
      });
      repositories.conversations.rebuildProjection(run.conversationId, now);
      return { runId: run.runId, previousStatus: run.status, status, recoveryState };
    });
  }

  public recoverIncompleteRuns(): RecoveryClassification[] {
    return this.options.state.transaction((repositories) => {
      const output: RecoveryClassification[] = [];
      for (const run of repositories.conversations.listIncompleteRuns()) {
        const now = this.#now();
        const events = repositories.conversations.listEvents(run.runId);
        const checkpointRecoverable = hasRecoverableCheckpoint(events);
        const delegationWaitRecoverable = repositories.delegations.hasActiveWait(run.runId);
        let status: LedgerRunStatus;
        let recoveryState: "RESUMABLE" | "NON_RESUMABLE";
        if (run.status === "WAITING_APPROVAL" || checkpointRecoverable || delegationWaitRecoverable) {
          status = run.status === "WAITING_APPROVAL" ? "WAITING_APPROVAL" : "CREATED";
          recoveryState = "RESUMABLE";
        } else {
          status = "FAILED";
          recoveryState = "NON_RESUMABLE";
        }
        repositories.conversations.recoverStartedModelInvocations({ runId: run.runId, endedAt: now });
        const currentAttemptId = run.currentAttemptId;
        if (run.status === "RUNNING" && currentAttemptId) {
          repositories.conversations.updateAttempt({
            attemptId: currentAttemptId,
            status: "ABORTED",
            startedAt: null,
            endedAt: now,
            recoveryReason: "HOST_RESTART",
            updatedAt: now,
          });
          // Keep the ABORTED attempt identity attached to the recovered Run.
          // AgentRunCoordinator calls prepareExecutionAttempt() before Goal/Skill
          // preparation so the next Attempt owns all resumed provenance.
        }
        repositories.conversations.updateRun({
          runId: run.runId,
          status,
          recoveryState,
          currentAttemptId,
          startedAt: run.startedAt,
          endedAt: status === "FAILED" ? now : null,
          updatedAt: now,
        });
        this.#appendEventWithRepositories(repositories, {
          runId: run.runId,
          attemptId: run.currentAttemptId,
          eventType: "run.recovery_classified",
          payload: { previousStatus: run.status, status, recoveryState, waitingDelegation: delegationWaitRecoverable },
          idempotencyKey: `recovery:${run.lastEventSequence}`,
          emittedAt: now,
        });
        repositories.conversations.rebuildProjection(run.conversationId, now);
        output.push({ runId: run.runId, previousStatus: run.status, status, recoveryState });
      }
      return output;
    });
  }

  public events(runId: string): RunEvent[] {
    return this.options.state.transaction((repositories) => repositories.conversations.listEvents(runId));
  }

  public modelInvocations(runId: string): ModelInvocation[] {
    return this.options.state.transaction((repositories) => repositories.conversations.listModelInvocations(runId).map(asInvocation));
  }
}
