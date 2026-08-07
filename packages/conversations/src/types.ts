import type {
  LedgerAttemptStatus,
  LedgerRecoveryState,
  LedgerRunStatus,
  LedgerModelInvocationStatus,
  LedgerRunBudgetEnvelopeRow,
} from "@openrill/state";

export type ConversationStatus = "ACTIVE" | "ARCHIVED";
export type MessageRole = "user" | "assistant" | "tool" | "system";

export interface Conversation {
  readonly conversationId: string;
  readonly workspaceId: string;
  readonly modelProfile: string;
  readonly title: string | null;
  readonly status: ConversationStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ConversationMessage {
  readonly messageId: string;
  readonly conversationId: string;
  readonly sequence: number;
  readonly role: MessageRole;
  readonly content: unknown;
  readonly createdAt: number;
}

export interface AgentRun {
  readonly runId: string;
  readonly conversationId: string;
  readonly triggerMessageId: string | null;
  readonly status: LedgerRunStatus;
  readonly recoveryState: LedgerRecoveryState;
  readonly currentAttemptId: string | null;
  readonly lastEventSequence: number;
  readonly createdAt: number;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly updatedAt: number;
}

export interface RunAttempt {
  readonly attemptId: string;
  readonly runId: string;
  readonly attemptNumber: number;
  readonly status: LedgerAttemptStatus;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly recoveryReason: string | null;
  readonly providerId: string | null;
  readonly modelId: string | null;
  readonly maxTurns: number | null;
  readonly maxModelCalls: number | null;
  readonly maxToolCalls: number | null;
  readonly maxOutputTokens: number | null;
  readonly maxTotalTokens: number | null;
  readonly maxDurationMs: number | null;
  readonly usedTurns: number;
  readonly usedInputTokens: number;
  readonly usedOutputTokens: number;
  readonly modelCallCount: number;
  readonly toolCallCount: number;
  readonly terminalReason: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface RunEvent {
  readonly runId: string;
  readonly sequence: number;
  readonly eventId: string;
  readonly attemptId: string | null;
  readonly eventType: string;
  readonly payload: unknown;
  readonly idempotencyKey: string | null;
  readonly emittedAt: number;
  readonly replayed?: boolean;
}

export interface ModelInvocation {
  readonly invocationId: string;
  readonly runId: string;
  readonly attemptId: string;
  readonly turnNumber: number;
  readonly requestNumber: number;
  readonly providerId: string;
  readonly modelId: string;
  readonly requestHash: string;
  readonly status: LedgerModelInvocationStatus;
  readonly providerResponseId: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly errorCode: string | null;
  readonly startedAt: number;
  readonly endedAt: number | null;
}

export interface ConversationProjection {
  readonly conversationId: string;
  readonly messageCount: number;
  readonly lastMessageSequence: number;
  readonly lastRunId: string | null;
  readonly lastRunStatus: LedgerRunStatus | null;
  readonly rebuiltAt: number;
}

export interface ConversationSummary extends Conversation {
  readonly projection: ConversationProjection;
}

export interface ConversationView extends ConversationSummary {
  readonly messages: readonly ConversationMessage[];
  readonly runs: readonly AgentRun[];
}

export interface SendMessageResult {
  readonly conversation: ConversationSummary;
  readonly message: ConversationMessage;
  readonly run: AgentRun;
  readonly replayed: boolean;
}

export interface CancelRunResult {
  readonly run: AgentRun;
  readonly alreadyTerminal: boolean;
}

export interface RecoveryClassification {
  readonly runId: string;
  readonly previousStatus: LedgerRunStatus;
  readonly status: LedgerRunStatus;
  readonly recoveryState: LedgerRecoveryState;
}

export interface AgentExecutionContext {
  readonly conversation: Conversation;
  readonly messages: readonly ConversationMessage[];
  readonly run: AgentRun;
  readonly attempt: RunAttempt;
  readonly budgetEnvelope: LedgerRunBudgetEnvelopeRow | null;
}

export interface AgentExecutionBudgetRecord {
  readonly maxTurns: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly maxOutputTokens: number;
  readonly maxTotalTokens: number;
  readonly maxDurationMs: number;
}

export interface AgentExecutionUsage {
  readonly turns: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly modelCalls: number;
  readonly toolCalls: number;
}
