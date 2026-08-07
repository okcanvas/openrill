import { AGENT_HOST_SHUTDOWN_ABORT_REASON, executeAgentRun, type AgentKernelExecutionResult, type AgentKernelProgressEvent } from "@openrill/agent-kernel";
import type { ConversationService, DelegationService } from "@openrill/conversations";
import type { ModelAdapterResolver } from "@openrill/model-adapter";
import type { ToolRegistry } from "@openrill/tool-runtime";

export interface AgentRunCoordinatorOptions {
  readonly conversations: ConversationService;
  readonly models: ModelAdapterResolver;
  readonly tools: ToolRegistry;
  readonly delegations?: DelegationService;
  readonly publishNotice: (topic: string, data: unknown) => void;
  readonly onRunTerminal?: (result: AgentKernelExecutionResult) => Promise<void> | void;
  readonly resolveRunPreparation?: (runId: string) => Promise<{
    readonly systemInstructions?: string;
    readonly modelToolNames?: readonly string[];
  }>;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function publishAgentProgressNotices(
  publishNotice: (topic: string, data: unknown) => void,
  event: AgentKernelProgressEvent,
): void {
  publishNotice("run.event", event);
  if (event.type !== "approval.requested" || !isRecord(event.data)) return;
  if (typeof event.data.requestId !== "string" || typeof event.data.status !== "string") return;
  publishNotice("approval.updated", { ...event.data, runId: event.runId });
}

interface ActiveRun {
  readonly controller: AbortController;
  readonly promise: Promise<AgentKernelExecutionResult>;
}

interface TerminalWaiter {
  readonly promise: Promise<AgentKernelExecutionResult>;
  readonly resolve: (result: AgentKernelExecutionResult) => void;
  readonly reject: (error: unknown) => void;
}

const EMPTY_USAGE = { turns: 0, inputTokens: 0, outputTokens: 0, modelCalls: 0, toolCalls: 0 } as const;

export class AgentRunCoordinator {
  readonly #active = new Map<string, ActiveRun>();
  readonly #pendingResume = new Set<string>();
  readonly #terminalWaiters = new Map<string, TerminalWaiter>();
  #closing = false;

  public constructor(private readonly options: AgentRunCoordinatorOptions) {}

  #terminalWaiter(runId: string): TerminalWaiter {
    const existing = this.#terminalWaiters.get(runId);
    if (existing) return existing;
    let resolve!: (result: AgentKernelExecutionResult) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<AgentKernelExecutionResult>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const waiter = { promise, resolve, reject };
    this.#terminalWaiters.set(runId, waiter);
    void promise.catch(() => undefined);
    return waiter;
  }

