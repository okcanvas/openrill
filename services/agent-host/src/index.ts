export const PACKAGE_NAME = "@openrill/host" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;

export { HostLifecycleError, type HostErrorCode } from "./errors.js";
export { acquireHostLock, defaultIsPidAlive, type AcquireHostLockOptions, type HostLockHandle } from "./lock.js";
export {
  readHostLock,
  readHostMetadata,
  toPublicHostStatus,
  type HostLockPayload,
  type HostPrivateMetadata,
} from "./metadata.js";
export { evaluateControlUiHttpRequest, createLifecycleRequestHandler, type ControlUiBootstrap } from "./control-server.js";
export { ControlUiService, ControlUiServiceError, MAX_UI_ARTIFACT_FILE_BYTES, type ControlUiArtifactContent } from "./control-ui-service.js";

export {
  DEFAULT_HOST_BIND,
  DEFAULT_HOST_PORT,
  startLocalHost,
  type LocalConversationFailure,
  type LocalConversationInput,
  type LocalConversationResult,
  type LocalHostHandle,
  type StartLocalHostOptions,
} from "./lifecycle.js";
export {
  inspectLocalHost,
  stopLocalHost,
  type InspectLocalHostResult,
  type StopLocalHostResult,
} from "./control.js";

export {
  DEFAULT_HANDSHAKE_TIMEOUT_MS,
  MAX_AUTHENTICATED_PAYLOAD_BYTES,
  MAX_IDEMPOTENCY_ENTRIES,
  MAX_OUTBOUND_BUFFER_BYTES,
  MAX_PREAUTH_PAYLOAD_BYTES,
  attachLocalProtocolServer,
  type LocalProtocolServerHandle,
  type LocalProtocolServerOptions,
} from "./transport/protocol-server.js";
export { evaluateProtocolUpgrade, type UpgradePolicyDecision } from "./transport/upgrade-policy.js";
export { NoticeWindow, type NoticeReplay } from "./transport/notice-window.js";

export { ConfiguredModelResolver, type ConfiguredModelResolverOptions } from "./model-resolver.js";
export { AgentRunCoordinator, type AgentRunCoordinatorOptions } from "./run-coordinator.js";

export { SkillRunService, resolveManagedSkillRoots, type SkillRunServiceOptions, type ResolvedRunSkills } from "./skill-run-service.js";

export { MaintenanceRetentionCoordinator, type MaintenanceRetentionCoordinatorOptions, type MaintenanceRetentionBatchResult, type MaintenanceRetentionCandidateView, type MaintenanceRetentionMode, type MaintenanceRetentionState } from "./maintenance-retention.js";
