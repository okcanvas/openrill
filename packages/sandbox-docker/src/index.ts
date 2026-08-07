import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  SandboxError,
  type BackendAvailability,
  type BackendExecInput,
  type BackendExecResult,
  type ExecutionBackend,
  type ExecutionBackendCapabilities,
  type ExecutionBackendHandle,
  type PreparedExecutionBackendRequest,
} from "@openrill/sandbox";

export const PACKAGE_NAME = "@openrill/sandbox-docker" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "SANDBOX_DOCKER" as const;

export interface DockerCliResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export interface DockerCliRunOptions {
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly onStdout?: (chunk: Uint8Array) => void;
  readonly onStderr?: (chunk: Uint8Array) => void;
}

export interface DockerCli {
  run(args: readonly string[], options?: DockerCliRunOptions): Promise<DockerCliResult>;
}

export interface DockerExecutionBackendOptions {
  readonly cli?: DockerCli;
  readonly image: string;
  readonly profile: string;
  readonly now?: () => number;
  readonly createId?: () => string;
  readonly memoryBytes?: number;
  readonly pidsLimit?: number;
}

const DOCKER_CAPABILITIES: ExecutionBackendCapabilities = {
  isolatedFilesystem: true,
  isolatedProcessNamespace: true,
  networkControl: true,
  resourceLimits: true,
  sandboxed: true,
};

function validateImage(image: string): void {
  if (!/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(image)) {
    throw new SandboxError("SANDBOX_IMAGE_NOT_PINNED", "Docker image must be pinned by sha256 digest");
  }
}

function validateProfile(profile: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(profile)) {
    throw new SandboxError("SANDBOX_START_FAILED", "Docker profile label is invalid");
  }
}

function validateExec(input: BackendExecInput): void {
  if (typeof input.executable !== "string" || input.executable.length === 0 || input.executable.length > 4096) {
    throw new SandboxError("SANDBOX_EXEC_INVALID", "executable must be a non-empty bounded string");
  }
  if ((input.args?.length ?? 0) > 256 || input.args?.some((item) => typeof item !== "string" || item.length > 8192)) {
    throw new SandboxError("SANDBOX_EXEC_INVALID", "argv exceeds the bounded execution contract");
  }
  if (input.timeoutMs !== undefined && (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 100 || input.timeoutMs > 3_600_000)) {
    throw new SandboxError("SANDBOX_EXEC_INVALID", "timeoutMs must be between 100 and 3600000");
  }
  if (input.maxOutputBytes !== undefined && (!Number.isInteger(input.maxOutputBytes) || input.maxOutputBytes < 1 || input.maxOutputBytes > 1_048_576)) {
    throw new SandboxError("SANDBOX_EXEC_INVALID", "maxOutputBytes must be between 1 and 1048576");
  }
  if (input.env && Object.entries(input.env).some(([name, value]) => !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) || value.length > 65_536)) {
    throw new SandboxError("SANDBOX_EXEC_INVALID", "environment exceeds the bounded execution contract");
  }
}

class BoundedCollector {
  readonly #chunks: Buffer[] = [];
  #bytes = 0;
  public constructor(private readonly maxBytes: number) {}
  public push(chunk: Buffer): void {
    this.#chunks.push(chunk);
    this.#bytes += chunk.length;
    while (this.#bytes > this.maxBytes && this.#chunks.length > 0) {
      const first = this.#chunks[0]!;
      const overflow = this.#bytes - this.maxBytes;
      if (first.length <= overflow) {
        this.#chunks.shift();
        this.#bytes -= first.length;
      } else {
        this.#chunks[0] = first.subarray(overflow);
        this.#bytes -= overflow;
      }
    }
  }
  public text(): string { return Buffer.concat(this.#chunks).toString("utf8"); }
}

export function createNodeDockerCli(executable = "docker"): DockerCli {
  return {
    async run(args, options = {}) {
      return await new Promise<DockerCliResult>((resolve, reject) => {
        const maxOutputBytes = options.maxOutputBytes ?? 1_048_576;
        const stdout = new BoundedCollector(maxOutputBytes);
        const stderr = new BoundedCollector(maxOutputBytes);
        let timedOut = false;
        let settled = false;
        const child = spawn(executable, [...args], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        child.stdout?.on("data", (chunk: Buffer | string) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          stdout.push(bytes);
          options.onStdout?.(bytes);
        });
        child.stderr?.on("data", (chunk: Buffer | string) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          stderr.push(bytes);
          options.onStderr?.(bytes);
        });
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill();
        }, options.timeoutMs ?? 30_000);
        child.once("error", (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
        child.once("close", (code, signal) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ exitCode: code, signal, timedOut, stdout: stdout.text(), stderr: stderr.text() });
        });
      });
    },
  };
}

