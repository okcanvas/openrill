import type { BackgroundTask } from "@openrill/tasks";

export type TaskFlowStatus = "QUEUED" | "RUNNING" | "WAITING" | "BLOCKED" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "LOST";

export interface TaskFlow {
  readonly flowId: string;
  readonly workspaceId: string;
  readonly ownerKey: string;
  readonly controllerId: string;
  readonly goal: string;
  readonly status: TaskFlowStatus;
  readonly currentStep: string | null;
  readonly blockedTaskId: string | null;
  readonly blockedSummary: string | null;
  readonly state: unknown;
  readonly wait: unknown;
  readonly cancelRequestedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly endedAt: number | null;
  readonly cleanupAfter: number | null;
  readonly revision: number;
}

export interface TaskFlowEvent {
  readonly sequence: number;
  readonly eventType: string;
  readonly status: TaskFlowStatus;
  readonly revision: number;
  readonly payload: unknown;
  readonly emittedAt: number;
}

export interface TaskFlowTaskLink {
  readonly taskId: string;
  readonly stepKey: string | null;
  readonly linkedAt: number;
  readonly task: BackgroundTask;
}

export interface TaskFlowView {
  readonly flow: TaskFlow;
  readonly tasks: readonly TaskFlowTaskLink[];
  readonly events: readonly TaskFlowEvent[];
}

export type TaskFlowAuditSeverity = "WARN" | "ERROR";
export type TaskFlowRepairPolicy = "SAFE_REPAIR" | "REPORT_ONLY";
export type TaskFlowAuditCode =
  | "FLOW_STALE_RUNNING"
  | "FLOW_STALE_WAITING"
  | "FLOW_STALE_BLOCKED"
  | "FLOW_CANCEL_STUCK"
  | "FLOW_CANCEL_FINALIZATION_PENDING"
  | "FLOW_WITHOUT_TASKS"
  | "FLOW_BLOCKED_TASK_MISSING"
  | "FLOW_TERMINAL_WITH_ACTIVE_TASK"
  | "FLOW_OWNER_SCOPE_MISMATCH"
  | "FLOW_ALL_CHILDREN_TERMINAL_ACTIVE"
  | "FLOW_MISSING_CLEANUP"
  | "FLOW_RETENTION_EXPIRED"
  | "FLOW_INCONSISTENT_TIMESTAMPS";

export interface TaskFlowAuditFinding {
  readonly severity: TaskFlowAuditSeverity;
  readonly code: TaskFlowAuditCode;
  readonly repairPolicy: TaskFlowRepairPolicy;
  readonly flowId: string;
  readonly detail: string;
  readonly ageMs: number | null;
  readonly taskId: string | null;
}

export interface TaskFlowAuditSummary {
  readonly total: number;
  readonly warnings: number;
  readonly errors: number;
  readonly byCode: Readonly<Record<TaskFlowAuditCode, number>>;
}

export interface TaskFlowAuditReport {
  readonly generatedAt: number;
  readonly findings: readonly TaskFlowAuditFinding[];
  readonly summary: TaskFlowAuditSummary;
}

export type TaskFlowReconcileMode = "PREVIEW" | "APPLY";
export type TaskFlowReconcileAction = "REPLAY_CANCELLATION" | "FINALIZE_CANCELLED" | "SCHEDULE_RETENTION";

export interface TaskFlowReconcileDecision {
  readonly flowId: string;
  readonly action: TaskFlowReconcileAction;
  readonly applied: boolean;
  readonly detail: string;
}

export interface TaskFlowReconcileResult {
  readonly mode: TaskFlowReconcileMode;
  readonly generatedAt: number;
  readonly decisions: readonly TaskFlowReconcileDecision[];
  readonly cancellationReplayed: number;
  readonly cancelled: number;
  readonly retentionScheduled: number;
}

export interface TaskFlowRetentionCandidate {
  readonly flowId: string;
  readonly ownerKey: string;
  readonly status: TaskFlowStatus;
  readonly endedAt: number;
  readonly cleanupAfter: number;
}

export interface TaskFlowRetentionPreview {
  readonly generatedAt: number;
  readonly candidates: readonly TaskFlowRetentionCandidate[];
  readonly protectedActive: number;
}

