import type { WorkspaceCatalog } from "@openrill/workspace";
import { SandboxError } from "./errors.js";
import type {
  ExecutionBackendPolicy,
  ExecutionBackendRequest,
  PreparedExecutionBackendRequest,
  SandboxFallbackMode,
} from "./types.js";

export async function prepareExecutionBackendRequest(
  workspaces: WorkspaceCatalog,
  request: ExecutionBackendRequest,
  policy: ExecutionBackendPolicy = {},
): Promise<PreparedExecutionBackendRequest> {
  if (typeof request.workspaceId !== "string" || request.workspaceId.length === 0 || request.workspaceId.length > 128) {
    throw new SandboxError("SANDBOX_WORKSPACE_INVALID", "workspaceId must be a non-empty string of at most 128 characters");
  }
  if ((request.extraHostBinds?.length ?? 0) > 0) {
    throw new SandboxError("SANDBOX_EXTRA_BIND_DENIED", "additional host bind mounts are denied");
  }
  if (request.mountDockerSocket === true) {
    throw new SandboxError("SANDBOX_DOCKER_SOCKET_DENIED", "Docker socket mounting is denied");
  }

  const root = await workspaces.resolve(request.workspaceId, ".", "READ", { allowRoot: true, mustExist: true });
  if (root.kind !== "DIRECTORY") {
    throw new SandboxError("SANDBOX_WORKSPACE_INVALID", "workspace root must resolve to a directory");
  }
  const mountMode = request.mountMode ?? "READ_ONLY";
  if (mountMode === "READ_WRITE" && root.workspace.accessMode !== "READ_WRITE") {
    throw new SandboxError("SANDBOX_READ_WRITE_DENIED", `workspace is read-only: ${request.workspaceId}`);
  }

  const networkMode = request.networkMode ?? "NONE";
  if (networkMode === "OUTBOUND" && policy.allowOutboundNetwork !== true) {
    throw new SandboxError("SANDBOX_NETWORK_DENIED", "outbound sandbox networking requires explicit policy allowance");
  }

  const fallback: SandboxFallbackMode = request.fallback ?? "DENY";
  if (fallback === "HOST" && policy.allowHostFallback !== true) {
    throw new SandboxError("SANDBOX_HOST_FALLBACK_DENIED", "host fallback requires explicit policy allowance");
  }

  return {
    workspaceAuthority: {
      workspaceId: root.workspaceId,
      canonicalRoot: root.workspace.canonicalRoot,
      workspaceAccessMode: root.workspace.accessMode,
      mountMode,
      containerPath: "/workspace",
    },
    networkMode,
    fallback,
  };
}

export function selectExecutionBackend(
  preferred: "DOCKER" | "HOST",
  dockerAvailable: boolean,
  fallback: SandboxFallbackMode,
): "DOCKER" | "HOST" {
  if (preferred === "HOST") return "HOST";
  if (dockerAvailable) return "DOCKER";
  if (fallback === "HOST") return "HOST";
  throw new SandboxError("SANDBOX_BACKEND_UNAVAILABLE", "Docker backend is unavailable and host fallback is denied");
}