function mountArgument(source: string, readOnly: boolean): string {
  if (source.includes(",") || source.includes("\n") || source.includes("\r")) {
    throw new SandboxError("SANDBOX_DOCKER_PATH_UNSUPPORTED", "workspace root cannot be represented safely in Docker --mount syntax");
  }
  return `type=bind,source=${source},target=/workspace${readOnly ? ",readonly" : ""}`;
}

function bounded(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(text, "utf8");
  const truncated = bytes.length > maxBytes;
  return { text: (truncated ? bytes.subarray(bytes.length - maxBytes) : bytes).toString("utf8"), truncated };
}

export class DockerExecutionBackend implements ExecutionBackend {
  public readonly kind = "DOCKER" as const;
  public readonly capabilities = DOCKER_CAPABILITIES;
  readonly #cli: DockerCli;
  readonly #now: () => number;
  readonly #createId: () => string;
  readonly #memoryBytes: number;
  readonly #pidsLimit: number;

  public constructor(private readonly options: DockerExecutionBackendOptions) {
    validateImage(options.image);
    validateProfile(options.profile);
    this.#cli = options.cli ?? createNodeDockerCli();
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? randomUUID;
    this.#memoryBytes = options.memoryBytes ?? 536_870_912;
    this.#pidsLimit = options.pidsLimit ?? 256;
  }

  public async doctor(): Promise<BackendAvailability> {
    try {
      const result = await this.#cli.run(["version", "--format", "{{.Server.Version}}"], { timeoutMs: 10_000, maxOutputBytes: 16_384 });
      return {
        kind: this.kind,
        available: !result.timedOut && result.exitCode === 0 && result.stdout.trim().length > 0,
        detail: result.timedOut ? "docker version timed out" : result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim() || `exit=${result.exitCode}`,
      };
    } catch (error) {
      return { kind: this.kind, available: false, detail: error instanceof Error ? error.message : "Docker CLI unavailable" };
    }
  }

