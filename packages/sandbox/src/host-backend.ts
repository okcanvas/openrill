import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import type { WorkspaceCatalog } from "@openrill/workspace";
import { SandboxError } from "./errors.js";
import type {
  BackendExecInput,
  BackendExecResult,
  ExecutionBackend,
  ExecutionBackendCapabilities,
  ExecutionBackendHandle,
  PreparedExecutionBackendRequest,
} from "./types.js";

const HOST_CAPABILITIES: ExecutionBackendCapabilities = {
  isolatedFilesystem: false,
  isolatedProcessNamespace: false,
  networkControl: false,
  resourceLimits: false,
  sandboxed: false,
};

export interface HostExecutionBackendOptions {
  readonly workspaces: WorkspaceCatalog;
  readonly now?: () => number;
  readonly createId?: () => string;
  readonly spawnProcess?: typeof spawn;
  readonly env?: NodeJS.ProcessEnv;
}

function boundedText(chunks: readonly Buffer[], maxBytes: number): { text: string; truncated: boolean } {
  const joined = Buffer.concat(chunks);
  const truncated = joined.length > maxBytes;
  return { text: (truncated ? joined.subarray(joined.length - maxBytes) : joined).toString("utf8"), truncated };
}

function validateExec(input: BackendExecInput): void {
  if (typeof input.executable !== "string" || input.executable.length === 0 || input.executable.length > 4096) {
    throw new SandboxError("SANDBOX_EXEC_INVALID", "executable must be a non-empty string of at most 4096 characters");
  }
  if ((input.args?.length ?? 0) > 256 || input.args?.some((value) => typeof value !== "string" || value.length > 8192)) {
    throw new SandboxError("SANDBOX_EXEC_INVALID", "argv exceeds the bounded execution contract");
  }
  if (input.timeoutMs !== undefined && (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 100 || input.timeoutMs > 3_600_000)) {
    throw new SandboxError("SANDBOX_EXEC_INVALID", "timeoutMs must be between 100 and 3600000");
  }
  if (input.maxOutputBytes !== undefined && (!Number.isInteger(input.maxOutputBytes) || input.maxOutputBytes < 1 || input.maxOutputBytes > 1_048_576)) {
    throw new SandboxError("SANDBOX_EXEC_INVALID", "maxOutputBytes must be between 1 and 1048576");
  }
}

export class HostExecutionBackend implements ExecutionBackend {
  public readonly kind = "HOST" as const;
  public readonly capabilities = HOST_CAPABILITIES;
  readonly #now: () => number;
  readonly #createId: () => string;
  readonly #spawnProcess: typeof spawn;

  public constructor(private readonly options: HostExecutionBackendOptions) {
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? randomUUID;
    this.#spawnProcess = options.spawnProcess ?? spawn;
  }

  public async doctor() {
    return { kind: this.kind, available: true, detail: "host execution available" } as const;
  }

  public async prepare(request: PreparedExecutionBackendRequest): Promise<ExecutionBackendHandle> {
    const id = this.#createId();
    const createdAt = this.#now();
    let active: ChildProcess | null = null;
    let cancelled = false;
    let closed = false;

    const exec = async (input: BackendExecInput): Promise<BackendExecResult> => {
      if (closed) throw new SandboxError("SANDBOX_CLOSED", "execution backend handle is closed");
      if (active) throw new SandboxError("SANDBOX_EXEC_FAILED", "execution backend handle already owns an active process");
      validateExec(input);
      const cwd = await this.options.workspaces.resolve(
        request.workspaceAuthority.workspaceId,
        input.cwd ?? ".",
        "READ",
        { allowRoot: true, mustExist: true },
      );
      if (cwd.kind !== "DIRECTORY") throw new SandboxError("SANDBOX_EXEC_INVALID", "cwd must resolve to a workspace directory");
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let timedOut = false;
      cancelled = false;
      const child = this.#spawnProcess(input.executable, [...(input.args ?? [])], {
        cwd: cwd.absolutePath,
        env: { ...(this.options.env ?? {}), ...(input.env ?? {}) },
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      active = child;
      input.onStarted?.({ ...(child.pid !== undefined ? { pid: child.pid } : {}) });
      child.stdout?.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        stdout.push(bytes);
        input.onStdout?.(bytes);
      });
      child.stderr?.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        stderr.push(bytes);
        input.onStderr?.(bytes);
      });
      const timeoutMs = input.timeoutMs ?? 120_000;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
      const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: Error }>((resolve) => {
        child.once("close", (code, signal) => resolve({ code, signal }));
        child.once("error", (error) => resolve({ code: null, signal: null, error }));
      });
      clearTimeout(timer);
      active = null;
      if (exit.error) throw new SandboxError("SANDBOX_EXEC_FAILED", exit.error.message, { cause: exit.error });
      const maxOutputBytes = input.maxOutputBytes ?? 65_536;
      const out = boundedText(stdout, maxOutputBytes);
      const err = boundedText(stderr, maxOutputBytes);
      return {
        exitCode: exit.code,
        signal: exit.signal,
        timedOut,
        cancelled,
        stdout: out.text,
        stderr: err.text,
        stdoutTruncated: out.truncated,
        stderrTruncated: err.truncated,
      };
    };

    const cancel = async (): Promise<void> => {
      cancelled = true;
      active?.kill();
    };

    const close = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await cancel();
    };

    return {
      id,
      kind: this.kind,
      capabilities: this.capabilities,
      workspaceAuthority: request.workspaceAuthority,
      confinementProof: {
        backend: this.kind,
        sandboxed: false,
        workspaceAuthority: request.workspaceAuthority,
        networkMode: request.networkMode,
        extraHostBinds: false,
        dockerSocketMounted: false,
      },
      createdAt,
      exec,
      cancel,
      close,
    };
  }
}

export function createHostExecutionBackend(options: HostExecutionBackendOptions): HostExecutionBackend {
  return new HostExecutionBackend(options);
}
