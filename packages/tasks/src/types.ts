export type TaskRuntime = "CONVERSATION" | "DELEGATION" | "AUTOMATION";
export type TaskStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "LOST";
export type TaskRecoveryState = "NONE" | "RESUMABLE" | "NON_RESUMABLE";
export type TaskNotifyPolicy = "DONE_ONLY" | "STATE_CHANGES" | "SILENT";
export type TaskDeliveryStatus = "PENDING" | "SESSION_QUEUED" | "DELIVERED" | "FAILED" | "NOT_APPLICABLE";
export type TaskTerminalOutcome = "SUCCEEDED" | "BLOCKED";

export interface BackgroundTask {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly runId: string;
  readonly parentTaskId: string | null;
  readonly runtime: TaskRuntime;
  readonly taskKind: string;
  readonly sourceId: string | null;
  readonly task: string;
  readonly status: TaskStatus;
  readonly recoveryState: TaskRecoveryState;
  readonly notifyPolicy: TaskNotifyPolicy;
  readonly deliveryStatus: TaskDeliveryStatus;
  readonly terminalOutcome: TaskTerminalOutcome | null;
  readonly progressSummary: string | null;
  readonly terminalSummary: string | null;
  readonly errorCode: string | null;
  readonly createdAt: number;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly updatedAt: number;
  readonly cleanupAfter: number | null;
  readonly revision: number;
}

export interface BackgroundTaskEvent {
  readonly sequence: number;
  readonly eventType: string;
  readonly status: TaskStatus;
  readonly recoveryState: TaskRecoveryState;
  readonly payload: unknown;
  readonly runEventSequence: number | null;
  readonly emittedAt: number;
}


export interface BackgroundTaskDelivery {
  readonly deliveryId: string;
  readonly taskEventSequence: number;
  readonly flowId: string | null;
  readonly ownerConversationId: string;
  readonly controllerId: string | null;
  readonly notifyPolicy: TaskNotifyPolicy;
  readonly deliveryStatus: TaskDeliveryStatus;
  readonly taskStatus: TaskStatus;
  readonly terminalOutcome: TaskTerminalOutcome | null;
  readonly payload: unknown;
  readonly attemptCount: number;
  readonly lastError: string | null;
  readonly systemMessageId: string | null;
  readonly wakeRunId: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly deliveredAt: number | null;
  readonly revision: number;
}

export interface BackgroundTaskView {
  readonly task: BackgroundTask;
  readonly events: readonly BackgroundTaskEvent[];
  readonly deliveries: readonly BackgroundTaskDelivery[];
}

export type TaskAuditSeverity = "WARN" | "ERROR";
export type TaskRepairPolicy = "SAFE_REPAIR" | "REPORT_ONLY";
export type TaskAuditCode =
  | "TASK_RUN_STATUS_DRIFT"
  | "TASK_TERMINAL_RUN_ACTIVE"
  | "RUNTIME_AUTHORITY_MISSING"
  | "STALE_QUEUED"
  | "STALE_RUNNING"
  | "MISSING_CLEANUP"
  | "LOST_RETAINED"
  | "LOST_RETENTION_EXPIRED"
  | "OWNER_SCOPE_MISMATCH"
  | "INCONSISTENT_TIMESTAMPS";

export interface TaskAuditFinding {
  readonly severity: TaskAuditSeverity;
  readonly code: TaskAuditCode;
  readonly repairPolicy: TaskRepairPolicy;
  readonly taskId: string;
  readonly runId: string;
  readonly detail: string;
  readonly ageMs: number | null;
}

export interface TaskAuditSummary {
  readonly total: number;
  readonly warnings: number;
  readonly errors: number;
  readonly byCode: Readonly<Record<TaskAuditCode, number>>;
}

export interface TaskAuditReport {
  readonly generatedAt: number;
  readonly findings: readonly TaskAuditFinding[];
  readonly summary: TaskAuditSummary;
}

export type TaskReconcileMode = "PREVIEW" | "APPLY";
export type TaskReconcileAction = "SYNC_RUN_STATUS" | "MARK_RUNTIME_LOST" | "SCHEDULE_RETENTION";

export interface TaskReconcileDecision {
  readonly taskId: string;
  readonly runId: string;
  readonly action: TaskReconcileAction;
  readonly applied: boolean;
  readonly detail: string;
}

export interface TaskReconcileResult {
  readonly mode: TaskReconcileMode;
  readonly generatedAt: number;
  readonly decisions: readonly TaskReconcileDecision[];
  readonly reconciled: number;
  readonly lost: number;
  readonly retentionScheduled: number;
}

export interface TaskRetentionCandidate {
  readonly taskId: string;
  readonly runId: string;
  readonly status: TaskStatus;
  readonly endedAt: number;
  readonly cleanupAfter: number;
}

export interface TaskRetentionPreview {
  readonly generatedAt: number;
  readonly candidates: readonly TaskRetentionCandidate[];
  readonly protectedActive: number;
}