  public async prepare(request: PreparedExecutionBackendRequest): Promise<ExecutionBackendHandle> {
    const id = this.#createId();
    const name = `openrill-${this.options.profile}-${id}`.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 120);
    const labels = [
      "--label", "openrill.managed=true",
      "--label", `openrill.profile=${this.options.profile}`,
      "--label", `openrill.handle=${id}`,
    ];
    const createArgs = [
      "create",
      "--name", name,
      ...labels,
      "--network", request.networkMode === "NONE" ? "none" : "bridge",
      "--read-only",
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges",
      "--pids-limit", String(this.#pidsLimit),
      "--memory", String(this.#memoryBytes),
      "--mount", mountArgument(request.workspaceAuthority.canonicalRoot, request.workspaceAuthority.mountMode === "READ_ONLY"),
      "--workdir", "/workspace",
      this.options.image,
      "sh", "-lc", "trap 'exit 0' TERM INT; while :; do sleep 3600; done",
    ];
    const created = await this.#cli.run(createArgs, { timeoutMs: 30_000, maxOutputBytes: 65_536 });
    if (created.timedOut || created.exitCode !== 0) {
      throw new SandboxError("SANDBOX_START_FAILED", created.timedOut ? "docker create timed out" : created.stderr.trim() || "docker create failed");
    }
    const containerId = created.stdout.trim();
    if (!containerId) throw new SandboxError("SANDBOX_START_FAILED", "docker create returned an empty container id");
    let closed = false;
    let cancelled = false;
    try {
      const started = await this.#cli.run(["start", containerId], { timeoutMs: 30_000, maxOutputBytes: 65_536 });
      if (started.timedOut || started.exitCode !== 0) {
        throw new SandboxError("SANDBOX_START_FAILED", started.timedOut ? "docker start timed out" : started.stderr.trim() || "docker start failed");
      }
    } catch (error) {
      await this.#cli.run(["rm", "-f", containerId], { timeoutMs: 30_000, maxOutputBytes: 65_536 }).catch(() => undefined);
      throw error;
    }

    const exec = async (input: BackendExecInput): Promise<BackendExecResult> => {
      if (closed) throw new SandboxError("SANDBOX_CLOSED", "Docker execution handle is closed");
      validateExec(input);
      cancelled = false;
      const cwd = input.cwd?.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "") ?? "";
      if (cwd.split("/").some((segment) => segment === "..")) throw new SandboxError("SANDBOX_EXEC_INVALID", "cwd traversal is denied");
      const envArgs = Object.entries(input.env ?? {}).sort(([left], [right]) => left.localeCompare(right)).flatMap(([name, value]) => ["--env", `${name}=${value}`]);
      const args = ["exec", "--workdir", cwd ? `/workspace/${cwd}` : "/workspace", ...envArgs, containerId, input.executable, ...(input.args ?? [])];
      input.onStarted?.({ runtimeId: containerId });
      const maxOutputBytes = input.maxOutputBytes ?? 65_536;
      let result: DockerCliResult;
      try {
        result = await this.#cli.run(args, {
          timeoutMs: input.timeoutMs ?? 120_000,
          maxOutputBytes,
          ...(input.onStdout ? { onStdout: input.onStdout } : {}),
          ...(input.onStderr ? { onStderr: input.onStderr } : {}),
        });
      } catch (error) {
        throw new SandboxError("SANDBOX_EXEC_FAILED", error instanceof Error ? error.message : "docker exec failed", { cause: error });
      }
      if (result.timedOut) {
        await this.#cli.run(["kill", containerId], { timeoutMs: 30_000, maxOutputBytes: 65_536 }).catch(() => undefined);
      }
      const stdout = bounded(result.stdout, maxOutputBytes);
      const stderr = bounded(result.stderr, maxOutputBytes);
      return {
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        cancelled,
        stdout: stdout.text,
        stderr: stderr.text,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
      };
    };

    const cancel = async (): Promise<void> => {
      if (closed) return;
      cancelled = true;
      await this.#cli.run(["kill", containerId], { timeoutMs: 30_000, maxOutputBytes: 65_536 }).catch(() => undefined);
    };

    const close = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      const removed = await this.#cli.run(["rm", "-f", containerId], { timeoutMs: 30_000, maxOutputBytes: 65_536 });
      if (!removed.timedOut && removed.exitCode !== 0 && !/No such container/i.test(removed.stderr)) {
        throw new SandboxError("SANDBOX_EXEC_FAILED", removed.stderr.trim() || "docker remove failed");
      }
      if (removed.timedOut) throw new SandboxError("SANDBOX_EXEC_FAILED", "docker remove timed out");
    };

    return {
      id,
      kind: this.kind,
      capabilities: this.capabilities,
      workspaceAuthority: request.workspaceAuthority,
      confinementProof: {
        backend: this.kind,
        sandboxed: true,
        workspaceAuthority: request.workspaceAuthority,
        networkMode: request.networkMode,
        extraHostBinds: false,
        dockerSocketMounted: false,
      },
      createdAt: this.#now(),
      exec,
      cancel,
      close,
    };
  }

  public async pruneStale(): Promise<readonly string[]> {
    const listed = await this.#cli.run([
      "ps", "-aq",
      "--filter", "label=openrill.managed=true",
      "--filter", `label=openrill.profile=${this.options.profile}`,
    ], { timeoutMs: 30_000, maxOutputBytes: 1_048_576 });
    if (listed.timedOut || listed.exitCode !== 0) throw new SandboxError("SANDBOX_EXEC_FAILED", listed.timedOut ? "docker stale-resource listing timed out" : listed.stderr.trim() || "docker stale-resource listing failed");
    const ids = listed.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    for (const id of ids) {
      const removed = await this.#cli.run(["rm", "-f", id], { timeoutMs: 30_000, maxOutputBytes: 65_536 });
      if (removed.timedOut || (removed.exitCode !== 0 && !/No such container/i.test(removed.stderr))) {
        throw new SandboxError("SANDBOX_EXEC_FAILED", removed.timedOut ? `docker stale-resource removal timed out: ${id}` : removed.stderr.trim() || `docker stale-resource removal failed: ${id}`);
      }
    }
    return ids;
  }
}

export function createDockerExecutionBackend(options: DockerExecutionBackendOptions): DockerExecutionBackend {
  return new DockerExecutionBackend(options);
}

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}
