export type DelegationStatus = "CREATED" | "RUNNING" | "WAITING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
export type DelegationExpectedOutput = "TEXT" | "JSON" | "ARTIFACTS";

export interface DelegationListInput {
  readonly rootRunId?: string;
  readonly parentRunId?: string;
  readonly status?: DelegationStatus;
  readonly limit?: number;
}

export interface DelegationGetInput { readonly delegationId: string; }
export interface DelegationCancelInput { readonly delegationId: string; }

export interface PublicDelegationUsageView {
  readonly turns: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly modelCalls: number;
  readonly toolCalls: number;
}

export interface PublicDelegationBudgetView {
  readonly maxTurns: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly maxOutputTokens: number;
  readonly maxTotalTokens: number;
  readonly maxDurationMs: number;
  readonly deadlineAt: number;
  readonly maxDelegationDepth: number;
  readonly maxActiveChildren: number;
  readonly maxTotalChildren: number;
}

export interface PublicDelegationArtifactView {
  readonly artifactId: string;
  readonly kind: string;
  readonly workspaceId: string;
  readonly relativePath: string | null;
  readonly sizeBytes: number;
}

export interface PublicDelegationEventView {
  readonly sequence: number;
  readonly eventType: string;
  readonly emittedAt: number;
}

export interface PublicDelegationView {
  readonly delegationId: string;
  readonly rootRunId: string;
  readonly parentRunId: string;
  readonly childRunId: string;
  readonly childConversationId: string;
  readonly depth: number;
  readonly status: DelegationStatus;
  readonly expectedOutput: DelegationExpectedOutput;
  readonly workspaceIds: readonly string[];
  readonly toolNames: readonly string[];
  readonly skillIds: readonly string[];
  readonly createdAt: number;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly updatedAt: number;
  readonly waitState: "WAITING_DELEGATION" | null;
  readonly budget: PublicDelegationBudgetView;
  readonly usage: PublicDelegationUsageView;
  readonly summary: string | null;
  readonly artifacts: readonly PublicDelegationArtifactView[];
  readonly errorCode: string | null;
  readonly truncated: boolean;
  readonly events: readonly PublicDelegationEventView[];
}

export interface DelegationListOutput { readonly items: readonly PublicDelegationView[]; }
export interface DelegationCancelOutput {
  readonly delegation: PublicDelegationView;
  readonly affectedRuns: number;
  readonly replayed: boolean;
}
