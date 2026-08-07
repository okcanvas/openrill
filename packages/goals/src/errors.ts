export type GoalErrorCode =
  | "GOAL_INPUT_INVALID"
  | "GOAL_NOT_FOUND"
  | "GOAL_ALREADY_OPEN"
  | "GOAL_REVISION_CONFLICT"
  | "GOAL_TRANSITION_INVALID"
  | "GOAL_PLAN_INVALID"
  | "GOAL_COMPLETION_UNPROVEN"
  | "GOAL_EXECUTION_ACTIVE"
  | "GOAL_PROVENANCE_INVALID";

export class GoalError extends Error {
  public constructor(public readonly code: GoalErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GoalError";
  }
}
