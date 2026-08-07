export type GoalExecutorErrorCode =
  | "GOAL_EXECUTION_NOT_FOUND"
  | "GOAL_EXECUTION_ALREADY_EXISTS"
  | "GOAL_EXECUTION_ACCESS_DENIED"
  | "GOAL_EXECUTION_REVISION_CONFLICT"
  | "GOAL_EXECUTION_STATE_INVALID"
  | "GOAL_EXECUTION_PLAN_INVALID"
  | "GOAL_EXECUTION_REQUEST_CONFLICT"
  | "GOAL_EXECUTION_STALE_DECISION"
  | "GOAL_EXECUTION_RETRY_LIMIT"
  | "GOAL_EXECUTION_BLOCKER_REQUIRED";

export class GoalExecutorError extends Error {
  public constructor(public readonly code: GoalExecutorErrorCode, message: string) {
    super(message);
    this.name = "GoalExecutorError";
  }
}
