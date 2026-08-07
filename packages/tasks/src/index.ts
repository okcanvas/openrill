/** OpenRill durable background Task activity ledger boundary. */
export const PACKAGE_NAME = "@openrill/tasks" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "TASKS" as const;
export { TaskService } from "./service.js";
export { TaskMaintenanceService, type TaskMaintenanceServiceOptions } from "./maintenance.js";
export { TaskError, type TaskErrorCode } from "./errors.js";
export type { TaskRuntime, TaskStatus, TaskRecoveryState, BackgroundTask, BackgroundTaskEvent, BackgroundTaskView, TaskAuditSeverity, TaskRepairPolicy, TaskAuditCode, TaskAuditFinding, TaskAuditSummary, TaskAuditReport, TaskReconcileMode, TaskReconcileAction, TaskReconcileDecision, TaskReconcileResult, TaskRetentionCandidate, TaskRetentionPreview } from "./types.js";
export function getPackageIdentity() { return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const; }
