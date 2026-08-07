import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { finished } from "node:stream/promises";
import { resolveSecretReference, type SecretReference } from "@openrill/config";
import { ApprovalError, ApprovalService, ToolApprovalRequiredError, type ExecutionPolicy } from "@openrill/approval";
import {
  SandboxError,
  prepareExecutionBackendRequest,
  selectExecutionBackend,
  type ExecutionBackend,
  type ExecutionBackendHandle,
  type ExecutionBackendKind,
  type SandboxFallbackMode,
  type SandboxMountMode,
  type SandboxNetworkMode,
} from "@openrill/sandbox";
import type { OpenRillStateDatabase, LedgerProcessRecordRow } from "@openrill/state";
import type { RegisteredTool, ToolExecutionContext, ToolExecutionResult, ToolRegistry } from "@openrill/tool-runtime";
import { WorkspaceCatalog } from "@openrill/workspace";

export const PACKAGE_NAME = "@openrill/tools-process" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "TOOLS_PROCESS" as const;

export type ProcessStatus = "STARTING" | "RUNNING" | "EXITED" | "FAILED_TO_START" | "CANCELLED" | "ORPHANED";
export type CommandSpec =
  | { readonly kind: "argv"; readonly executable: string; readonly args?: readonly string[] }
  | { readonly kind: "shell"; readonly script: string };
export interface ProcessEnvironmentInput {
  readonly inherit?: readonly string[];
  readonly secrets?: Readonly<Record<string, SecretReference>>;
}
export interface ProcessRunInput {
  readonly command: CommandSpec;
  readonly cwd?: string;
  readonly env?: ProcessEnvironmentInput;
  readonly background?: boolean;
  readonly timeoutMs?: number;
}
export interface ProcessTailInput { readonly processId: string; readonly stream?: "stdout" | "stderr"; readonly maxBytes?: number; }
export interface ProcessCancelInput { readonly processId: string; }

