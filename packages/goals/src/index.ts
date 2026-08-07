/** OpenRill durable goal, plan, and long-running progress boundary. */
export const PACKAGE_NAME = "@openrill/goals" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "GOALS" as const;

export { GoalError, type GoalErrorCode } from "./errors.js";
export { GoalService, GOAL_SYSTEM_INSTRUCTIONS } from "./service.js";
export type { GoalStatus, PlanStepStatus, GoalPlanStep, GoalRecord, GoalEvent, GoalView } from "./types.js";

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}
