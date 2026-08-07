import type { WorkspaceAccessMode } from "@openrill/workspace";

export type ExecutionBackendKind = "HOST" | "DOCKER";
export type SandboxMountMode = "READ_ONLY" | "READ_WRITE";
export type SandboxNetworkMode = "NONE" | "OUTBOUND";
export type SandboxFallbackMode = "DENY" | "HOST";

export interface ExecutionBackendCapabilities {
  readonly isolatedFilesystem: boolean;
  readonly isolatedProcessNamespace: boolean;
  readonly networkControl: boolean;
  readonly resourceLimits: boolean;
  readonly sandboxed: boolean;
}

export interface WorkspaceAuthority {
  readonly workspaceId: string;
  readonly canonicalRoot: string;
  readonly workspaceAccessMode: WorkspaceAccessMode;
  readonly mountMode: SandboxMountMode;
  readonly containerPath: "/workspace";
}

export interface ConfinementProof {
  readonly backend: ExecutionBackendKind;
  readonly sandboxed: boolean;
  readonly workspaceAuthority: WorkspaceAuthority;
  readonly networkMode: SandboxNetworkMode;
  readonly extraHostBinds: false;
  readonly dockerSocketMounted: false;
}

export interface ExecutionBackendRequest {
  readonly workspaceId: string;
  readonly mountMode?: SandboxMountMode;
  readonly networkMode?: SandboxNetworkMode;
  readonly fallback?: SandboxFallbackMode;
  readonly extraHostBinds?: readonly {
    readonly source: string;
    readonly target: string;
    readonly mode: SandboxMountMode;
  }[];
  readonly mountDockerSocket?: boolean;
}

export interface ExecutionBackendPolicy {
  readonly allowOutboundNetwork?: boolean;
  readonly allowHostFallback?: boolean;
}

export interface PreparedExecutionBackendRequest {
  readonly workspaceAuthority: WorkspaceAuthority;
  readonly networkMode: SandboxNetworkMode;
  readonly fallback: SandboxFallbackMode;
}

export interface BackendProcessStart {
  readonly pid?: number;
  readonly runtimeId?: string;
}

export interface BackendExecInput {
  readonly executable: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly onStarted?: (event: BackendProcessStart) => void;
  readonly onStdout?: (chunk: Uint8Array) => void;
  readonly onStderr?: (chunk: Uint8Array) => void;
}

export interface BackendExecResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}

export interface ExecutionBackendHandle {
  readonly id: string;
  readonly kind: ExecutionBackendKind;
  readonly capabilities: ExecutionBackendCapabilities;
  readonly workspaceAuthority: WorkspaceAuthority;
  readonly confinementProof: ConfinementProof;
  readonly createdAt: number;
  exec(input: BackendExecInput): Promise<BackendExecResult>;
  cancel(): Promise<void>;
  close(): Promise<void>;
}

export interface ExecutionBackend {
  readonly kind: ExecutionBackendKind;
  readonly capabilities: ExecutionBackendCapabilities;
  doctor(): Promise<BackendAvailability>;
  prepare(request: PreparedExecutionBackendRequest): Promise<ExecutionBackendHandle>;
}

export interface BackendAvailability {
  readonly kind: ExecutionBackendKind;
  readonly available: boolean;
  readonly detail: string;
}
