export const PACKAGE_NAME = "@openrill/conversations" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "CONVERSATIONS" as const;
export { ConversationError, type ConversationErrorCode } from "./errors.js";
export { ConversationService, type ConversationServiceOptions } from "./service.js";
export { DelegationService, type DelegationServiceOptions, type DelegationBudgetEnvelope, type DelegationScope, type CreateDelegatedRunInput, type CreateDelegatedRunResult, type DelegationWaitState, type DelegationTerminalResult, type DelegationCompletion, type DelegationToolWaitIdentity, type DelegationPublicView, type DelegationPublicUsage, type DelegationListFilter } from "./delegation.js";
export type {
  Conversation,
  ConversationStatus,
  ConversationMessage,
  MessageRole,
  AgentRun,
  RunAttempt,
  RunEvent,
  ModelInvocation,
  ConversationProjection,
  ConversationSummary,
  ConversationView,
  SendMessageResult,
  CancelRunResult,
  RecoveryClassification,
  AgentExecutionContext,
  AgentExecutionBudgetRecord,
  AgentExecutionUsage,
} from "./types.js";
