import { createHash, randomUUID } from "node:crypto";
import type {
  LedgerDelegationExpectedOutput,
  LedgerDelegationReleaseReason,
  LedgerDelegationStatus,
  LedgerDelegationChargedUsage,
  LedgerRunBudgetEnvelopeRow,
  LedgerRunDelegationEventRow,
  LedgerRunDelegationRow,
  LedgerRunDelegationWaitRow,
  LedgerRunDelegationResultDeliveryRow,
  OpenRillStateDatabase,
} from "@openrill/state";
import { ConversationError } from "./errors.js";

export interface DelegationBudgetEnvelope {
  readonly maxTurns: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly maxOutputTokens: number;
  readonly maxTotalTokens: number;
  readonly maxDurationMs: number;
  readonly maxDelegationDepth: number;
  readonly maxActiveChildren: number;
  readonly maxTotalChildren: number;
}

export interface DelegationScope {
  readonly workspaceIds: readonly string[];
  readonly skillIds: readonly string[];
  readonly toolNames: readonly string[];
}

export interface CreateDelegatedRunInput {
  readonly parentRunId: string;
  readonly parentAttemptId: string;
  readonly idempotencyKey: string;
  readonly task: string;
  readonly workspaceId: string;
  readonly budget: DelegationBudgetEnvelope;
  readonly scope: DelegationScope;
  readonly expectedOutput: LedgerDelegationExpectedOutput;
  readonly parentToolCallId?: string;
}

export interface CreateDelegatedRunResult {
  readonly delegation: LedgerRunDelegationRow;
  readonly childBudget: LedgerRunBudgetEnvelopeRow;
  readonly replayed: boolean;
}

export interface DelegationWaitState {
  readonly state: "WAITING_DELEGATION";
  readonly waits: readonly LedgerRunDelegationWaitRow[];
}

export interface DelegationArtifactReference {
  readonly artifactId: string;
  readonly kind: string;
  readonly workspaceId: string;
  readonly relativePath: string | null;
  readonly sizeBytes: number;
}

export interface DelegationTerminalResult {
  readonly delegationId: string;
  readonly childRunId: string;
  readonly status: "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
  readonly expectedOutput: LedgerDelegationExpectedOutput;
  readonly summary: string | null;
  readonly artifacts: readonly DelegationArtifactReference[];
  readonly usage: {
    readonly turns: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly modelCalls: number;
    readonly toolCalls: number;
  };
  readonly errorCode: string | null;
  readonly truncated: boolean;
}

export interface DelegationCompletion {
  readonly delegation: LedgerRunDelegationRow;
  readonly result: DelegationTerminalResult;
  readonly parentRunId: string;
  readonly resumeParent: boolean;
  readonly replayed: boolean;
}


export interface DelegationPublicUsage {
  readonly turns: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly modelCalls: number;
  readonly toolCalls: number;
}

export interface DelegationPublicView {
  readonly delegationId: string;
  readonly rootRunId: string;
  readonly parentRunId: string;
  readonly childRunId: string;
  readonly childConversationId: string;
  readonly depth: number;
  readonly status: LedgerDelegationStatus;
  readonly expectedOutput: LedgerDelegationExpectedOutput;
  readonly workspaceIds: readonly string[];
  readonly toolNames: readonly string[];
  readonly skillIds: readonly string[];
  readonly createdAt: number;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly updatedAt: number;
  readonly waitState: "WAITING_DELEGATION" | null;
  readonly budget: DelegationBudgetEnvelope & { readonly deadlineAt: number };
  readonly usage: DelegationPublicUsage;
  readonly summary: string | null;
  readonly artifacts: readonly DelegationArtifactReference[];
  readonly errorCode: string | null;
  readonly truncated: boolean;
  readonly events: readonly { readonly sequence: number; readonly eventType: string; readonly emittedAt: number }[];
}

export interface DelegationListFilter {
  readonly rootRunId?: string;
  readonly parentRunId?: string;
  readonly status?: LedgerDelegationStatus;
  readonly limit?: number;
}

export interface DelegationToolWaitIdentity {
  readonly parentAttemptId: string;
  readonly parentToolCallId: string;
  readonly toolName: "agent.wait";
}