const PROCESS_RUN_SCHEMA = {
  type: "object", additionalProperties: false, required: ["command"],
  properties: {
    command: { oneOf: [
      { type: "object", additionalProperties: false, required: ["kind", "executable"], properties: { kind: { const: "argv" }, executable: { type: "string" }, args: { type: "array", items: { type: "string" } } } },
      { type: "object", additionalProperties: false, required: ["kind", "script"], properties: { kind: { const: "shell" }, script: { type: "string" } } },
    ] },
    cwd: { type: "string" }, env: { type: "object" }, background: { type: "boolean" }, timeoutMs: { type: "integer" },
  },
} as const;
const PROCESS_LIST_SCHEMA = { type: "object", additionalProperties: false, properties: {} } as const;
const PROCESS_TAIL_SCHEMA = { type: "object", additionalProperties: false, required: ["processId"], properties: { processId: { type: "string" }, stream: { enum: ["stdout", "stderr"] }, maxBytes: { type: "integer" } } } as const;
const PROCESS_CANCEL_SCHEMA = { type: "object", additionalProperties: false, required: ["processId"], properties: { processId: { type: "string" } } } as const;

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]); return required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key));
}
function validSecretRef(value: unknown): value is SecretReference { return isRecord(value) && exactKeys(value, ["kind", "key"]) && (value.kind === "env" || value.kind === "file" || value.kind === "os") && typeof value.key === "string" && value.key.length > 0 && value.key.length <= 256; }
function validEnvName(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value); }
function validRunInput(value: unknown): value is ProcessRunInput {
  if (!isRecord(value) || !exactKeys(value, ["command"], ["cwd", "env", "background", "timeoutMs"]) || !isRecord(value.command)) return false;
  const command = value.command;
  if (command.kind === "argv") {
    if (!exactKeys(command, ["kind", "executable"], ["args"]) || typeof command.executable !== "string" || command.executable.length < 1 || command.executable.length > 4096) return false;
    if (command.args !== undefined && (!Array.isArray(command.args) || command.args.length > 256 || command.args.some((item) => typeof item !== "string" || item.length > 8192))) return false;
  } else if (command.kind === "shell") {
    if (!exactKeys(command, ["kind", "script"]) || typeof command.script !== "string" || command.script.length < 1 || command.script.length > 65_536) return false;
  } else return false;
  if (value.cwd !== undefined && (typeof value.cwd !== "string" || value.cwd.length > 4096)) return false;
  if (value.background !== undefined && typeof value.background !== "boolean") return false;
  if (value.timeoutMs !== undefined && (!Number.isInteger(value.timeoutMs) || (value.timeoutMs as number) < 100 || (value.timeoutMs as number) > 3_600_000)) return false;
  if (value.env !== undefined) {
    if (!isRecord(value.env) || !exactKeys(value.env, [], ["inherit", "secrets"])) return false;
    if (value.env.inherit !== undefined && (!Array.isArray(value.env.inherit) || value.env.inherit.length > 64 || value.env.inherit.some((item) => !validEnvName(item)))) return false;
    if (value.env.secrets !== undefined) {
      if (!isRecord(value.env.secrets) || Object.keys(value.env.secrets).length > 64) return false;
      for (const [name, reference] of Object.entries(value.env.secrets)) if (!validEnvName(name) || !validSecretRef(reference)) return false;
    }
  }
  return true;
}
function validTailInput(value: unknown): value is ProcessTailInput { return isRecord(value) && exactKeys(value, ["processId"], ["stream", "maxBytes"]) && typeof value.processId === "string" && value.processId.length <= 128 && (value.stream === undefined || value.stream === "stdout" || value.stream === "stderr") && (value.maxBytes === undefined || (Number.isInteger(value.maxBytes) && (value.maxBytes as number) >= 1 && (value.maxBytes as number) <= 262_144)); }
function validCancelInput(value: unknown): value is ProcessCancelInput { return isRecord(value) && exactKeys(value, ["processId"]) && typeof value.processId === "string" && value.processId.length <= 128; }
function redactedSummary(input: ProcessRunInput): unknown {
  return {
    command: input.command.kind === "argv" ? { kind: "argv", executable: input.command.executable, args: input.command.args ?? [] } : { kind: "shell", script: input.command.script },
    cwd: input.cwd ?? ".", background: input.background === true,
    env: { inherit: input.env?.inherit ?? [], secrets: Object.keys(input.env?.secrets ?? {}).sort() },
  };
}
function commandDisplay(command: CommandSpec): string {
  const raw = command.kind === "argv" ? [command.executable, ...(command.args ?? [])].join(" ") : command.script;
  return raw.length <= 512 ? raw : `${raw.slice(0, 509)}...`;
}
function commandExecutable(command: CommandSpec): string { return command.kind === "argv" ? command.executable : process.platform === "win32" ? "cmd.exe" : "/bin/sh"; }
function shellInvocation(script: string): { command: string; args: string[] } { return process.platform === "win32" ? { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", script] } : { command: "/bin/sh", args: ["-c", script] }; }

export interface ProcessBackendRouting {
  readonly preferred: ExecutionBackendKind;
  readonly host: ExecutionBackend;
  readonly docker?: ExecutionBackend;
  readonly mountMode: SandboxMountMode;
  readonly networkMode: SandboxNetworkMode;
  readonly fallback: SandboxFallbackMode;
}

export interface ProcessManagerOptions {
  readonly state: OpenRillStateDatabase; readonly workspaces: WorkspaceCatalog; readonly approvals: ApprovalService;
  readonly policy: ExecutionPolicy; readonly rootDirectory: string; readonly configRoot: string; readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => number; readonly createId?: () => string; readonly defaultTimeoutMs?: number;
  readonly maxCapturedBytes?: number; readonly spawnProcess?: typeof spawn; readonly backendRouting?: ProcessBackendRouting;
}
interface PreparedExecution { readonly input: ProcessRunInput; readonly context: ToolExecutionContext; readonly toolExecutionId: string; readonly bindingDigest: string; }
interface SelectedBackend { readonly backend: ExecutionBackend; readonly request: Awaited<ReturnType<typeof prepareExecutionBackendRequest>>; }

export class ProcessManager {
  readonly #children = new Map<string, ChildProcess>();
  readonly #backendHandles = new Map<string, ExecutionBackendHandle>();
  readonly #backgroundSettlements = new Map<string, Promise<void>>();
  readonly #backgroundFailures = new Map<string, unknown>();
  readonly #backendCancelPromises = new Set<Promise<void>>();
  readonly #now: () => number; readonly #createId: () => string;
  readonly #defaultTimeoutMs: number; readonly #maxCapturedBytes: number; readonly #spawnProcess: typeof spawn;
  #closePromise: Promise<void> | null = null; #closing = false;
  public constructor(private readonly options: ProcessManagerOptions) {
    this.#now = options.now ?? Date.now; this.#createId = options.createId ?? randomUUID;
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? 120_000; this.#maxCapturedBytes = options.maxCapturedBytes ?? 65_536;
    this.#spawnProcess = options.spawnProcess ?? spawn;
  }
  public recoverOrphans(): string[] { return this.options.state.transaction((repositories) => repositories.approvalProcess.markActiveProcessesOrphaned(this.#now())); }

  public async run(input: ProcessRunInput, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (this.#closing) throw new Error("process manager is closing");
    if (!context.conversationId || !context.toolCallId) throw new Error("process tool requires conversationId and toolCallId");
    const cwd = await this.options.workspaces.resolve(context.workspaceId, input.cwd ?? ".", "READ", { allowRoot: true, mustExist: true });
    if (cwd.kind !== "DIRECTORY") return { output: { error: { code: "PROCESS_CWD_NOT_DIRECTORY", message: "cwd must be a workspace directory" } }, isError: true };
    const auth = this.options.approvals.authorizeOrRequest({
      runId: context.runId, attemptId: context.attemptId, conversationId: context.conversationId, workspaceId: context.workspaceId,
      toolCallId: context.toolCallId, toolName: "process.run", input: input as unknown as Readonly<Record<string, unknown>>,
      toolSchema: PROCESS_RUN_SCHEMA, policySubject: { commandKind: input.command.kind, executable: commandExecutable(input.command), cwd: cwd.relativePath, background: input.background === true },
      policy: this.options.policy, summary: redactedSummary(input),
      continuation: { input, context: { runId: context.runId, attemptId: context.attemptId, conversationId: context.conversationId, workspaceId: context.workspaceId, toolCallId: context.toolCallId }, bindingDigest: "BOUND_AT_REQUEST" },
    });
    if (auth.decision === "DENY") return { output: { error: { code: "PROCESS_POLICY_DENIED", message: "process execution denied by policy" } }, isError: true };
    if (auth.decision === "PROMPT") throw new ToolApprovalRequiredError(auth.request);
    this.options.approvals.beginAllowedToolCall(auth.toolExecutionId);
    return this.#executePrepared({ input, context, toolExecutionId: auth.toolExecutionId, bindingDigest: auth.bindingDigest });
  }

  public async executeApproved(requestId: string): Promise<{ readonly requestId: string; readonly runId: string; readonly attemptId: string; readonly toolCallId: string; readonly toolName: string; readonly result: ToolExecutionResult }> {
    const request = this.options.approvals.get(requestId);
    const consumed = this.options.approvals.consume({ requestId, expectedVersion: request.version, bindingDigest: request.bindingDigest });
    if (!isRecord(consumed.continuation) || !isRecord(consumed.continuation.input) || !isRecord(consumed.continuation.context)) throw new ApprovalError("APPROVAL_STATE_INVALID", "approval continuation is invalid");
    const input = consumed.continuation.input as unknown as ProcessRunInput; const ctx = consumed.continuation.context;
    if (!validRunInput(input) || typeof ctx.runId !== "string" || typeof ctx.attemptId !== "string" || typeof ctx.conversationId !== "string" || typeof ctx.workspaceId !== "string" || typeof ctx.toolCallId !== "string") throw new ApprovalError("APPROVAL_BINDING_MISMATCH", "approval continuation no longer validates");
    const result = await this.#executePrepared({ input, context: { runId: ctx.runId, attemptId: ctx.attemptId, conversationId: ctx.conversationId, workspaceId: ctx.workspaceId, toolCallId: ctx.toolCallId }, toolExecutionId: consumed.toolCall.toolExecutionId, bindingDigest: request.bindingDigest });
    return { requestId, runId: ctx.runId, attemptId: ctx.attemptId, toolCallId: ctx.toolCallId, toolName: request.toolName, result };
  }

  async #environment(input: ProcessRunInput): Promise<NodeJS.ProcessEnv> {
    const output: NodeJS.ProcessEnv = {};
    for (const name of input.env?.inherit ?? []) { const value = (this.options.env ?? process.env)[name]; if (value !== undefined) output[name] = value; }
    for (const [name, reference] of Object.entries(input.env?.secrets ?? {})) output[name] = await resolveSecretReference(reference, { configRoot: this.options.configRoot, ...(this.options.env !== undefined ? { env: this.options.env } : {}) });
    return output;
  }

  async #executePrepared(prepared: PreparedExecution): Promise<ToolExecutionResult> {
    return this.options.backendRouting ? this.#executeBackendPrepared(prepared) : this.#executeLegacyPrepared(prepared);
  }

  async #selectBackend(workspaceId: string): Promise<SelectedBackend> {
    const routing = this.options.backendRouting!;
    const request = await prepareExecutionBackendRequest(this.options.workspaces, {
      workspaceId,
      mountMode: routing.mountMode,
      networkMode: routing.networkMode,
      fallback: routing.fallback,
    }, {
      allowOutboundNetwork: routing.networkMode === "OUTBOUND",
      allowHostFallback: routing.fallback === "HOST",
    });
    let backend: ExecutionBackend;
    if (routing.preferred === "HOST") {
      backend = routing.host;
    } else {
      const dockerAvailability = routing.docker ? await routing.docker.doctor() : { kind: "DOCKER" as const, available: false, detail: "Docker backend not configured" };
      const selected = selectExecutionBackend("DOCKER", dockerAvailability.available, routing.fallback);
      backend = selected === "DOCKER" ? routing.docker! : routing.host;
    }
    const availability = await backend.doctor();
    if (!availability.available) throw new SandboxError("SANDBOX_BACKEND_UNAVAILABLE", `${backend.kind} backend unavailable: ${availability.detail}`);
    return { backend, request };
  }

  async #executeBackendPrepared(prepared: PreparedExecution): Promise<ToolExecutionResult> {
    const { input, context, toolExecutionId } = prepared;
    const cwd = await this.options.workspaces.resolve(context.workspaceId, input.cwd ?? ".", "READ", { allowRoot: true, mustExist: true });
    let selected: SelectedBackend;
    try {
      selected = await this.#selectBackend(context.workspaceId);
    } catch (error) {
      const causeCode = error instanceof SandboxError ? error.code : "SANDBOX_BACKEND_UNAVAILABLE";
      const errorCode = causeCode === "SANDBOX_BACKEND_UNAVAILABLE" ? "PROCESS_BACKEND_UNAVAILABLE" : "PROCESS_CONFINEMENT_DENIED";
      const result = { output: { error: { code: errorCode, causeCode, message: error instanceof Error ? error.message : "execution backend selection failed" } }, isError: true } as const;
      this.options.approvals.completeToolCall(toolExecutionId, result.output, true, errorCode);
      return result;
    }

    let environment: NodeJS.ProcessEnv;
    try {
      environment = await this.#environment(input);
    } catch (error) {
      const result = { output: { error: { code: "PROCESS_ENVIRONMENT_RESOLUTION_FAILED", message: error instanceof Error ? error.message : "process environment resolution failed" } }, isError: true } as const;
      this.options.approvals.completeToolCall(toolExecutionId, result.output, true, "PROCESS_ENVIRONMENT_RESOLUTION_FAILED");
      return result;
    }

    await mkdir(this.options.rootDirectory, { recursive: true, mode: 0o700 });
    const processId = this.#createId(); const processDir = join(this.options.rootDirectory, processId); await mkdir(processDir, { recursive: false, mode: 0o700 });
    const stdoutPath = join(processDir, "stdout.log"); const stderrPath = join(processDir, "stderr.log");
    await Promise.all([open(stdoutPath, "wx", 0o600).then((h) => h.close()), open(stderrPath, "wx", 0o600).then((h) => h.close())]);

    const now = this.#now(); const row: LedgerProcessRecordRow = {
      processId, toolExecutionId, runId: context.runId, attemptId: context.attemptId, workspaceId: context.workspaceId, toolCallId: context.toolCallId ?? "missing",
      mode: input.background ? "BACKGROUND" : "FOREGROUND", commandKind: input.command.kind === "argv" ? "ARGV" : "SHELL", commandDisplay: commandDisplay(input.command), cwdRelative: cwd.relativePath,
      status: "STARTING", pid: null, stdoutPath, stderrPath, backendKind: selected.backend.kind, backendHandleId: null,
      sandboxed: selected.backend.capabilities.sandboxed, confinement: null, exitCode: null, exitSignal: null, startedAt: null, endedAt: null, updatedAt: now,
    };
    this.options.state.transaction((repositories) => repositories.approvalProcess.insertProcess(row));

    let handle: ExecutionBackendHandle | null = null;
    try {
      const preparedHandle = await selected.backend.prepare(selected.request);
      handle = preparedHandle;
      this.options.state.transaction((repositories) => repositories.approvalProcess.bindProcessBackend({
        processId,
        backendKind: preparedHandle.kind,
        backendHandleId: preparedHandle.id,
        sandboxed: preparedHandle.capabilities.sandboxed,
        confinement: preparedHandle.confinementProof,
        updatedAt: this.#now(),
      }));
    } catch (error) {
      let cleanupError: unknown = null;
      if (handle) {
        try { await handle.close(); } catch (failure) { cleanupError = failure; }
      }
      const endedAt = this.#now();
      this.options.state.transaction((repositories) => repositories.approvalProcess.updateProcess({ processId, status: cleanupError ? "ORPHANED" : "FAILED_TO_START", endedAt, updatedAt: endedAt }));
      const result = {
        output: {
          error: { code: "PROCESS_BACKEND_PREPARE_FAILED", message: error instanceof Error ? error.message : "execution backend prepare failed" },
          ...(cleanupError ? { cleanupError: { code: "PROCESS_BACKEND_CLEANUP_FAILED", message: cleanupError instanceof Error ? cleanupError.message : "execution backend cleanup failed" } } : {}),
          processId,
          backend: selected.backend.kind,
        },
        isError: true,
      } as const;
      this.options.approvals.completeToolCall(toolExecutionId, result.output, true, cleanupError ? "PROCESS_BACKEND_CLEANUP_FAILED" : "PROCESS_BACKEND_PREPARE_FAILED");
      return result;
    }

    if (handle === null) throw new Error("execution backend prepare returned no handle");
    const activeHandle = handle;
    this.#backendHandles.set(processId, activeHandle);
    const stdoutFile = createWriteStream(stdoutPath, { flags: "a" }); const stderrFile = createWriteStream(stderrPath, { flags: "a" });
    let stdoutObserved = 0; let stderrObserved = 0; let started = false; let resolveStarted!: () => void;
    const startedPromise = new Promise<void>((resolve) => { resolveStarted = resolve; });
    const markStarted = (pid?: number): void => {
      if (started) return;
      started = true;
      const startedAt = this.#now();
      this.options.state.transaction((repositories) => repositories.approvalProcess.updateProcess({ processId, status: "RUNNING", ...(pid !== undefined ? { pid } : {}), startedAt, updatedAt: startedAt }));
      resolveStarted();
    };
    const invocation = input.command.kind === "argv"
      ? { command: input.command.executable, args: [...(input.command.args ?? [])] }
      : activeHandle.kind === "DOCKER"
        ? { command: "sh", args: ["-lc", input.command.script] }
        : shellInvocation(input.command.script);
    const settle = async (): Promise<ToolExecutionResult> => {
      let backendResult: Awaited<ReturnType<ExecutionBackendHandle["exec"]>> | null = null;
      let executionError: unknown = null;
      let cleanupError: unknown = null;
      try {
        backendResult = await activeHandle.exec({
          executable: invocation.command,
          args: invocation.args,
          cwd: cwd.relativePath || ".",
          env: Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined)),
          timeoutMs: input.timeoutMs ?? this.#defaultTimeoutMs,
          maxOutputBytes: this.#maxCapturedBytes,
          onStarted: (event) => markStarted(event.pid),
          onStdout: (chunk) => { const bytes = Buffer.from(chunk); stdoutObserved += bytes.length; stdoutFile.write(bytes); },
          onStderr: (chunk) => { const bytes = Buffer.from(chunk); stderrObserved += bytes.length; stderrFile.write(bytes); },
        });
        markStarted();
        if (stdoutObserved === 0 && backendResult.stdout) stdoutFile.write(backendResult.stdout);
        if (stderrObserved === 0 && backendResult.stderr) stderrFile.write(backendResult.stderr);
      } catch (error) {
        executionError = error;
        if (!started) resolveStarted();
      } finally {
        try { await activeHandle.close(); } catch (error) { cleanupError = error; }
        this.#backendHandles.delete(processId);
        if (!stdoutFile.writableEnded) stdoutFile.end();
        if (!stderrFile.writableEnded) stderrFile.end();
        await Promise.allSettled([finished(stdoutFile), finished(stderrFile)]);
      }

      const endedAt = this.#now();
      const current = this.options.state.transaction((repositories) => repositories.approvalProcess.getProcess(processId));
      let status: ProcessStatus;
      if (current && !["STARTING", "RUNNING"].includes(current.status)) status = current.status;
      else if (cleanupError) status = "ORPHANED";
      else if (executionError) status = "FAILED_TO_START";
      else if (backendResult?.timedOut || backendResult?.cancelled) status = "CANCELLED";
      else status = "EXITED";
      this.options.state.transaction((repositories) => repositories.approvalProcess.updateProcess({
        processId,
        status,
        exitCode: backendResult?.exitCode ?? null,
        exitSignal: backendResult?.signal ?? null,
        endedAt,
        updatedAt: endedAt,
      }));
      const [stdout, stderr] = await Promise.all([this.#readBounded(stdoutPath, this.#maxCapturedBytes), this.#readBounded(stderrPath, this.#maxCapturedBytes)]);
      const isError = status !== "EXITED" || backendResult?.exitCode !== 0 || executionError !== null || cleanupError !== null;
      const errorCode = cleanupError ? "PROCESS_BACKEND_CLEANUP_FAILED" : executionError ? "PROCESS_BACKEND_EXEC_FAILED" : backendResult?.timedOut ? "PROCESS_TIMEOUT" : backendResult?.cancelled || status === "CANCELLED" ? "PROCESS_CANCELLED" : isError ? "PROCESS_EXIT_NONZERO" : null;
      const output = {
        processId,
        status,
        background: input.background === true,
        backend: activeHandle.kind,
        sandboxed: activeHandle.capabilities.sandboxed,
        confinement: activeHandle.confinementProof,
        exitCode: backendResult?.exitCode ?? null,
        signal: backendResult?.signal ?? null,
        timedOut: backendResult?.timedOut ?? false,
        cancelled: backendResult?.cancelled ?? status === "CANCELLED",
        stdout: stdout.text,
        stderr: stderr.text,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
        ...(executionError ? { error: { code: "PROCESS_BACKEND_EXEC_FAILED", message: executionError instanceof Error ? executionError.message : "backend execution failed" } } : {}),
        ...(cleanupError ? { cleanupError: { code: "PROCESS_BACKEND_CLEANUP_FAILED", message: cleanupError instanceof Error ? cleanupError.message : "backend cleanup failed" } } : {}),
      };
      if (input.background !== true) this.options.approvals.completeToolCall(toolExecutionId, output, isError, errorCode);
      if (cleanupError && input.background === true) this.#backgroundFailures.set(processId, cleanupError);
      return { output, isError };
    };

    const settlement = settle().finally(() => { this.#backgroundSettlements.delete(processId); });
    const trackedSettlement = settlement.then(
      () => undefined,
      (failure) => { this.#backgroundFailures.set(processId, failure); },
    );
    this.#backgroundSettlements.set(processId, trackedSettlement);
    if (input.background) {
      const first = await Promise.race([
        startedPromise.then(() => ({ kind: "STARTED" as const })),
        settlement.then((result) => ({ kind: "SETTLED" as const, result })),
      ]);
      if (first.kind === "SETTLED") {
        this.options.approvals.completeToolCall(toolExecutionId, first.result.output, first.result.isError, first.result.isError ? "PROCESS_BACKEND_EXEC_FAILED" : null);
        return first.result;
      }
      const result = { output: { processId, status: "RUNNING", background: true, pid: this.list().find((record) => record.processId === processId)?.pid ?? null, backend: activeHandle.kind, sandboxed: activeHandle.capabilities.sandboxed, confinement: activeHandle.confinementProof }, isError: false } as const;
      this.options.approvals.completeToolCall(toolExecutionId, result.output, false); return result;
    }
    return settlement;
  }

  async #executeLegacyPrepared(prepared: PreparedExecution): Promise<ToolExecutionResult> {
    const { input, context, toolExecutionId } = prepared;
    const cwd = await this.options.workspaces.resolve(context.workspaceId, input.cwd ?? ".", "READ", { allowRoot: true, mustExist: true });
    await mkdir(this.options.rootDirectory, { recursive: true, mode: 0o700 });
    const processId = this.#createId(); const processDir = join(this.options.rootDirectory, processId); await mkdir(processDir, { recursive: false, mode: 0o700 });
    const stdoutPath = join(processDir, "stdout.log"); const stderrPath = join(processDir, "stderr.log");
    await Promise.all([open(stdoutPath, "wx", 0o600).then((h) => h.close()), open(stderrPath, "wx", 0o600).then((h) => h.close())]);
    const now = this.#now(); const row: LedgerProcessRecordRow = {
      processId, toolExecutionId, runId: context.runId, attemptId: context.attemptId, workspaceId: context.workspaceId, toolCallId: context.toolCallId ?? "missing",
      mode: input.background ? "BACKGROUND" : "FOREGROUND", commandKind: input.command.kind === "argv" ? "ARGV" : "SHELL", commandDisplay: commandDisplay(input.command), cwdRelative: cwd.relativePath,
      status: "STARTING", pid: null, stdoutPath, stderrPath, backendKind: "HOST", backendHandleId: null, sandboxed: false, confinement: null,
      exitCode: null, exitSignal: null, startedAt: null, endedAt: null, updatedAt: now,
    };
    this.options.state.transaction((repositories) => repositories.approvalProcess.insertProcess(row));
    const invocation = input.command.kind === "argv" ? { command: input.command.executable, args: [...(input.command.args ?? [])] } : shellInvocation(input.command.script);
    let child: ChildProcess;
    try {
      child = this.#spawnProcess(invocation.command, invocation.args, { cwd: cwd.absolutePath, env: await this.#environment(input), shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      this.options.state.transaction((repositories) => repositories.approvalProcess.updateProcess({ processId, status: "FAILED_TO_START", endedAt: this.#now(), updatedAt: this.#now() }));
      const result = { output: { error: { code: "PROCESS_START_FAILED", message: error instanceof Error ? error.message : "process start failed" }, processId }, isError: true } as const;
      this.options.approvals.completeToolCall(toolExecutionId, result.output, true, "PROCESS_START_FAILED"); return result;
    }
    const stdoutFile = createWriteStream(stdoutPath, { flags: "a" }); const stderrFile = createWriteStream(stderrPath, { flags: "a" });
    child.stdout?.pipe(stdoutFile); child.stderr?.pipe(stderrFile); this.#children.set(processId, child);
    const startedAt = this.#now();
    this.options.state.transaction((repositories) => repositories.approvalProcess.updateProcess({ processId, status: "RUNNING", pid: child.pid ?? null, startedAt, updatedAt: startedAt }));
    if (input.background) {
      let finalized = false;
      let resolveSettlement!: () => void;
      const settlement = new Promise<void>((resolve) => { resolveSettlement = resolve; });
      this.#backgroundSettlements.set(processId, settlement);
      const finalize = async (code: number | null, signal: NodeJS.Signals | null, error?: Error): Promise<void> => {
        if (finalized) return;
        finalized = true;
        this.#children.delete(processId);
        try {
          const endedAt = this.#now();
          this.options.state.transaction((repositories) => {
            const current = repositories.approvalProcess.getProcess(processId);
            const status = current && !["STARTING", "RUNNING"].includes(current.status)
              ? current.status
              : error
                ? "FAILED_TO_START"
                : "EXITED";
            repositories.approvalProcess.updateProcess({ processId, status, exitCode: code, exitSignal: signal, endedAt, updatedAt: endedAt });
          });
        } catch (failure) {
          this.#backgroundFailures.set(processId, failure);
        } finally {
          if (!stdoutFile.writableEnded) stdoutFile.end();
          if (!stderrFile.writableEnded) stderrFile.end();
          await Promise.allSettled([finished(stdoutFile), finished(stderrFile)]);
          this.#backgroundSettlements.delete(processId);
          resolveSettlement();
        }
      };
      child.once("close", (code, signal) => { void finalize(code, signal); });
      child.once("error", (error) => { void finalize(null, null, error); });
      const result = { output: { processId, status: "RUNNING", background: true, pid: child.pid ?? null }, isError: false } as const;
      this.options.approvals.completeToolCall(toolExecutionId, result.output, false); return result;
    }
    const timeoutMs = input.timeoutMs ?? this.#defaultTimeoutMs; let timedOut = false; let aborted = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const onAbort = () => { aborted = true; child.kill(); }; context.signal?.addEventListener("abort", onAbort, { once: true });
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: Error }>((resolve) => { child.once("exit", (code, signal) => resolve({ code, signal })); child.once("error", (error) => resolve({ code: null, signal: null, error })); });
    clearTimeout(timer); context.signal?.removeEventListener("abort", onAbort); this.#children.delete(processId);
    if (!stdoutFile.closed) stdoutFile.end();
    if (!stderrFile.closed) stderrFile.end();
    await Promise.all([finished(stdoutFile), finished(stderrFile)]);
    const endedAt = this.#now(); const status: ProcessStatus = aborted || timedOut ? "CANCELLED" : exit.error ? "FAILED_TO_START" : "EXITED";
    this.options.state.transaction((repositories) => repositories.approvalProcess.updateProcess({ processId, status, exitCode: exit.code, exitSignal: exit.signal, endedAt, updatedAt: endedAt }));
    const [stdout, stderr] = await Promise.all([this.#readBounded(stdoutPath, this.#maxCapturedBytes), this.#readBounded(stderrPath, this.#maxCapturedBytes)]);
    const isError = status !== "EXITED" || exit.code !== 0;
    const output = { processId, status, background: false, exitCode: exit.code, signal: exit.signal, timedOut, cancelled: aborted, stdout: stdout.text, stderr: stderr.text, stdoutTruncated: stdout.truncated, stderrTruncated: stderr.truncated };
    this.options.approvals.completeToolCall(toolExecutionId, output, isError, isError ? timedOut ? "PROCESS_TIMEOUT" : aborted ? "PROCESS_CANCELLED" : "PROCESS_EXIT_NONZERO" : null);
    return { output, isError };
  }

  async #readBounded(path: string, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
    const info = await stat(path); const data = await readFile(path); const slice = data.length > maxBytes ? data.subarray(data.length - maxBytes) : data;
    return { text: slice.toString("utf8"), truncated: info.size > maxBytes };
  }
  public list(runId?: string): LedgerProcessRecordRow[] { return this.options.state.transaction((repositories) => repositories.approvalProcess.listProcesses(runId)); }
  public async tail(input: ProcessTailInput): Promise<ToolExecutionResult> {
    const row = this.options.state.transaction((repositories) => repositories.approvalProcess.getProcess(input.processId));
    if (!row) return { output: { error: { code: "PROCESS_NOT_FOUND", message: "process not found" } }, isError: true };
    const stream = input.stream ?? "stdout"; const result = await this.#readBounded(stream === "stdout" ? row.stdoutPath : row.stderrPath, input.maxBytes ?? 65_536);
    return { output: { processId: row.processId, stream, status: row.status, text: result.text, truncated: result.truncated }, isError: false };
  }
  public cancel(input: ProcessCancelInput): ToolExecutionResult {
    const row = this.options.state.transaction((repositories) => repositories.approvalProcess.getProcess(input.processId));
    if (!row) return { output: { error: { code: "PROCESS_NOT_FOUND", message: "process not found" } }, isError: true };
    if (!["STARTING", "RUNNING"].includes(row.status)) return { output: { processId: row.processId, status: row.status, alreadyTerminal: true }, isError: false };
    const child = this.#children.get(row.processId);
    if (child) {
      child.kill(); const now = this.#now(); this.options.state.transaction((repositories) => repositories.approvalProcess.updateProcess({ processId: row.processId, status: "CANCELLED", endedAt: now, updatedAt: now }));
      return { output: { processId: row.processId, status: "CANCELLED", cancelled: true }, isError: false };
    }
    const handle = this.#backendHandles.get(row.processId);
    if (handle) {
      const now = this.#now(); this.options.state.transaction((repositories) => repositories.approvalProcess.updateProcess({ processId: row.processId, status: "CANCELLED", endedAt: now, updatedAt: now }));
      const cancelling = handle.cancel().catch((failure) => { this.#backgroundFailures.set(row.processId, failure); }).finally(() => { this.#backendCancelPromises.delete(cancelling); });
      this.#backendCancelPromises.add(cancelling);
      return { output: { processId: row.processId, status: "CANCELLED", cancelled: true, backend: handle.kind }, isError: false };
    }
    const now = this.#now(); this.options.state.transaction((repositories) => repositories.approvalProcess.updateProcess({ processId: row.processId, status: "ORPHANED", endedAt: now, updatedAt: now })); return { output: { processId: row.processId, status: "ORPHANED", cancelled: false }, isError: true };
  }
  public close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#closing = true;
    this.#closePromise = (async () => {
      const settlements = [...this.#backgroundSettlements.values()];
      for (const processId of [...new Set([...this.#children.keys(), ...this.#backendHandles.keys()])]) this.cancel({ processId });
      await Promise.allSettled([...this.#backendCancelPromises]);
      await Promise.all(settlements);
      this.#children.clear(); this.#backendHandles.clear();
      const failures = [...this.#backgroundFailures.values()];
      this.#backgroundFailures.clear();
      if (failures.length > 0) {
        const failure = failures[0];
        throw failure instanceof Error ? failure : new Error("background process finalization failed");
      }
    })();
    return this.#closePromise;
  }
}

function tool(name: string, description: string, inputSchema: Readonly<Record<string, unknown>>, validateInput: (input: unknown) => input is Readonly<Record<string, unknown>>, execute: RegisteredTool["execute"]): RegisteredTool { return { name, description, inputSchema, validateInput, execute }; }
export function registerProcessTools(registry: ToolRegistry, manager: ProcessManager): void {
  registry.register(tool("process.run", "Run an argv command or an explicit shell script in the configured workspace.", PROCESS_RUN_SCHEMA, validRunInput as any, (input, context) => manager.run(input as unknown as ProcessRunInput, context)));
  registry.register(tool("process.list", "List durable process records for the current run.", PROCESS_LIST_SCHEMA, ((input: unknown): input is Readonly<Record<string, unknown>> => isRecord(input) && Object.keys(input).length === 0), (_input, context) => ({ output: { items: manager.list(context.runId) }, isError: false })));
  registry.register(tool("process.tail", "Read a bounded tail of process stdout or stderr.", PROCESS_TAIL_SCHEMA, validTailInput as any, (input) => manager.tail(input as unknown as ProcessTailInput)));
  registry.register(tool("process.cancel", "Cancel an active background process owned by OpenRill.", PROCESS_CANCEL_SCHEMA, validCancelInput as any, (input) => manager.cancel(input as unknown as ProcessCancelInput)));
}

export function getPackageIdentity() { return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const; }
