export type TaskFlowErrorCode =
  | "TASK_FLOW_INVALID_ARGUMENT"
  | "TASK_FLOW_NOT_FOUND"
  | "TASK_FLOW_ACCESS_DENIED"
  | "TASK_FLOW_REVISION_CONFLICT"
  | "TASK_FLOW_STATE_INVALID"
  | "TASK_FLOW_TASK_CONFLICT"
  | "TASK_FLOW_REQUEST_CONFLICT"
  | "TASK_FLOW_EXECUTOR_UNAVAILABLE";

export class TaskFlowError extends Error {
  public constructor(public readonly code: TaskFlowErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaskFlowError";
  }
}