const TERMINAL_RUN = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const ACTIVE_DELEGATION = new Set<LedgerDelegationStatus>(["CREATED", "RUNNING", "WAITING"]);
const TERMINAL_DELEGATION = new Set<LedgerDelegationStatus>(["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"]);
const MAX_PARENT_RESULT_SUMMARY_CHARS = 8_192;
const MAX_PARENT_RESULT_ARTIFACTS = 32;
const DELEGATION_TRANSITIONS: Readonly<Record<LedgerDelegationStatus, ReadonlySet<LedgerDelegationStatus>>> = Object.freeze({
  CREATED: new Set<LedgerDelegationStatus>(["RUNNING", "FAILED", "CANCELLED", "TIMED_OUT"]),
  RUNNING: new Set<LedgerDelegationStatus>(["WAITING", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"]),
  WAITING: new Set<LedgerDelegationStatus>(["RUNNING", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"]),
  COMPLETED: new Set<LedgerDelegationStatus>(), FAILED: new Set<LedgerDelegationStatus>(), CANCELLED: new Set<LedgerDelegationStatus>(), TIMED_OUT: new Set<LedgerDelegationStatus>(),
});

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

function positive(value: number, label: string, allowZero = false): number {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new ConversationError("INVALID_ARGUMENT", `${label} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }
  return value;
}

function boundedText(value: string, label: string, max: number, pattern?: RegExp): string {
  if (!value || value.length > max || (pattern && !pattern.test(value))) {
    throw new ConversationError("INVALID_ARGUMENT", `invalid ${label}`);
  }
  return value;
}

function normalizedSet(values: readonly string[], label: string, pattern: RegExp): readonly string[] {
  if (!Array.isArray(values) || values.length > 256) throw new ConversationError("INVALID_ARGUMENT", `invalid ${label}`);
  const result = [...new Set(values.map((value) => boundedText(value, label, 128, pattern)))].sort();
  if (result.length !== values.length) throw new ConversationError("INVALID_ARGUMENT", `${label} must not contain duplicates`);
  return Object.freeze(result);
}

function normalizeBudget(input: DelegationBudgetEnvelope): DelegationBudgetEnvelope {
  const budget = {
    maxTurns: positive(input.maxTurns, "maxTurns"),
    maxModelCalls: positive(input.maxModelCalls, "maxModelCalls"),
    maxToolCalls: positive(input.maxToolCalls, "maxToolCalls", true),
    maxOutputTokens: positive(input.maxOutputTokens, "maxOutputTokens"),
    maxTotalTokens: positive(input.maxTotalTokens, "maxTotalTokens"),
    maxDurationMs: positive(input.maxDurationMs, "maxDurationMs"),
    maxDelegationDepth: positive(input.maxDelegationDepth, "maxDelegationDepth", true),
    maxActiveChildren: positive(input.maxActiveChildren, "maxActiveChildren", true),
    maxTotalChildren: positive(input.maxTotalChildren, "maxTotalChildren", true),
  };
  if (budget.maxDelegationDepth > 16 || budget.maxActiveChildren > 64 || budget.maxTotalChildren > 1024) {
    throw new ConversationError("INVALID_ARGUMENT", "delegation budget exceeds hard safety limits");
  }
  if (budget.maxTotalChildren < budget.maxActiveChildren) {
    throw new ConversationError("INVALID_ARGUMENT", "maxTotalChildren must be >= maxActiveChildren");
  }
  if (budget.maxOutputTokens > budget.maxTotalTokens) {
    throw new ConversationError("INVALID_ARGUMENT", "maxOutputTokens must be <= maxTotalTokens");
  }
  return Object.freeze(budget);
}

function normalizeScope(scope: DelegationScope): DelegationScope {
  return Object.freeze({
    workspaceIds: normalizedSet(scope.workspaceIds, "workspaceId", /^[a-z][a-z0-9._-]{0,63}$/),
    skillIds: normalizedSet(scope.skillIds, "skillId", /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
    toolNames: normalizedSet(scope.toolNames, "toolName", /^[a-z][a-z0-9._-]{0,127}$/),
  });
}

function subset(child: readonly string[], parent: readonly string[]): boolean {
  const allowed = new Set(parent);
  return child.every((value) => allowed.has(value));
}

function budgetSignature(budget: LedgerRunBudgetEnvelopeRow): unknown {
  return {
    maxTurns: budget.maxTurns,
    maxModelCalls: budget.maxModelCalls,
    maxToolCalls: budget.maxToolCalls,
    maxOutputTokens: budget.maxOutputTokens,
    maxTotalTokens: budget.maxTotalTokens,
    maxDurationMs: budget.maxDurationMs,
    maxDelegationDepth: budget.maxDelegationDepth,
    maxActiveChildren: budget.maxActiveChildren,
    maxTotalChildren: budget.maxTotalChildren,
  };
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function boundedSummary(value: string): { summary: string; truncated: boolean } {
  if (value.length <= MAX_PARENT_RESULT_SUMMARY_CHARS) return { summary: value, truncated: false };
  return { summary: value.slice(0, MAX_PARENT_RESULT_SUMMARY_CHARS), truncated: true };
}

function terminalStatusForRun(status: string, terminalReason: string | null): "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT" {
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELLED";
  if (terminalReason === "AGENT_TIME_BUDGET_EXCEEDED") return "TIMED_OUT";
  return "FAILED";
}

function effectiveUsage(budget: LedgerRunBudgetEnvelopeRow): LedgerDelegationChargedUsage {
  return {
    turns: budget.usedTurns + budget.delegatedUsedTurns,
    inputTokens: budget.usedInputTokens + budget.delegatedUsedInputTokens,
    outputTokens: budget.usedOutputTokens + budget.delegatedUsedOutputTokens,
    modelCalls: budget.usedModelCalls + budget.delegatedUsedModelCalls,
    toolCalls: budget.usedToolCalls + budget.delegatedUsedToolCalls,
  };
}

export interface DelegationServiceOptions {
  readonly state: OpenRillStateDatabase;
  readonly workspaceIds: readonly string[];
  readonly now?: () => number;
  readonly createId?: () => string;
}

export class DelegationService {
  readonly #allowedWorkspaces: Set<string>;
  readonly #now: () => number;
  readonly #createId: () => string;

  public constructor(private readonly options: DelegationServiceOptions) {
    this.#allowedWorkspaces = new Set(options.workspaceIds);
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? randomUUID;
  }

  public configureRootBudget(input: {
    runId: string;
    budget: DelegationBudgetEnvelope;
    scope: DelegationScope;
  }): LedgerRunBudgetEnvelopeRow {
    const normalizedBudget = normalizeBudget(input.budget);
    const scope = normalizeScope(input.scope);
    return this.options.state.transaction((repositories) => {
      const run = repositories.conversations.getRun(input.runId);
      if (!run) throw new ConversationError("RUN_NOT_FOUND", "run not found");
      const conversation = repositories.conversations.getConversation(run.conversationId);
      if (!conversation) throw new ConversationError("CONVERSATION_NOT_FOUND", "conversation not found");
      if (!this.#allowedWorkspaces.has(conversation.workspaceId) || !scope.workspaceIds.includes(conversation.workspaceId)) {
        throw new ConversationError("WORKSPACE_ACCESS_DENIED", "root delegation scope must include the conversation workspace");
      }
      const existing = repositories.delegations.getBudgetEnvelope(run.runId);
      if (existing) {
        const matches = sameBudgetAndScope(existing, normalizedBudget, scope);
        if (!matches) throw new ConversationError("DELEGATION_BUDGET_CONFLICT", "run budget envelope already exists with different limits or scope");
        return existing;
      }
      const now = this.#now();
      const row: LedgerRunBudgetEnvelopeRow = {
        runId: run.runId,
        rootRunId: run.runId,
        parentRunId: null,
        depth: 0,
        ...normalizedBudget,
        deadlineAt: now + normalizedBudget.maxDurationMs,
        allowedWorkspaceIds: scope.workspaceIds,
        allowedSkillIds: scope.skillIds,
        allowedToolNames: scope.toolNames,
        usedTurns: 0,
        usedInputTokens: 0,
        usedOutputTokens: 0,
        usedModelCalls: 0,
        usedToolCalls: 0,
        delegatedUsedTurns: 0,
        delegatedUsedInputTokens: 0,
        delegatedUsedOutputTokens: 0,
        delegatedUsedModelCalls: 0,
        delegatedUsedToolCalls: 0,
        createdAt: now,
        updatedAt: now,
      };
      repositories.delegations.insertBudgetEnvelope(row);
      return row;
    });
  }

  public budget(runId: string): LedgerRunBudgetEnvelopeRow | null {
    return this.options.state.transaction((repositories) => repositories.delegations.getBudgetEnvelope(runId));
  }

  public get(delegationId: string): LedgerRunDelegationRow | null {
    return this.options.state.transaction((repositories) => repositories.delegations.getDelegation(delegationId));
  }

  public getByChildRun(childRunId: string): LedgerRunDelegationRow | null {
    return this.options.state.transaction((repositories) => repositories.delegations.getDelegationByChildRun(childRunId));
  }


  #publicView(repositories: any, delegation: LedgerRunDelegationRow): DelegationPublicView {
    const budget = repositories.delegations.getBudgetEnvelope(delegation.childRunId);
    if (!budget) throw new ConversationError("RUN_STATE_INVALID", "delegation child budget envelope is missing");
    const usage = effectiveUsage(budget);
    const terminal = TERMINAL_DELEGATION.has(delegation.status) ? this.#terminalResult(repositories, delegation) : null;
    const waitState = repositories.delegations.listWaits(delegation.parentRunId).some((wait: LedgerRunDelegationWaitRow) => wait.delegationId === delegation.delegationId)
      ? "WAITING_DELEGATION" as const
      : null;
    const events = repositories.delegations.listEvents(delegation.delegationId).slice(-100).map((event: LedgerRunDelegationEventRow) => ({
      sequence: event.sequence, eventType: event.eventType, emittedAt: event.emittedAt,
    }));
    return Object.freeze({
      delegationId: delegation.delegationId, rootRunId: delegation.rootRunId, parentRunId: delegation.parentRunId,
      childRunId: delegation.childRunId, childConversationId: delegation.childConversationId, depth: delegation.depth,
      status: delegation.status, expectedOutput: delegation.expectedOutput, workspaceIds: delegation.workspaceScope,
      toolNames: delegation.toolNames, skillIds: delegation.skillIds, createdAt: delegation.createdAt,
      startedAt: delegation.startedAt, endedAt: delegation.endedAt, updatedAt: delegation.updatedAt, waitState,
      budget: Object.freeze({
        maxTurns: budget.maxTurns, maxModelCalls: budget.maxModelCalls, maxToolCalls: budget.maxToolCalls,
        maxOutputTokens: budget.maxOutputTokens, maxTotalTokens: budget.maxTotalTokens, maxDurationMs: budget.maxDurationMs,
        maxDelegationDepth: budget.maxDelegationDepth, maxActiveChildren: budget.maxActiveChildren,
        maxTotalChildren: budget.maxTotalChildren, deadlineAt: budget.deadlineAt,
      }),
      usage: Object.freeze({ ...usage }), summary: terminal?.summary ?? null, artifacts: terminal?.artifacts ?? Object.freeze([]),
      errorCode: terminal?.errorCode ?? null, truncated: terminal?.truncated ?? false, events: Object.freeze(events),
    });
  }

  public listPublic(input: DelegationListFilter = {}): readonly DelegationPublicView[] {
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new ConversationError("INVALID_ARGUMENT", "delegation limit must be 1..200");
    return this.options.state.transaction((repositories) => Object.freeze(repositories.delegations.listDelegations({
      ...(input.rootRunId !== undefined ? { rootRunId: input.rootRunId } : {}),
      ...(input.parentRunId !== undefined ? { parentRunId: input.parentRunId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      limit,
    }).map((delegation: LedgerRunDelegationRow) => this.#publicView(repositories, delegation))));
  }

  public getPublic(delegationId: string): DelegationPublicView {
    boundedText(delegationId, "delegationId", 128);
    return this.options.state.transaction((repositories) => {
      const delegation = repositories.delegations.getDelegation(delegationId);
      if (!delegation) throw new ConversationError("DELEGATION_NOT_FOUND", "delegation not found");
      return this.#publicView(repositories, delegation);
    });
  }

  #appendRunEvent(repositories: any, input: {
    runId: string;
    attemptId: string | null;
    eventType: string;
    payload: unknown;
    idempotencyKey: string;
    emittedAt: number;
  }): void {
    const existing = repositories.conversations.getEventByIdempotency(input.runId, input.idempotencyKey);
    if (existing) {
      if (existing.eventType !== input.eventType || existing.attemptId !== input.attemptId || canonical(existing.payload) !== canonical(input.payload)) {
        throw new ConversationError("EVENT_IDEMPOTENCY_CONFLICT", "delegation result event conflicts with the durable event");
      }
      return;
    }
    repositories.conversations.insertEvent({
      runId: input.runId,
      sequence: repositories.conversations.nextEventSequence(input.runId, input.emittedAt),
      eventId: this.#createId(),
      attemptId: input.attemptId,
      eventType: input.eventType,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      emittedAt: input.emittedAt,
    });
  }

  #releaseReservation(
    repositories: any,
    delegation: LedgerRunDelegationRow,
    reason: LedgerDelegationReleaseReason,
    releasedAt: number,
  ): { released: boolean; usage: LedgerDelegationChargedUsage } {
    const childBudget = repositories.delegations.getBudgetEnvelope(delegation.childRunId);
    if (!childBudget) throw new ConversationError("RUN_STATE_INVALID", "delegation child budget envelope is missing");
    const usage = effectiveUsage(childBudget);
    const released = repositories.delegations.releaseBudgetReservation({
      delegationId: delegation.delegationId,
      reason,
      usage,
      releasedAt,
    });
    return { released: released.released, usage };
  }

  #terminalResult(repositories: any, delegation: LedgerRunDelegationRow): DelegationTerminalResult {
    if (!TERMINAL_DELEGATION.has(delegation.status)) {
      throw new ConversationError("RUN_STATE_INVALID", `delegation is not terminal: ${delegation.status}`);
    }
    const childRun = repositories.conversations.getRun(delegation.childRunId);
    if (!childRun || !TERMINAL_RUN.has(childRun.status)) {
      throw new ConversationError("RUN_STATE_INVALID", "delegation child Run is not terminal");
    }
    const messages = repositories.conversations.listMessages(delegation.childConversationId);
    let summary: string | null = null;
    let summaryTruncated = false;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "assistant") continue;
      const content = record(message.content);
      if (!content || content.type !== "assistant" || typeof content.text !== "string" || !content.text) continue;
      const bounded = boundedSummary(content.text);
      summary = bounded.summary;
      summaryTruncated = bounded.truncated;
      break;
    }
    const allArtifacts = repositories.workspaces.listArtifacts(delegation.childRunId);
    const artifacts = allArtifacts.slice(0, MAX_PARENT_RESULT_ARTIFACTS).map((artifact: any) => ({
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      workspaceId: artifact.workspaceId,
      relativePath: artifact.relativePath,
      sizeBytes: artifact.sizeBytes,
    }));
    const usage = repositories.conversations.aggregateRunUsage(delegation.childRunId);
    const childAttempt = childRun.currentAttemptId ? repositories.conversations.getAttempt(childRun.currentAttemptId) : null;
    const terminalReason = childAttempt?.terminalReason ?? null;
    const events = repositories.conversations.listEvents(delegation.childRunId);
    let errorCode: string | null = null;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event?.eventType !== "run.failed") continue;
      const payload = record(event.payload);
      if (payload && typeof payload.errorCode === "string") errorCode = payload.errorCode;
      break;
    }
    if (!errorCode && delegation.status !== "COMPLETED") errorCode = terminalReason ?? delegation.status;
    return Object.freeze({
      delegationId: delegation.delegationId,
      childRunId: delegation.childRunId,
      status: delegation.status as "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT",
      expectedOutput: delegation.expectedOutput,
      summary,
      artifacts: Object.freeze(artifacts),
      usage: Object.freeze({ ...usage }),
      errorCode,
      truncated: summaryTruncated || allArtifacts.length > artifacts.length,
    });
  }

  public terminalResult(parentRunId: string, delegationId: string): DelegationTerminalResult | null {
    return this.options.state.transaction((repositories) => {
      const delegation = repositories.delegations.getDelegation(delegationId);
      if (!delegation || delegation.parentRunId !== parentRunId) {
        throw new ConversationError("DELEGATION_NOT_FOUND", "delegation not found for parent run");
      }
      return TERMINAL_DELEGATION.has(delegation.status) ? this.#terminalResult(repositories, delegation) : null;
    });
  }

  public createDelegatedRun(input: CreateDelegatedRunInput): CreateDelegatedRunResult {
    boundedText(input.idempotencyKey, "delegation idempotencyKey", 128, /^[A-Za-z0-9._:-]+$/);
    boundedText(input.task, "delegation task", 65_536);
    boundedText(input.parentAttemptId, "parentAttemptId", 128);
    if (input.parentToolCallId !== undefined) boundedText(input.parentToolCallId, "parentToolCallId", 128);
    const requested = normalizeBudget(input.budget);
    const scope = normalizeScope(input.scope);
    if (!scope.workspaceIds.includes(input.workspaceId) || !this.#allowedWorkspaces.has(input.workspaceId)) {
      throw new ConversationError("WORKSPACE_ACCESS_DENIED", "delegated workspace is outside the requested scope");
    }
    const taskSha256 = sha256(input.task);

    return this.options.state.transaction((repositories) => {
      const parentRun = repositories.conversations.getRun(input.parentRunId);
      if (!parentRun) throw new ConversationError("RUN_NOT_FOUND", "parent run not found");
      if (TERMINAL_RUN.has(parentRun.status)) throw new ConversationError("RUN_STATE_INVALID", `parent run is terminal: ${parentRun.status}`);
      if (parentRun.currentAttemptId !== input.parentAttemptId) {
        throw new ConversationError("RUN_STATE_INVALID", "delegation parent attempt is not current");
      }
      const parentAttempt = repositories.conversations.getAttempt(input.parentAttemptId);
      if (!parentAttempt || parentAttempt.runId !== parentRun.runId) {
        throw new ConversationError("RUN_STATE_INVALID", "delegation parent attempt is missing");
      }
      const parentBudget = repositories.delegations.getBudgetEnvelope(parentRun.runId);
      if (!parentBudget) throw new ConversationError("DELEGATION_BUDGET_NOT_CONFIGURED", "parent run has no delegation budget envelope");
      const existing = repositories.delegations.getDelegationByIdempotency(parentRun.runId, input.idempotencyKey);
      if (existing) {
        const childBudget = repositories.delegations.getBudgetEnvelope(existing.childRunId);
        if (!childBudget) throw new ConversationError("RUN_STATE_INVALID", "delegation child budget envelope is missing");
        const signatureMatches = existing.taskSha256 === taskSha256
          && existing.parentAttemptId === input.parentAttemptId
          && existing.parentToolCallId === (input.parentToolCallId ?? null)
          && existing.expectedOutput === input.expectedOutput
          && canonical(existing.workspaceScope) === canonical(scope.workspaceIds)
          && canonical(existing.skillIds) === canonical(scope.skillIds)
          && canonical(existing.toolNames) === canonical(scope.toolNames)
          && canonical(budgetSignature(childBudget)) === canonical(requested);
        if (!signatureMatches) throw new ConversationError("DELEGATION_IDEMPOTENCY_CONFLICT", "delegation key reused with different request");
        return { delegation: existing, childBudget, replayed: true };
      }

      if (!subset(scope.workspaceIds, parentBudget.allowedWorkspaceIds)
        || !subset(scope.skillIds, parentBudget.allowedSkillIds)
        || !subset(scope.toolNames, parentBudget.allowedToolNames)) {
        throw new ConversationError("DELEGATION_SCOPE_ESCALATION", "child scope must be a subset of the parent scope");
      }
      const depth = parentBudget.depth + 1;
      if (depth > parentBudget.maxDelegationDepth) {
        throw new ConversationError("DELEGATION_DEPTH_EXCEEDED", "delegation depth limit exceeded");
      }
      if (requested.maxDelegationDepth > parentBudget.maxDelegationDepth
        || requested.maxActiveChildren > parentBudget.maxActiveChildren
        || requested.maxTotalChildren > parentBudget.maxTotalChildren) {
        throw new ConversationError("DELEGATION_BUDGET_ESCALATION", "child delegation limits exceed parent limits");
      }
      if (requested.maxOutputTokens > parentBudget.maxOutputTokens) {
        throw new ConversationError("DELEGATION_BUDGET_ESCALATION", "child output-token limit exceeds parent limit");
      }
      const now = this.#now();
      const remainingDuration = parentBudget.deadlineAt - now;
      if (remainingDuration <= 0 || requested.maxDurationMs > remainingDuration) {
        throw new ConversationError("DELEGATION_TIME_BUDGET_EXCEEDED", "child duration exceeds the parent deadline");
      }
      const reserved = repositories.delegations.reservationSummary(parentRun.runId);
      if (reserved.activeChildren >= parentBudget.maxActiveChildren) {
        throw new ConversationError("DELEGATION_ACTIVE_CHILD_LIMIT", "active child limit exceeded");
      }
      if (reserved.totalChildren >= parentBudget.maxTotalChildren) {
        throw new ConversationError("DELEGATION_TOTAL_CHILD_LIMIT", "total child limit exceeded");
      }
      const remaining = {
        turns: parentBudget.maxTurns - parentBudget.usedTurns - parentBudget.delegatedUsedTurns - reserved.reservedTurns,
        modelCalls: parentBudget.maxModelCalls - parentBudget.usedModelCalls - parentBudget.delegatedUsedModelCalls - reserved.reservedModelCalls,
        toolCalls: parentBudget.maxToolCalls - parentBudget.usedToolCalls - parentBudget.delegatedUsedToolCalls - reserved.reservedToolCalls,
        totalTokens: parentBudget.maxTotalTokens - parentBudget.usedInputTokens - parentBudget.usedOutputTokens
          - parentBudget.delegatedUsedInputTokens - parentBudget.delegatedUsedOutputTokens - reserved.reservedTotalTokens,
      };
      if (requested.maxTurns > remaining.turns
        || requested.maxModelCalls > remaining.modelCalls
        || requested.maxToolCalls > remaining.toolCalls
        || requested.maxTotalTokens > remaining.totalTokens) {
        throw new ConversationError("DELEGATION_BUDGET_EXCEEDED", "child budget exceeds parent remaining capacity");
      }

      const delegationId = this.#createId();
      const childConversationId = this.#createId();
      const messageId = this.#createId();
      const childRunId = this.#createId();
      const childAttemptId = this.#createId();
      repositories.conversations.createConversation({
        conversationId: childConversationId,
        workspaceId: input.workspaceId,
        modelProfile: repositories.conversations.getConversation(parentRun.conversationId)?.modelProfile ?? "default",
        title: "Delegated work",
        status: "ACTIVE",
        lastMessageSequence: 0,
        createdAt: now,
        updatedAt: now,
      });
      const message = {
        messageId,
        conversationId: childConversationId,
        sequence: repositories.conversations.nextMessageSequence(childConversationId, now),
        role: "user" as const,
        content: { type: "text", text: input.task },
        createdAt: now,
      };
      repositories.conversations.insertMessage(message);
      repositories.conversations.insertRun({
        runId: childRunId,
        conversationId: childConversationId,
        triggerMessageId: messageId,
        status: "CREATED",
        recoveryState: "NONE",
        currentAttemptId: childAttemptId,
        lastEventSequence: 0,
        createdAt: now,
        startedAt: null,
        endedAt: null,
        updatedAt: now,
      });
      repositories.conversations.insertAttempt({
        attemptId: childAttemptId,
        runId: childRunId,
        attemptNumber: 1,
        status: "CREATED",
        startedAt: null,
        endedAt: null,
        recoveryReason: null,
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
        createdAt: now,
        updatedAt: now,
      });
      const childEventSequence = repositories.conversations.nextEventSequence(childRunId, now);
      repositories.conversations.insertEvent({
        runId: childRunId,
        sequence: childEventSequence,
        eventId: this.#createId(),
        attemptId: childAttemptId,
        eventType: "run.created",
        payload: { triggerMessageId: messageId, delegatedFromRunId: parentRun.runId, delegationId },
        idempotencyKey: `delegation:${delegationId}`,
        emittedAt: now,
      });
      repositories.conversations.insertSubmission({
        conversationId: childConversationId,
        submissionKey: `delegation:${delegationId}`,
        inputHash: taskSha256,
        messageId,
        runId: childRunId,
        createdAt: now,
      });
      repositories.conversations.rebuildProjection(childConversationId, now);

      const childBudget: LedgerRunBudgetEnvelopeRow = {
        runId: childRunId,
        rootRunId: parentBudget.rootRunId,
        parentRunId: parentRun.runId,
        depth,
        ...requested,
        deadlineAt: now + requested.maxDurationMs,
        allowedWorkspaceIds: scope.workspaceIds,
        allowedSkillIds: scope.skillIds,
        allowedToolNames: scope.toolNames,
        usedTurns: 0,
        usedInputTokens: 0,
        usedOutputTokens: 0,
        usedModelCalls: 0,
        usedToolCalls: 0,
        delegatedUsedTurns: 0,
        delegatedUsedInputTokens: 0,
        delegatedUsedOutputTokens: 0,
        delegatedUsedModelCalls: 0,
        delegatedUsedToolCalls: 0,
        createdAt: now,
        updatedAt: now,
      };
      repositories.delegations.insertBudgetEnvelope(childBudget);
      const delegation: LedgerRunDelegationRow = {
        delegationId,
        idempotencyKey: input.idempotencyKey,
        rootRunId: parentBudget.rootRunId,
        parentRunId: parentRun.runId,
        parentAttemptId: parentAttempt.attemptId,
        parentToolCallId: input.parentToolCallId ?? null,
        childConversationId,
        childRunId,
        depth,
        status: "CREATED",
        taskSha256,
        workspaceScope: scope.workspaceIds,
        skillIds: scope.skillIds,
        toolNames: scope.toolNames,
        expectedOutput: input.expectedOutput,
        resultSummarySha256: null,
        createdAt: now,
        startedAt: null,
        endedAt: null,
        updatedAt: now,
      };
      repositories.delegations.insertDelegation(delegation);
      repositories.tasks.classifyRun({
        runId: childRunId, runtime: "DELEGATION", taskKind: "agent.delegation",
        sourceId: delegationId, parentRunId: parentRun.runId, updatedAt: now,
      });
      repositories.delegations.insertBudgetReservation({
        delegationId, parentRunId: parentRun.runId, childRunId, status: "RESERVED",
        reservedTurns: requested.maxTurns, reservedModelCalls: requested.maxModelCalls,
        reservedToolCalls: requested.maxToolCalls, reservedTotalTokens: requested.maxTotalTokens,
        chargedTurns: 0, chargedInputTokens: 0, chargedOutputTokens: 0, chargedModelCalls: 0, chargedToolCalls: 0,
        releaseReason: null, createdAt: now, releasedAt: null, updatedAt: now,
      });
      repositories.delegations.insertEvent({
        delegationId,
        sequence: 1,
        eventType: "CREATED",
        payload: { parentRunId: parentRun.runId, childRunId, depth, expectedOutput: input.expectedOutput },
        emittedAt: now,
      });
      return { delegation, childBudget, replayed: false };
    });
  }

  public markWaiting(
    parentRunId: string,
    delegationId: string,
    toolIdentity?: DelegationToolWaitIdentity,
  ): DelegationWaitState {
    return this.options.state.transaction((repositories) => {
      const delegation = repositories.delegations.getDelegation(delegationId);
      if (!delegation || delegation.parentRunId !== parentRunId) {
        throw new ConversationError("DELEGATION_NOT_FOUND", "delegation not found for parent run");
      }
      if (!ACTIVE_DELEGATION.has(delegation.status)) {
        throw new ConversationError("RUN_STATE_INVALID", `cannot wait on terminal delegation: ${delegation.status}`);
      }
      const parentRun = repositories.conversations.getRun(parentRunId);
      if (!parentRun?.currentAttemptId) throw new ConversationError("RUN_STATE_INVALID", "parent run has no current attempt");
      if (toolIdentity) {
        boundedText(toolIdentity.parentAttemptId, "parentAttemptId", 128);
        boundedText(toolIdentity.parentToolCallId, "parentToolCallId", 128);
        if (toolIdentity.toolName !== "agent.wait") throw new ConversationError("INVALID_ARGUMENT", "delegation wait Tool must be agent.wait");
        if (parentRun.currentAttemptId !== toolIdentity.parentAttemptId) {
          throw new ConversationError("RUN_STATE_INVALID", "delegation wait attempt is not current");
        }
      }
      const now = this.#now();
      if (delegation.status !== "WAITING") {
        repositories.delegations.updateDelegationStatus({
          delegationId,
          status: "WAITING",
          startedAt: now,
          endedAt: null,
          updatedAt: now,
        });
        repositories.delegations.insertEvent({
          delegationId,
          sequence: repositories.delegations.nextEventSequence(delegationId),
          eventType: "WAITING",
          payload: { parentRunId, childRunId: delegation.childRunId },
          emittedAt: now,
        });
      }
      repositories.delegations.insertWait({
        parentRunId,
        delegationId,
        state: "WAITING_DELEGATION",
        createdAt: now,
        updatedAt: now,
      });
      if (toolIdentity) {
        const existingByDelegation = repositories.delegations.getResultDelivery(delegationId);
        const existingByTool = repositories.delegations.getResultDeliveryByToolCall(parentRunId, toolIdentity.parentToolCallId);
        const existing = existingByDelegation ?? existingByTool;
        if (existing) {
          if (existing.delegationId !== delegationId
            || existing.parentRunId !== parentRunId
            || existing.parentAttemptId !== toolIdentity.parentAttemptId
            || existing.parentToolCallId !== toolIdentity.parentToolCallId
            || existing.toolName !== toolIdentity.toolName) {
            throw new ConversationError("DELEGATION_IDEMPOTENCY_CONFLICT", "delegation wait Tool identity conflicts with durable delivery");
          }
        } else {
          const delivery: LedgerRunDelegationResultDeliveryRow = {
            delegationId,
            parentRunId,
            parentAttemptId: toolIdentity.parentAttemptId,
            parentToolCallId: toolIdentity.parentToolCallId,
            toolName: toolIdentity.toolName,
            status: "PENDING",
            resultSha256: null,
            createdAt: now,
            deliveredAt: null,
            updatedAt: now,
          };
          repositories.delegations.insertResultDelivery(delivery);
        }
      }
      return { state: "WAITING_DELEGATION", waits: repositories.delegations.listWaits(parentRunId) };
    });
  }

  public transitionDelegation(input: {
    delegationId: string;
    status: Exclude<LedgerDelegationStatus, "CREATED">;
    resultSummary?: unknown;
  }): LedgerRunDelegationRow {
    return this.options.state.transaction((repositories) => {
      const current = repositories.delegations.getDelegation(input.delegationId);
      if (!current) throw new ConversationError("DELEGATION_NOT_FOUND", "delegation not found");
      if (!DELEGATION_TRANSITIONS[current.status].has(input.status)) {
        throw new ConversationError("RUN_STATE_INVALID", `invalid delegation transition ${current.status} -> ${input.status}`);
      }
      const now = this.#now();
      const terminal = !ACTIVE_DELEGATION.has(input.status);
      repositories.delegations.updateDelegationStatus({
        delegationId: current.delegationId,
        status: input.status,
        startedAt: input.status === "RUNNING" || input.status === "WAITING" || terminal ? now : null,
        endedAt: terminal ? now : null,
        resultSummarySha256: input.resultSummary === undefined ? null : sha256(input.resultSummary),
        updatedAt: now,
      });
      const release = terminal ? this.#releaseReservation(repositories, current, input.status as LedgerDelegationReleaseReason, now) : null;
      if (terminal) repositories.delegations.deleteWait(current.parentRunId, current.delegationId);
      repositories.delegations.insertEvent({
        delegationId: current.delegationId,
        sequence: repositories.delegations.nextEventSequence(current.delegationId),
        eventType: input.status === "RUNNING" ? "STARTED" : input.status,
        payload: { parentRunId: current.parentRunId, childRunId: current.childRunId, reservationReleased: release?.released ?? false },
        emittedAt: now,
      });
      const updated = repositories.delegations.getDelegation(current.delegationId);
      if (!updated) throw new ConversationError("RUN_STATE_INVALID", "delegation disappeared after transition");
      return updated;
    });
  }

  public completeChild(childRunId: string): DelegationCompletion | null {
    return this.options.state.transaction((repositories) => {
      const current = repositories.delegations.getDelegationByChildRun(childRunId);
      if (!current) return null;
      const childRun = repositories.conversations.getRun(childRunId);
      if (!childRun || !TERMINAL_RUN.has(childRun.status)) return null;
      const childAttempt = childRun.currentAttemptId ? repositories.conversations.getAttempt(childRun.currentAttemptId) : null;
      const status = terminalStatusForRun(childRun.status, childAttempt?.terminalReason ?? null);
      const terminalDelegation: LedgerRunDelegationRow = { ...current, status };
      const result = this.#terminalResult(repositories, terminalDelegation);
      const resultSha256 = sha256(result);
      const now = this.#now();
      const release = this.#releaseReservation(repositories, current, status, now);
      let updated = current;
      if (ACTIVE_DELEGATION.has(current.status)) {
        repositories.delegations.updateDelegationStatus({
          delegationId: current.delegationId,
          status,
          startedAt: now,
          endedAt: now,
          resultSummarySha256: resultSha256,
          updatedAt: now,
        });
        repositories.delegations.insertEvent({
          delegationId: current.delegationId,
          sequence: repositories.delegations.nextEventSequence(current.delegationId),
          eventType: status,
          payload: { parentRunId: current.parentRunId, childRunId: current.childRunId, reservationReleased: release.released },
          emittedAt: now,
        });
        const refreshed = repositories.delegations.getDelegation(current.delegationId);
        if (!refreshed) throw new ConversationError("RUN_STATE_INVALID", "delegation disappeared after child completion");
        updated = refreshed;
      } else if (current.resultSummarySha256 && current.resultSummarySha256 !== resultSha256) {
        throw new ConversationError("EVENT_IDEMPOTENCY_CONFLICT", "terminal delegation result changed after persistence");
      }

      const delivery = repositories.delegations.getResultDelivery(current.delegationId);
      if (!delivery) return { delegation: updated, result, parentRunId: current.parentRunId, resumeParent: false, replayed: false };
      if (delivery.status === "DELIVERED") {
        if (delivery.resultSha256 !== resultSha256) {
          throw new ConversationError("EVENT_IDEMPOTENCY_CONFLICT", "delegation result delivery hash changed");
        }
        return { delegation: updated, result, parentRunId: current.parentRunId, resumeParent: false, replayed: true };
      }

      const parentRun = repositories.conversations.getRun(delivery.parentRunId);
      if (!parentRun) throw new ConversationError("RUN_NOT_FOUND", "delegation parent run not found during result delivery");
      const existingMessage = repositories.conversations.listMessages(parentRun.conversationId).find((message: any) => {
        if (message.role !== "tool") return false;
        const content = record(message.content);
        return content?.type === "tool_result" && content.toolCallId === delivery.parentToolCallId;
      });
      const content = {
        type: "tool_result",
        toolCallId: delivery.parentToolCallId,
        name: delivery.toolName,
        output: result,
        isError: false,
      };
      if (existingMessage) {
        if (canonical(existingMessage.content) !== canonical(content)) {
          throw new ConversationError("EVENT_IDEMPOTENCY_CONFLICT", "delegation Tool result conflicts with the durable message");
        }
      } else {
        repositories.conversations.insertMessage({
          messageId: this.#createId(),
          conversationId: parentRun.conversationId,
          sequence: repositories.conversations.nextMessageSequence(parentRun.conversationId, now),
          role: "tool",
          content,
          createdAt: now,
        });
      }
      this.#appendRunEvent(repositories, {
        runId: parentRun.runId,
        attemptId: delivery.parentAttemptId,
        eventType: "delegation.resolved",
        payload: { delegationId: current.delegationId, childRunId: current.childRunId, status },
        idempotencyKey: `delegation-result:${current.delegationId}`,
        emittedAt: now,
      });
      this.#appendRunEvent(repositories, {
        runId: parentRun.runId,
        attemptId: delivery.parentAttemptId,
        eventType: "tool.completed",
        payload: { toolCallId: delivery.parentToolCallId, name: delivery.toolName, isError: false, resumedFromDelegation: true },
        idempotencyKey: `tool-complete:${delivery.parentToolCallId}`,
        emittedAt: now,
      });
      this.#appendRunEvent(repositories, {
        runId: parentRun.runId,
        attemptId: delivery.parentAttemptId,
        eventType: "run.checkpoint",
        payload: { kind: "tool.completed", toolCallId: delivery.parentToolCallId, name: delivery.toolName, isError: false },
        idempotencyKey: `checkpoint:tool:${delivery.parentToolCallId}`,
        emittedAt: now,
      });
      repositories.delegations.markResultDelivered({ delegationId: current.delegationId, resultSha256, deliveredAt: now, updatedAt: now });
      const removed = repositories.delegations.deleteWait(parentRun.runId, current.delegationId);
      if (removed) {
        repositories.delegations.insertEvent({
          delegationId: current.delegationId,
          sequence: repositories.delegations.nextEventSequence(current.delegationId),
          eventType: "WAIT_CLEARED",
          payload: { parentRunId: parentRun.runId, delivered: true },
          emittedAt: now,
        });
      }
      repositories.conversations.rebuildProjection(parentRun.conversationId, now);
      return {
        delegation: updated,
        result,
        parentRunId: parentRun.runId,
        resumeParent: !TERMINAL_RUN.has(parentRun.status),
        replayed: false,
      };
    });
  }

  public failChildBeforeStart(delegationId: string, errorCode: string): LedgerRunDelegationRow {
    boundedText(errorCode, "delegation scheduler errorCode", 128, /^[A-Z][A-Z0-9_]+$/);
    return this.options.state.transaction((repositories) => {
      const delegation = repositories.delegations.getDelegation(delegationId);
      if (!delegation) throw new ConversationError("DELEGATION_NOT_FOUND", "delegation not found");
      if (!ACTIVE_DELEGATION.has(delegation.status)) return delegation;
      const childRun = repositories.conversations.getRun(delegation.childRunId);
      if (!childRun?.currentAttemptId) throw new ConversationError("RUN_STATE_INVALID", "delegation child run attempt is missing");
      const now = this.#now();
      repositories.conversations.updateAttempt({
        attemptId: childRun.currentAttemptId, status: "FAILED", startedAt: null, endedAt: now,
        recoveryReason: null, updatedAt: now,
      });
      repositories.conversations.updateAttemptUsage({
        attemptId: childRun.currentAttemptId, turns: 0, inputTokens: 0, outputTokens: 0, modelCalls: 0, toolCalls: 0,
        terminalReason: errorCode, updatedAt: now,
      });
      repositories.conversations.updateRun({
        runId: childRun.runId, status: "FAILED", recoveryState: "NONE", currentAttemptId: childRun.currentAttemptId,
        startedAt: childRun.startedAt, endedAt: now, updatedAt: now,
      });
      this.#appendRunEvent(repositories, {
        runId: childRun.runId, attemptId: childRun.currentAttemptId, eventType: "run.failed",
        payload: { errorCode }, idempotencyKey: `delegation-schedule-failed:${delegation.delegationId}`, emittedAt: now,
      });
      repositories.conversations.rebuildProjection(childRun.conversationId, now);
      const terminal: LedgerRunDelegationRow = { ...delegation, status: "FAILED" };
      const result = this.#terminalResult(repositories, terminal);
      const resultSha256 = sha256(result);
      const release = this.#releaseReservation(repositories, delegation, "FAILED", now);
      repositories.delegations.updateDelegationStatus({
        delegationId, status: "FAILED", startedAt: now, endedAt: now, resultSummarySha256: resultSha256, updatedAt: now,
      });
      repositories.delegations.insertEvent({
        delegationId, sequence: repositories.delegations.nextEventSequence(delegationId), eventType: "FAILED",
        payload: { parentRunId: delegation.parentRunId, childRunId: delegation.childRunId, errorCode, reservationReleased: release.released }, emittedAt: now,
      });
      const updated = repositories.delegations.getDelegation(delegationId);
      if (!updated) throw new ConversationError("RUN_STATE_INVALID", "delegation disappeared after scheduler failure");
      return updated;
    });
  }

  public cancellationOrder(parentRunId: string): readonly LedgerRunDelegationRow[] {
    return this.options.state.transaction((repositories) => repositories.delegations
      .listDescendantsOfRun(parentRunId)
      .filter((row) => ACTIVE_DELEGATION.has(row.status))
      .sort((left, right) => right.depth - left.depth || right.createdAt - left.createdAt || right.delegationId.localeCompare(left.delegationId)));
  }

  public subtreeCancellationOrder(childRunId: string): readonly LedgerRunDelegationRow[] {
    return this.options.state.transaction((repositories) => repositories.delegations
      .listSubtreeByChildRun(childRunId)
      .filter((row) => ACTIVE_DELEGATION.has(row.status))
      .sort((left, right) => right.depth - left.depth || right.createdAt - left.createdAt || right.delegationId.localeCompare(left.delegationId)));
  }

  public expiredChildRunIds(at = this.#now()): readonly string[] {
    return this.options.state.transaction((repositories) => repositories.delegations
      .listExpiredActiveDelegations(at)
      .map((row) => row.childRunId));
  }

  public runnableChildRunIds(): readonly string[] {
    return this.options.state.transaction((repositories) => repositories.delegations.listRunnableChildRunIds());
  }

  public reconcileTerminalChildren(): readonly DelegationCompletion[] {
    const childRunIds = this.options.state.transaction((repositories) => repositories.delegations
      .listTerminalChildDelegations()
      .map((row) => row.childRunId));
    const completions: DelegationCompletion[] = [];
    for (const childRunId of childRunIds) {
      const completion = this.completeChild(childRunId);
      if (completion) completions.push(completion);
    }
    return Object.freeze(completions);
  }

  public terminateChild(
    childRunId: string,
    terminalStatus: "CANCELLED" | "TIMED_OUT",
    errorCode: string,
  ): DelegationCompletion | null {
    boundedText(errorCode, "delegation terminal errorCode", 128, /^[A-Z][A-Z0-9_]+$/);
    const exists = this.options.state.transaction((repositories) => {
      const delegation = repositories.delegations.getDelegationByChildRun(childRunId);
      if (!delegation) return false;
      const childRun = repositories.conversations.getRun(childRunId);
      if (!childRun) throw new ConversationError("RUN_NOT_FOUND", "delegation child run not found");
      if (TERMINAL_RUN.has(childRun.status)) return true;
      const now = this.#now();
      const attempt = childRun.currentAttemptId ? repositories.conversations.getAttempt(childRun.currentAttemptId) : null;
      const runStatus = terminalStatus === "CANCELLED" ? "CANCELLED" : "FAILED";
      const terminalReason = terminalStatus === "TIMED_OUT" ? "AGENT_TIME_BUDGET_EXCEEDED" : errorCode;
      if (attempt) {
        repositories.conversations.updateAttemptUsage({
          attemptId: attempt.attemptId,
          turns: attempt.usedTurns, inputTokens: attempt.usedInputTokens, outputTokens: attempt.usedOutputTokens,
          modelCalls: attempt.modelCallCount, toolCalls: attempt.toolCallCount, terminalReason, updatedAt: now,
        });
        repositories.conversations.updateAttempt({
          attemptId: attempt.attemptId, status: runStatus, startedAt: null, endedAt: now,
          recoveryReason: null, updatedAt: now,
        });
      }
      repositories.conversations.updateRun({
        runId: childRun.runId, status: runStatus, recoveryState: "NONE", currentAttemptId: childRun.currentAttemptId,
        startedAt: childRun.startedAt, endedAt: now, updatedAt: now,
      });
      this.#appendRunEvent(repositories, {
        runId: childRun.runId, attemptId: childRun.currentAttemptId,
        eventType: terminalStatus === "CANCELLED" ? "run.cancelled" : "run.failed",
        payload: terminalStatus === "CANCELLED" ? { reason: errorCode } : { errorCode },
        idempotencyKey: `delegation-terminal:${delegation.delegationId}:${terminalStatus}`, emittedAt: now,
      });
      repositories.conversations.rebuildProjection(childRun.conversationId, now);
      return true;
    });
    return exists ? this.completeChild(childRunId) : null;
  }

  public terminateDescendants(
    parentRunId: string,
    terminalStatus: "CANCELLED" | "TIMED_OUT",
    errorCode: string,
  ): readonly DelegationCompletion[] {
    const completions: DelegationCompletion[] = [];
    for (const delegation of this.cancellationOrder(parentRunId)) {
      const completion = this.terminateChild(delegation.childRunId, terminalStatus, errorCode);
      if (completion) completions.push(completion);
    }
    return Object.freeze(completions);
  }

  public clearWait(parentRunId: string, delegationId: string): DelegationWaitState | null {
    return this.options.state.transaction((repositories) => {
      const removed = repositories.delegations.deleteWait(parentRunId, delegationId);
      if (removed) {
        const now = this.#now();
        repositories.delegations.insertEvent({
          delegationId,
          sequence: repositories.delegations.nextEventSequence(delegationId),
          eventType: "WAIT_CLEARED",
          payload: { parentRunId },
          emittedAt: now,
        });
      }
      const waits = repositories.delegations.listWaits(parentRunId);
      return waits.length ? { state: "WAITING_DELEGATION", waits } : null;
    });
  }

  public waitState(parentRunId: string): DelegationWaitState | null {
    return this.options.state.transaction((repositories) => {
      const waits = repositories.delegations.listWaits(parentRunId);
      return waits.length ? { state: "WAITING_DELEGATION", waits } : null;
    });
  }

  public descendants(rootRunId: string): readonly LedgerRunDelegationRow[] {
    return this.options.state.transaction((repositories) => repositories.delegations.listDescendants(rootRunId));
  }

  public events(delegationId: string): readonly LedgerRunDelegationEventRow[] {
    return this.options.state.transaction((repositories) => repositories.delegations.listEvents(delegationId));
  }
}

function sameBudgetAndScope(
  existing: LedgerRunBudgetEnvelopeRow,
  budget: DelegationBudgetEnvelope,
  scope: DelegationScope,
): boolean {
  return canonical(budgetSignature(existing)) === canonical(budget)
    && canonical(existing.allowedWorkspaceIds) === canonical(scope.workspaceIds)
    && canonical(existing.allowedSkillIds) === canonical(scope.skillIds)
    && canonical(existing.allowedToolNames) === canonical(scope.toolNames);
}
