/** OpenRill durable automation domain, scheduler lifecycle, and lease boundary. */
export const PACKAGE_NAME = "@openrill/automation" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "AUTOMATION" as const;

export interface PackageIdentity {
  readonly name: typeof PACKAGE_NAME;
  readonly version: typeof PACKAGE_VERSION;
  readonly boundary: typeof PACKAGE_BOUNDARY;
}

export function getPackageIdentity(): PackageIdentity {
  return {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    boundary: PACKAGE_BOUNDARY,
  };
}

export { AutomationError, type AutomationErrorCode } from "./errors.js";
export {
  assertFutureSchedule,
  computeNextScheduledFor,
  normalizeSchedule,
  normalizeTimezone,
  parseCronExpression,
} from "./schedule.js";
export {
  AutomationDefinitionService,
  type AutomationDefinitionServiceOptions,
} from "./service.js";
export { AutomationScheduler, type AutomationSchedulerOptions } from "./scheduler.js";
export type {
  AutomationSchedule,
  AutomationCatchUpPolicy,
  AutomationFailurePolicy,
  AutomationConversationTemplate,
  AutomationJobConfig,
  AutomationJobRuntime,
  AutomationJob,
  AutomationRunStatus,
  AutomationRunTriggerKind,
  AutomationRun,
  CreateAutomationJobInput,
  UpdateAutomationJobPatch,
  AutomationExecutionContext,
  AutomationExecutionResult,
  AutomationSchedulerState,
  AutomationSchedulerStatus,
  AutomationSchedulerWakeResult,
} from "./types.js";
