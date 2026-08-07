/** OpenRill durable Goal Plan to Task Flow executor boundary. */
export const PACKAGE_NAME = "@openrill/goal-executor" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "GOAL_EXECUTOR" as const;
export { GoalPlanExecutorService, type GoalPlanExecutorServiceOptions } from "./service.js";
export { GoalExecutorError, type GoalExecutorErrorCode } from "./errors.js";
export type {
  GoalExecutionStatus,
  GoalStepExecutionStatus,
  GoalExecutionRecord,
  GoalStepExecutionRecord,
  GoalExecutionView,
  GoalExecutionStartResult,
  GoalExecutionAdvanceResult,
  GoalExecutionRecoveryResult,
  GoalStepBlockerRecord,
  GoalPlanRevisionDraftStep,
  GoalPlanRevisionResult,
  GoalPlanAdoptionResult,
  GoalStepRetryResult,
  GoalBlockerResolutionResult,
} from "./types.js";
export function getPackageIdentity() { return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const; }
