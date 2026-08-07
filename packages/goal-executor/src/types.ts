import type { GoalStatus, PlanStepStatus } from "@openrill/goals";
import type { TaskFlowView } from "@openrill/task-flows";

export type GoalExecutionStatus = "QUEUED" | "RUNNING" | "WAITING" | "BLOCKED" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export type GoalStepExecutionStatus = "PENDING" | "READY" | "RUNNING" | "WAITING" | "BLOCKED" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "SKIPPED";

export interface GoalExecutionRecord {
  readonly goalId: string;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly planRevision: number;
  readonly flowId: string;
  readonly controllerId: string;
  readonly status: GoalExecutionStatus;
  readonly currentStepId: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly endedAt: number | null;
  readonly revision: number;
}

export interface GoalStepExecutionRecord {
  readonly goalId: string;
  readonly stepId: string;
  readonly planRevision: number;
  readonly ordinal: number;
  readonly title: string;
  readonly planStatus: PlanStepStatus;
  readonly status: GoalStepExecutionStatus;
  readonly currentTaskId: string | null;
  readonly attemptCount: number;
  readonly lastTerminalOutcome: "SUCCEEDED" | "BLOCKED" | null;
  readonly lastSummary: string | null;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly retryMode: "MANUAL";
  readonly maxAttempts: number;
  readonly nextRetryAt: number | null;
  readonly lastRetryReason: string | null;
  readonly updatedAt: number;
  readonly revision: number;
}

export interface GoalStepBlockerRecord {
  readonly blockerId: string;
  readonly goalId: string;
  readonly stepId: string;
  readonly planRevision: number;
  readonly taskId: string | null;
  readonly blockerType: "TASK_OUTPUT" | "TASK_FAILURE" | "OPERATOR" | "DEPENDENCY" | "RETRY_LIMIT";
  readonly fingerprint: string;
  readonly summary: string;
  readonly evidence: unknown;
  readonly status: "OPEN" | "RESOLVED";
  readonly occurrenceCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly resolvedAt: number | null;
  readonly resolvedBy: string | null;
  readonly resolution: string | null;
  readonly revision: number;
}

export interface GoalExecutionView {
  readonly goal: {
    readonly goalId: string;
    readonly objective: string;
    readonly status: GoalStatus;
    readonly revision: number;
    readonly planRevision: number;
  };
  readonly execution: GoalExecutionRecord;
  readonly steps: readonly GoalStepExecutionRecord[];
  readonly blockers: readonly GoalStepBlockerRecord[];
  readonly flow: TaskFlowView;
}

export interface GoalExecutionStartResult {
  readonly view: GoalExecutionView;
  readonly replayed: boolean;
  readonly admitted: boolean;
  readonly scheduled: boolean;
}

export interface GoalExecutionAdvanceResult {
  readonly view: GoalExecutionView;
  readonly action: "OBSERVING" | "ADMITTED" | "WAITING" | "BLOCKED" | "COMPLETED" | "TERMINAL";
  readonly replayed: boolean;
  readonly scheduled: boolean;
}

export interface GoalExecutionRecoveryResult {
  readonly scanned: number;
  readonly reconciled: number;
  readonly admitted: number;
  readonly scheduled: number;
  readonly blocked: number;
  readonly failed: number;
}

export interface GoalPlanRevisionDraftStep {
  readonly stepId: string;
  readonly ordinal: number;
  readonly title: string;
  readonly required: boolean;
  readonly retryMode: "MANUAL";
  readonly maxAttempts: number;
}

export interface GoalPlanRevisionResult {
  readonly goalId: string;
  readonly previousPlanRevision: number;
  readonly planRevision: number;
  readonly steps: readonly GoalPlanRevisionDraftStep[];
  readonly replayed: boolean;
}


export interface GoalPlanAdoptionResult {
  readonly view: GoalExecutionView;
  readonly previousPlanRevision: number;
  readonly planRevision: number;
  readonly replayed: boolean;
  readonly action: GoalExecutionAdvanceResult["action"];
  readonly scheduled: boolean;
}

export interface GoalStepRetryResult {
  readonly view: GoalExecutionView;
  readonly blocker: GoalStepBlockerRecord | null;
  readonly action: GoalExecutionAdvanceResult["action"];
  readonly scheduled: boolean;
}

export interface GoalBlockerResolutionResult {
  readonly view: GoalExecutionView;
  readonly blocker: GoalStepBlockerRecord;
  readonly action: GoalExecutionAdvanceResult["action"];
  readonly scheduled: boolean;
}
