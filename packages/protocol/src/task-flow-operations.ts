export type TaskFlowStatus = "QUEUED" | "RUNNING" | "WAITING" | "BLOCKED" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "LOST";

export interface TaskFlowControllerIdentityInput {
  readonly workspaceId: string;
  readonly ownerKey: string;
  readonly controllerId: string;
}

export interface TaskFlowListInput {
  readonly workspaceId: string;
  readonly ownerKey: string;
  readonly status?: TaskFlowStatus;
  readonly controllerId?: string;
  readonly limit?: number;
}
export interface TaskFlowGetInput { readonly workspaceId: string; readonly ownerKey: string; readonly flowId: string; }
export interface TaskFlowCancelInput { readonly workspaceId: string; readonly ownerKey: string; readonly flowId: string; readonly expectedRevision: number; }

export interface TaskFlowCreateInput extends TaskFlowControllerIdentityInput {
  readonly requestKey: string;
  readonly goal: string;
  readonly currentStep?: string | null;
  readonly state?: unknown;
  readonly status?: "QUEUED" | "RUNNING";
}

export interface TaskFlowRunInput extends TaskFlowControllerIdentityInput {
  readonly flowId: string;
  readonly expectedRevision: number;
  readonly requestKey: string;
  readonly stepKey: string;
  readonly text: string;
}

export interface TaskFlowWaitInput extends TaskFlowControllerIdentityInput {
  readonly flowId: string;
  readonly expectedRevision: number;
  readonly currentStep?: string | null;
  readonly state?: unknown;
  readonly wait?: unknown;
}

export interface TaskFlowResumeInput extends TaskFlowControllerIdentityInput {
  readonly flowId: string;
  readonly expectedRevision: number;
  readonly status?: "QUEUED" | "RUNNING";
  readonly currentStep?: string | null;
  readonly state?: unknown;
}

export interface TaskFlowFinishInput extends TaskFlowControllerIdentityInput {
  readonly flowId: string;
  readonly expectedRevision: number;
  readonly state?: unknown;
}

export interface TaskFlowFailInput extends TaskFlowControllerIdentityInput {
  readonly flowId: string;
  readonly expectedRevision: number;
  readonly state?: unknown;
  readonly blockedSummary?: string | null;
}

export type TaskFlowReconcileMode = "PREVIEW" | "APPLY";
export interface TaskFlowAuditInput { readonly workspaceId: string; readonly ownerKey: string; readonly limit?: number; }
export interface TaskFlowReconcileInput { readonly workspaceId: string; readonly ownerKey: string; readonly mode: TaskFlowReconcileMode; readonly limit?: number; }
export interface TaskFlowRetentionPreviewInput { readonly workspaceId: string; readonly ownerKey: string; readonly limit?: number; }
