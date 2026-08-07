export type TaskErrorCode = "TASK_INVALID_ARGUMENT" | "TASK_NOT_FOUND" | "TASK_ACCESS_DENIED" | "TASK_STATE_INVALID";
export class TaskError extends Error {
  public constructor(public readonly code: TaskErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaskError";
  }
}
