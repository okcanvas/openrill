/** OpenRill execution backend and confinement-policy boundary. */
export const PACKAGE_NAME = "@openrill/sandbox" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "SANDBOX" as const;

export { SandboxError, type SandboxErrorCode } from "./errors.js";
export { HostExecutionBackend, createHostExecutionBackend, type HostExecutionBackendOptions } from "./host-backend.js";
export { prepareExecutionBackendRequest, selectExecutionBackend } from "./policy.js";
export type {
  BackendAvailability,
  BackendExecInput,
  BackendExecResult,
  BackendProcessStart,
  ConfinementProof,
  ExecutionBackend,
  ExecutionBackendCapabilities,
  ExecutionBackendHandle,
  ExecutionBackendKind,
  ExecutionBackendPolicy,
  ExecutionBackendRequest,
  PreparedExecutionBackendRequest,
  SandboxFallbackMode,
  SandboxMountMode,
  SandboxNetworkMode,
  WorkspaceAuthority,
} from "./types.js";

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}
