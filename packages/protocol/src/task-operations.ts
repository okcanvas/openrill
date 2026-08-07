export type TaskRuntime = "CONVERSATION" | "DELEGATION" | "AUTOMATION";
export type TaskStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "LOST";
export interface TaskListInput {
  readonly workspaceId: string;
  readonly status?: TaskStatus;
  readonly runtime?: TaskRuntime;
  readonly limit?: number;
}
export interface TaskGetInput { readonly workspaceId: string; readonly taskId: string; }
export interface TaskCancelInput { readonly workspaceId: string; readonly taskId: string; }

export type TaskReconcileMode = "PREVIEW" | "APPLY";
export interface TaskAuditInput { readonly workspaceId: string; readonly limit?: number; }
export interface TaskReconcileInput { readonly workspaceId: string; readonly mode: TaskReconcileMode; readonly limit?: number; }
export interface TaskRetentionPreviewInput { readonly workspaceId: string; readonly limit?: number; }
