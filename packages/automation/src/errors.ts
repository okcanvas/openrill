export type AutomationErrorCode =
  | "AUTOMATION_INVALID_ARGUMENT"
  | "AUTOMATION_INVALID_TIMEZONE"
  | "AUTOMATION_INVALID_SCHEDULE"
  | "AUTOMATION_SCHEDULE_IN_PAST"
  | "AUTOMATION_SCHEDULE_NO_FUTURE"
  | "AUTOMATION_JOB_NOT_FOUND"
  | "AUTOMATION_REVISION_CONFLICT"
  | "AUTOMATION_REQUEST_CONFLICT"
  | "AUTOMATION_SCHEDULER_NOT_STARTED"
  | "AUTOMATION_SCHEDULER_CLOSED"
  | "AUTOMATION_LEASE_LOST";

export class AutomationError extends Error {
  public constructor(
    public readonly code: AutomationErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AutomationError";
  }
}
