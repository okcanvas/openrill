/** OpenRill durable Task Flow orchestration state boundary. */
export const PACKAGE_NAME = "@openrill/task-flows" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "TASK_FLOWS" as const;
export { TaskFlowService } from "./service.js";
export type { TaskFlowMutationContext, TaskFlowMutationHook } from "./service.js";
export { TaskFlowMaintenanceService, type TaskFlowMaintenanceServiceOptions } from "./maintenance.js";
export { BoundTaskFlowControllerRuntime, TaskFlowControllerRuntimeFactory, type BoundTaskFlowControllerRuntimeOptions, type TaskFlowControllerRuntimeFactoryOptions, type ManagedTaskFlowCreateResult, type TaskFlowChildAdmissionResult, type TaskFlowControllerRuntime, type ManagedTaskFlowCreateHookContext, type ManagedTaskFlowCreateHook, type TaskFlowChildAdmissionHookContext, type TaskFlowChildAdmissionHook } from "./controller-runtime.js";
export { TaskFlowError, type TaskFlowErrorCode } from "./errors.js";
export type { TaskFlowStatus, TaskFlow, TaskFlowEvent, TaskFlowTaskLink, TaskFlowView, TaskFlowAuditSeverity, TaskFlowRepairPolicy, TaskFlowAuditCode, TaskFlowAuditFinding, TaskFlowAuditSummary, TaskFlowAuditReport, TaskFlowReconcileMode, TaskFlowReconcileAction, TaskFlowReconcileDecision, TaskFlowReconcileResult, TaskFlowRetentionCandidate, TaskFlowRetentionPreview } from "./types.js";
export function getPackageIdentity() { return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const; }
export { TaskCompletionDeliveryService } from "./completion-delivery.js";
export type { TaskCompletionDeliveryBinding, TaskCompletionDeliveryDispatchResult, TaskCompletionDeliveryDrainResult, TaskCompletionDeliveryServiceOptions } from "./completion-delivery.js";
