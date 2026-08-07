export type GoalStatus = "ACTIVE" | "PAUSED" | "BLOCKED" | "COMPLETED" | "CANCELLED";
export type PlanStepStatus = "PENDING" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";

export interface GoalPlanStep {
  readonly stepId: string;
  readonly ordinal: number;
  readonly title: string;
  readonly status: PlanStepStatus;
  readonly note: string | null;
  readonly provenance: { readonly runId: string | null; readonly attemptId: string | null };
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly updatedAt: number;
  readonly revision: number;
}

export interface GoalRecord {
  readonly goalId: string;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly objective: string;
  readonly status: GoalStatus;
  readonly lastNote: string | null;
  readonly consecutiveBlockerCount: number;
  readonly continuationCount: number;
  readonly planRevision: number;
  readonly provenance: { readonly runId: string | null; readonly attemptId: string | null };
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly terminalAt: number | null;
  readonly revision: number;
  readonly steps: readonly GoalPlanStep[];
}

export interface GoalEvent {
  readonly sequence: number;
  readonly eventType: string;
  readonly payload: unknown;
  readonly provenance: { readonly runId: string | null; readonly attemptId: string | null };
  readonly emittedAt: number;
}

export interface GoalView {
  readonly goal: GoalRecord;
  readonly recentEvents: readonly GoalEvent[];
}