  #settleTerminal(result: AgentKernelExecutionResult): void {
    if (result.status === "WAITING_APPROVAL" || result.status === "WAITING_DELEGATION" || result.status === "INTERRUPTED") return;
    const waiter = this.#terminalWaiters.get(result.runId);
    if (!waiter) return;
    this.#terminalWaiters.delete(result.runId);
    waiter.resolve(result);
  }

  #start(runId: string): ActiveRun | null {
    if (this.#closing || this.#active.has(runId)) return null;
    const controller = new AbortController();
    const promise = (async () => {
      let preparation: { readonly systemInstructions?: string; readonly modelToolNames?: readonly string[] } = {};
      try {
        this.options.conversations.prepareExecutionAttempt(runId);
        preparation = await this.options.resolveRunPreparation?.(runId) ?? {};
      } catch (error) {
        const message = error instanceof Error ? error.message : "Skill and Tool discovery preparation failed";
        this.options.conversations.failExecution(runId, EMPTY_USAGE, "SKILL_PREPARATION_FAILED", message);
        return { runId, status: "FAILED" as const, terminalReason: "SKILL_PREPARATION_FAILED", usage: EMPTY_USAGE, messages: [] };
      }
      return executeAgentRun({
        runId,
        conversations: this.options.conversations,
        modelAdapters: this.options.models,
        tools: this.options.tools,
        ...(this.options.delegations ? { delegations: this.options.delegations } : {}),
        signal: controller.signal,
        ...(preparation.systemInstructions ? { systemInstructions: preparation.systemInstructions } : {}),
        ...(preparation.modelToolNames ? { modelToolNames: preparation.modelToolNames } : {}),
        onProgress: (event) => publishAgentProgressNotices(this.options.publishNotice, event),
      });
    })().then(async (result) => {
      let durableStatus: string = result.status;
      let recoveryState: string | undefined;
      try {
        const durable = this.options.conversations.executionContext(runId).run;
        durableStatus = durable.status;
        recoveryState = durable.recoveryState;
      } catch {
        // The result remains the best available notice if durable state cannot be read.
      }
      this.options.publishNotice("run.updated", {
        runId,
        status: durableStatus,
        executionStatus: result.status,
        terminalReason: result.terminalReason,
        recoveryState,
        usage: result.usage,
      });
      if (result.status !== "WAITING_APPROVAL" && result.status !== "WAITING_DELEGATION" && result.status !== "INTERRUPTED") {
        await this.options.onRunTerminal?.(result);
      }
      this.#settleTerminal(result);
      return result;
    }).catch((error) => {
      this.options.publishNotice("run.updated", {
        runId,
        status: "FAILED",
        terminalReason: "COORDINATOR_ERROR",
      });
      const waiter = this.#terminalWaiters.get(runId);
      if (waiter) {
        this.#terminalWaiters.delete(runId);
        waiter.reject(error);
      }
      throw error;
    }).finally(() => {
      this.#active.delete(runId);
      if (this.#pendingResume.delete(runId) && !this.#closing) this.#start(runId);
    });
    const active = { controller, promise };
    this.#active.set(runId, active);
    void promise.catch(() => undefined);
    return active;
  }

  public schedule(runId: string): boolean {
    return this.#start(runId) !== null;
  }

  public ensureScheduled(runId: string): boolean {
    if (this.#closing) return false;
    if (this.#active.has(runId)) return true;
    return this.#start(runId) !== null;
  }

  public executeUntilTerminal(runId: string): Promise<AgentKernelExecutionResult> {
    if (this.#closing) return Promise.reject(new Error("Agent Run coordinator is closing"));
    const waiter = this.#terminalWaiter(runId);
    if (!this.#active.has(runId)) this.#start(runId);
    return waiter.promise;
  }

  public resume(runId: string): boolean {
    if (this.#closing) return false;
    if (this.#active.has(runId)) {
      this.#pendingResume.add(runId);
      return true;
    }
    return this.#start(runId) !== null;
  }

  public cancel(runId: string): boolean {
    const active = this.#active.get(runId);
    if (active) {
      active.controller.abort();
      return true;
    }
    try {
      const context = this.options.conversations.executionContext(runId);
      if (context.run.status === "CANCELLED" || context.run.status === "FAILED" || context.run.status === "COMPLETED") {
        this.#settleTerminal({
          runId,
          status: context.run.status === "COMPLETED" ? "COMPLETED" : context.run.status,
          terminalReason: context.run.status,
          usage: EMPTY_USAGE,
          messages: [],
        });
      }
    } catch {
      // The conversation boundary owns missing/invalid run errors.
    }
    return false;
  }

  public isActive(runId: string): boolean {
    return this.#active.has(runId);
  }

  public async close(): Promise<void> {
    if (this.#closing) return;
    this.#closing = true;
    this.#pendingResume.clear();
    const active = [...this.#active.values()];
    for (const entry of active) entry.controller.abort(AGENT_HOST_SHUTDOWN_ABORT_REASON);
    await Promise.allSettled(active.map((entry) => entry.promise));
    for (const [runId, waiter] of this.#terminalWaiters) {
      waiter.reject(new Error(`Agent Run coordinator closed before terminal result: ${runId}`));
    }
    this.#terminalWaiters.clear();
  }
}
