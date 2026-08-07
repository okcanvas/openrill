export type AutomationSchedule =
  | { readonly kind: "at"; readonly at: string }
  | { readonly kind: "interval"; readonly everyMs: number; readonly anchorMs: number }
  | { readonly kind: "cron"; readonly expression: string };

export type AutomationCatchUpPolicy =
  | { readonly kind: "SKIP" }
  | { readonly kind: "RUN_ONCE" }
  | { readonly kind: "BOUNDED"; readonly limit: number };

export interface AutomationFailurePolicy {
  readonly backoffMs: number;
  readonly maxConsecutiveFailures: number;
  readonly autoDisable: boolean;
}

export interface AutomationConversationTemplate {
  readonly workspaceId: string;
  readonly prompt: string;
  readonly modelProfile?: string;
  readonly title?: string;
}

export interface AutomationJobConfig {
  readonly name: string;
  readonly enabled: boolean;
  readonly schedule: AutomationSchedule;
  readonly timezone: string;
  readonly conversationTemplate: AutomationConversationTemplate;
  readonly catchUpPolicy: AutomationCatchUpPolicy;
  readonly failurePolicy: AutomationFailurePolicy;
}

export interface AutomationJobRuntime {
  readonly nextScheduledFor: number | null;
  readonly lastScheduledFor: number | null;
  readonly consecutiveFailures: number;
}

export interface AutomationJob {
  readonly jobId: string;
  readonly revision: number;
  readonly config: AutomationJobConfig;
  readonly runtime: AutomationJobRuntime;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type AutomationRunStatus =
  | "PENDING"
  | "CLAIMED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED"
  | "CANCELLED";

export type AutomationRunTriggerKind = "SCHEDULED" | "MANUAL";

export interface AutomationRun {
  readonly automationRunId: string;
  readonly jobId: string;
  readonly scheduledFor: number;
  readonly triggerKind: AutomationRunTriggerKind;
  readonly requestKey: string | null;
  readonly claimedAt: number | null;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: number | null;
  readonly runId: string | null;
  readonly status: AutomationRunStatus;
  readonly attempt: number;
  readonly errorCode: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateAutomationJobInput extends AutomationJobConfig {}

export interface UpdateAutomationJobPatch {
  readonly name?: string;
  readonly enabled?: boolean;
  readonly schedule?: AutomationSchedule;
  readonly timezone?: string;
  readonly conversationTemplate?: AutomationConversationTemplate;
  readonly catchUpPolicy?: AutomationCatchUpPolicy;
  readonly failurePolicy?: AutomationFailurePolicy;
}


export interface AutomationExecutionContext {
  readonly job: AutomationJob;
  readonly run: AutomationRun;
  readonly bindRunId: (runId: string) => AutomationRun;
  readonly signal: AbortSignal;
}

export type AutomationExecutionResult =
  | { readonly status: "SUCCEEDED"; readonly runId?: string }
  | { readonly status: "FAILED"; readonly errorCode: string; readonly runId?: string };

export type AutomationSchedulerState = "STOPPED" | "STARTED" | "CLOSING" | "CLOSED";

export interface AutomationSchedulerStatus {
  readonly state: AutomationSchedulerState;
  readonly ownerId: string;
  readonly timerArmed: boolean;
  readonly activeRuns: number;
  readonly lastWakeAt: number | null;
  readonly recoveredClaims: number;
  readonly interruptedRuns: number;
}

export interface AutomationSchedulerWakeResult {
  readonly materializedRuns: number;
  readonly skippedRuns: number;
  readonly claimedRuns: number;
  readonly succeededRuns: number;
  readonly failedRuns: number;
}
