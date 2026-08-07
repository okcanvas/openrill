import { randomBytes, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import http from "node:http";
import type { OpenRillConfig, OpenRillProfilePaths, OsSecretProvider } from "@openrill/config";
import { OPENRILL_DEFAULT_HOST_BIND, OPENRILL_DEFAULT_HOST_PORT, resolveProfilePaths } from "@openrill/config";
import type { HostLifecycleState, HostStatusPayload } from "@openrill/protocol";
import { openOpenRillStateDatabase, type OpenRillStateDatabase } from "@openrill/state";
import { ConversationService, DelegationService, type ConversationMessage } from "@openrill/conversations";
import { ToolRegistry } from "@openrill/tool-runtime";
import type { AgentKernelUsage } from "@openrill/agent-kernel";
import type { ModelAdapterResolver } from "@openrill/model-adapter";
import { createWorkspaceCatalog, type WorkspaceCatalog } from "@openrill/workspace";
import { createWorkspaceArtifactStore, registerWorkspaceFileTools, type WorkspaceArtifactStore } from "@openrill/tools-files";
import { ApprovalService, type ApprovalRequestView } from "@openrill/approval";
import { ProcessManager, registerProcessTools } from "@openrill/tools-process";
import { createHostExecutionBackend } from "@openrill/sandbox";
import { createDockerExecutionBackend, createNodeDockerCli, type DockerExecutionBackend } from "@openrill/sandbox-docker";
import { registerDelegationTools } from "@openrill/tools-delegation";
import { MemoryService, MEMORY_SYSTEM_INSTRUCTIONS } from "@openrill/memory";
import { GoalService, GOAL_SYSTEM_INSTRUCTIONS } from "@openrill/goals";
import { GoalPlanExecutorService } from "@openrill/goal-executor";
import { TaskMaintenanceService, TaskService, type BackgroundTask } from "@openrill/tasks";
import { TaskCompletionDeliveryService, TaskFlowControllerRuntimeFactory, TaskFlowMaintenanceService, TaskFlowService } from "@openrill/task-flows";
import { registerMemoryTools } from "@openrill/tools-memory";
import { registerGoalTools } from "@openrill/tools-goals";
import { registerToolDiscoveryTools, resolveToolDiscoveryView, TOOL_DISCOVERY_SYSTEM_INSTRUCTIONS } from "@openrill/tool-discovery";
import { AutomationDefinitionService, AutomationError, AutomationScheduler, type AutomationExecutionContext, type AutomationExecutionResult } from "@openrill/automation";
import { BrowserRuntime, registerBrowserTools, type BrowserDriver } from "@openrill/browser-runtime";
import { createPlaywrightBrowserDriver } from "@openrill/browser-playwright";
import { ConfiguredModelResolver } from "./model-resolver.js";
import { AgentRunCoordinator } from "./run-coordinator.js";
import { AutomationConversationExecutor } from "./automation-conversation-executor.js";
import { MaintenanceRetentionCoordinator } from "./maintenance-retention.js";
import { registerTaskFlowControllerTools, TASK_FLOW_CONTROLLER_SYSTEM_INSTRUCTIONS, TASK_FLOW_CONTROLLER_TOOL_NAMES } from "./task-flow-controller-tools.js";
import { StateBrowserToolLedger } from "./browser-operation-ledger.js";
import { LocalExtensionRuntimeRegistry } from "./extension-runtime.js";
import { ConnectorAdapterRegistry, ConnectorRuntimeService } from "@openrill/connectors";
import { SkillRunService, resolveManagedSkillRoots } from "./skill-run-service.js";
import { closeHttpServer, createLifecycleRequestHandler, listenHttpServer } from "./control-server.js";
import { ControlUiService } from "./control-ui-service.js";
import { attachLocalProtocolServer } from "./transport/protocol-server.js";
import { HostLifecycleError } from "./errors.js";
import { acquireHostLock } from "./lock.js";
import { toPublicHostStatus, writeJsonAtomic, type HostPrivateMetadata, type HostLockPayload } from "./metadata.js";

export const DEFAULT_HOST_BIND = OPENRILL_DEFAULT_HOST_BIND;
export const DEFAULT_HOST_PORT = OPENRILL_DEFAULT_HOST_PORT;
const DEFAULT_AGENT_SYSTEM_INSTRUCTIONS = "You are OpenRill, a local autonomous agent. Use only declared tools and return concise, accurate results.";

export interface StartLocalHostOptions {
  readonly profile?: string;
  readonly bind?: string;
  readonly port?: number;
  readonly force?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly readyDelayMs?: number;
  readonly forceMinimumAgeMs?: number;
  readonly now?: () => number;
  readonly createInstanceId?: () => string;
  readonly createControlToken?: () => string;
  readonly createProtocolToken?: () => string;
  readonly protocolHandshakeTimeoutMs?: number;
  readonly protocolNoticeWindowSize?: number;
  readonly workspaceIds?: readonly string[];
  readonly config?: OpenRillConfig;
  readonly configRoot?: string;
  readonly bundledSkillRoots?: readonly string[];
  readonly controlUiRoot?: string;
  readonly automationExecutor?: (context: AutomationExecutionContext) => Promise<AutomationExecutionResult>;
  readonly automationLeaseDurationMs?: number;
  readonly automationRenewIntervalMs?: number;
  readonly automationAutoArm?: boolean;
  readonly maintenanceAutoArm?: boolean;
  readonly browserDriver?: BrowserDriver;
  readonly modelResolver?: ModelAdapterResolver;
  readonly osSecretProvider?: OsSecretProvider;
}

export interface LocalConversationInput {
  readonly workspaceId: string;
  readonly conversationId?: string;
  readonly modelProfile?: string;
  readonly text: string;
  readonly title?: string;
  readonly submissionKey?: string;
  readonly timeoutMs?: number;
}

export interface LocalConversationFailure {
  readonly code: string;
  readonly message: string;
}

export interface LocalConversationResult {
  readonly conversationId: string;
  readonly runId: string;
  readonly status: "COMPLETED" | "FAILED" | "CANCELLED";
  readonly terminalReason: string;
  readonly assistantText: string;
  readonly usage: AgentKernelUsage;
  readonly messageCount: number;
  readonly lastMessageSequence: number;
  readonly failure: LocalConversationFailure | null;
}

export interface LocalHostHandle {
  readonly paths: OpenRillProfilePaths;
  readonly port: number;
  readonly ready: Promise<HostStatusPayload>;
  readonly closed: Promise<void>;
  readonly status: () => HostStatusPayload;
  readonly close: (reason?: string) => Promise<void>;
  readonly publishNotice: (topic: string, data: unknown) => void;
  readonly runConversation: (input: LocalConversationInput) => Promise<LocalConversationResult>;
}

function assertLoopbackBind(bind: string): void {
  if (bind !== "127.0.0.1" && bind !== "::1") {
    throw new HostLifecycleError("HOST_STARTUP_FAILED", `STEP002 Host bind must be loopback: ${bind}`);
  }
}

function assertPort(port: number): void {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new HostLifecycleError("HOST_STARTUP_FAILED", `invalid Host port: ${port}`);
  }
}

export async function startLocalHost(options: StartLocalHostOptions = {}): Promise<LocalHostHandle> {
  const paths = resolveProfilePaths({
    ...(options.profile !== undefined ? { profile: options.profile } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
  });
  const bind = options.bind ?? DEFAULT_HOST_BIND;
  const requestedPort = options.port ?? DEFAULT_HOST_PORT;
  assertLoopbackBind(bind);
  assertPort(requestedPort);
  let resolvedBrowserDriver = options.browserDriver;
  let resolvedBrowserExecutablePath = options.config?.browser.executablePath;
  if (options.config?.browser.enabled && !resolvedBrowserDriver) {
    try {
      if (resolvedBrowserExecutablePath && !isAbsolute(resolvedBrowserExecutablePath)) {
        resolvedBrowserExecutablePath = resolve(options.configRoot ?? paths.configRoot, resolvedBrowserExecutablePath);
      }
      const defaultBrowserDriver = createPlaywrightBrowserDriver({
        ...(resolvedBrowserExecutablePath ? { executablePath: resolvedBrowserExecutablePath } : {}),
        ...(options.env ? { env: options.env } : {}),
      });
      resolvedBrowserDriver = defaultBrowserDriver;
      resolvedBrowserExecutablePath = defaultBrowserDriver.executable.executablePath;
    } catch (error) {
      throw new HostLifecycleError("HOST_STARTUP_FAILED", "Browser executable preflight failed before profile lock acquisition", error);
    }
  }
  const now = options.now ?? Date.now;
  const instanceId = (options.createInstanceId ?? randomUUID)();
  const controlToken = (options.createControlToken ?? (() => randomBytes(32).toString("base64url")))();
  const protocolToken = (options.createProtocolToken ?? (() => randomBytes(32).toString("base64url")))();
  const hostStartedAt = now();
  const startedAt = new Date(hostStartedAt).toISOString();
  let state: HostLifecycleState = "STARTING";
  let actualPort = requestedPort;
  let metadataWritten = false;
  let closePromise: Promise<void> | null = null;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
  let resolveReady!: (status: HostStatusPayload) => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<HostStatusPayload>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // The Host owns the readiness task even when a caller closes before awaiting ready.
  void ready.catch(() => undefined);
  let readinessTask: Promise<void> | null = null;
  let readinessDelayTimer: NodeJS.Timeout | null = null;
  let resolveReadinessDelay: (() => void) | null = null;

  const waitForReadinessDelay = (milliseconds: number): Promise<void> => {
    if (milliseconds <= 0) return Promise.resolve();
    return new Promise((resolveDelay) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        readinessDelayTimer = null;
        resolveReadinessDelay = null;
        resolveDelay();
      };
      readinessDelayTimer = setTimeout(settle, milliseconds);
      readinessDelayTimer.unref();
      resolveReadinessDelay = () => {
        if (readinessDelayTimer) clearTimeout(readinessDelayTimer);
        settle();
      };
    });
  };
  const cancelReadinessDelay = () => { resolveReadinessDelay?.(); };

  const lockPayload: HostLockPayload = {
    schemaVersion: 1, product: "OpenRill", version: "0.25.0-step023a", profile: paths.profile,
    pid: process.pid, instanceId, createdAt: startedAt,
  };
  const lock = await acquireHostLock({
    paths,
    payload: lockPayload,
    now,
    ...(options.force !== undefined ? { force: options.force } : {}),
    ...(options.forceMinimumAgeMs !== undefined ? { forceMinimumAgeMs: options.forceMinimumAgeMs } : {}),
  });

  let stateDatabase: OpenRillStateDatabase | null = null;
  let conversations: ConversationService;
  let workspaceCatalog: WorkspaceCatalog | null = null;
  let workspaceIds: readonly string[] = [];
  try {
    stateDatabase = await openOpenRillStateDatabase({ profilePaths: paths, now });
    if (options.config?.workspaces.length) {
      workspaceCatalog = await createWorkspaceCatalog(options.config.workspaces, {
        baseDirectory: options.configRoot ?? paths.configRoot,
      });
      stateDatabase.transaction((repositories) => {
        for (const descriptor of workspaceCatalog!.list()) {
          const internal = workspaceCatalog!.internal(descriptor.workspaceId);
          repositories.workspaces.upsertWorkspace({
            workspaceId: internal.workspaceId,
            displayName: internal.displayName,
            canonicalRoot: internal.canonicalRoot,
            rootRevision: internal.rootRevision,
            accessMode: internal.accessMode,
            trustState: internal.trustState,
            updatedAt: now(),
          });
        }
      });
    }
    const configuredWorkspaceIds = workspaceCatalog?.list().map((workspace) => workspace.workspaceId) ?? [];
    workspaceIds = options.workspaceIds ?? (configuredWorkspaceIds.length > 0 ? configuredWorkspaceIds : ["default"]);
    conversations = new ConversationService({ state: stateDatabase, workspaceIds, now });
    stateDatabase.transaction((repositories) => repositories.browser.recoverInterruptedOperations({ recoveredAt: now() }));
    conversations.recoverIncompleteRuns();
  } catch (error) {
    try { stateDatabase?.close(); } catch { /* preserve startup failure */ }
    await lock.release().catch(() => undefined);
    throw new HostLifecycleError(
      "HOST_STARTUP_FAILED",
      `OpenRill state/workspace startup failed for profile ${paths.profile}`,
      error,
    );
  }

  if (!stateDatabase || !conversations) {
    await lock.release().catch(() => undefined);
    throw new HostLifecycleError("HOST_STARTUP_FAILED", `OpenRill startup did not initialize required services for profile ${paths.profile}`);
  }

  const getPrivateMetadata = (): HostPrivateMetadata => ({
    schemaVersion: 1, product: "OpenRill", version: "0.25.0-step023a", profile: paths.profile,
    pid: process.pid, instanceId, bind, port: actualPort, startedAt, state, readiness: state === "READY", controlToken, protocolToken,
  });
  const getStatus = (): HostStatusPayload => toPublicHostStatus(getPrivateMetadata());
  let metadataWriteTail: Promise<void> = Promise.resolve();
  const persist = (): Promise<void> => {
    const snapshot = getPrivateMetadata();
    const write = metadataWriteTail.then(async () => {
      await writeJsonAtomic(paths.metadataPath, snapshot);
      metadataWritten = true;
    });
    metadataWriteTail = write.catch(() => undefined);
    return write;
  };

  const controlUiService = new ControlUiService(stateDatabase);
  const tasks = new TaskService(stateDatabase, workspaceIds);
  const taskFlows = new TaskFlowService(stateDatabase, tasks, workspaceIds, now);
  const automationDefinitions = new AutomationDefinitionService({ state: stateDatabase, now });
  const connectorRuntime = new ConnectorRuntimeService({ state: stateDatabase, conversations, workspaceIds, now });
  let runCoordinator: AgentRunCoordinator | null = null;
  let publishUiNotice: (topic: string, data: unknown) => void = () => {};
  const connectorRecovery = {
    ingress: connectorRuntime.recoverExpiredIngressClaims(),
    delivery: connectorRuntime.recoverExpiredDeliveryClaims(),
  };
  const connectorAdapters = new ConnectorAdapterRegistry({
    service: connectorRuntime,
    now,
    onRunAdmitted: (input) => {
      const scheduled = runCoordinator?.schedule(input.runId) ?? false;
      publishUiNotice("connector.run.admitted", { ...input, scheduled });
    },
  });
  let automationScheduler: AutomationScheduler | null = null;
  let maintenanceSweepTimer: NodeJS.Timeout | null = null;
  let maintenanceSweepActive = false;
  let delegationSweepTimer: NodeJS.Timeout | null = null;
  let delegationSweepActive = false;
  const extensionRegistry = new LocalExtensionRuntimeRegistry({
    hostVersion: "0.25.0-step023a",
    configRoot: options.configRoot ?? paths.configRoot,
    roots: options.config?.extensions?.roots ?? [],
    enabled: options.config?.extensions?.enabled ?? [],
    settings: options.config?.extensions?.settings ?? {},
    ...(options.env ? { env: options.env } : {}),
    ...(options.osSecretProvider ? { osSecretProvider: options.osSecretProvider } : {}),
    publishNotice: (topic, data) => publishUiNotice(topic, data),
    connectorRegistry: connectorAdapters,
  });
  let closeRequested = false;
  let closeHost: (reason?: string) => Promise<void> = async () => {};
  const server = http.createServer(createLifecycleRequestHandler({
    controlToken,
    protocolToken,
    controlUiRoot: options.controlUiRoot ?? resolve(import.meta.dirname, "../../../apps/agent-web/dist/public"),
    getStatus,
    getControlUiWorkspaces: () => controlUiService.listWorkspaces().items,
    readArtifactContent: (artifactId, fileName) => controlUiService.readArtifactContent(artifactId, fileName),
    requestStop: () => {
      if (closeRequested || state === "STOPPING" || state === "STOPPED") return false;
      closeRequested = true;
      setImmediate(() => { void closeHost("control"); });
      return true;
    },
  }));
  const approvals = new ApprovalService({
    state: stateDatabase,
    now,
    timeoutMs: options.config?.execution.approvalTimeoutMs ?? 120_000,
  });
  const delegations = new DelegationService({ state: stateDatabase, workspaceIds, now });
  const tools = new ToolRegistry();
  let artifacts: WorkspaceArtifactStore | undefined;
  if (workspaceCatalog) {
    artifacts = createWorkspaceArtifactStore({
      rootDirectory: join(stateDatabase.paths.stateDir, "workspace-artifacts"),
      metadataSink: {
        recordArtifact: (metadata) => {
          stateDatabase!.transaction((repositories) => { repositories.workspaces.insertArtifact(metadata); });
          publishUiNotice("artifact.created", {
            artifactId: metadata.artifactId, runId: metadata.runId, workspaceId: metadata.workspaceId,
            kind: metadata.kind, relativePath: metadata.relativePath, operation: metadata.operation,
            sizeBytes: metadata.sizeBytes, createdAt: metadata.createdAt,
          });
        },
      },
      now,
    });
  }
  let browserRuntime: BrowserRuntime | null = null;
  if (options.config?.browser.enabled) {
    browserRuntime = new BrowserRuntime({
      driver: resolvedBrowserDriver!,
      headless: options.config.browser.headless,
      ...(resolvedBrowserExecutablePath ? { executablePath: resolvedBrowserExecutablePath } : {}),
      limits: {
        maxSessions: options.config.browser.maxSessions,
        maxPagesPerSession: options.config.browser.maxPagesPerSession,
        launchTimeoutMs: options.config.browser.launchTimeoutMs,
        actionTimeoutMs: options.config.browser.actionTimeoutMs,
        idleTimeoutMs: options.config.browser.idleTimeoutMs,
        sweepIntervalMs: options.config.browser.sweepIntervalMs,
      },
      policy: {
        navigation: {
          allowPrivateNetwork: options.config.browser.allowPrivateNetwork,
          allowedHostnames: options.config.browser.allowedHostnames,
        },
        popup: "DENY",
        download: "EXPLICIT_ARTIFACT_ONLY",
        persistentStorage: "DENY",
        dialog: "BLOCK_AND_DISMISS",
      },
      ...(artifacts ? { artifacts } : {}),
      now,
    });
    registerBrowserTools(tools, browserRuntime, { ledger: new StateBrowserToolLedger(stateDatabase), now });
  }
  let processManager: ProcessManager | null = null;
  let skillRunService: SkillRunService | null = null;
  let memoryService: MemoryService | null = null;
  let goalService: GoalService | null = null;
  if (workspaceCatalog) {
    memoryService = new MemoryService(stateDatabase, { now });
    goalService = new GoalService(stateDatabase, { now });
    registerMemoryTools(tools, memoryService);
    registerGoalTools(tools, goalService);
    registerWorkspaceFileTools(tools, { workspaces: workspaceCatalog, artifacts: artifacts! });
    if (options.config) {
      const execution = options.config.execution;
      const mode = execution.approvalMode;
      const backend = execution.backend ?? "host";
      const fallback = execution.fallback ?? "deny";
      const mountMode = execution.mountMode ?? "readOnly";
      const networkMode = execution.networkMode ?? "none";
      const docker = execution.docker;
      const hostExecutionBackend = createHostExecutionBackend({ workspaces: workspaceCatalog, now });
      let dockerExecutionBackend: DockerExecutionBackend | undefined;
      if (docker?.image) {
        dockerExecutionBackend = createDockerExecutionBackend({
          cli: createNodeDockerCli(docker.executable ?? "docker"),
          image: docker.image,
          profile: docker.profile ?? paths.profile,
          memoryBytes: docker.memoryBytes ?? 536_870_912,
          pidsLimit: docker.pidsLimit ?? 256,
          now,
        });
      }
      if (backend === "docker" && dockerExecutionBackend) {
        const availability = await dockerExecutionBackend.doctor();
        if (availability.available) await dockerExecutionBackend.pruneStale();
      }
      processManager = new ProcessManager({
        state: stateDatabase,
        workspaces: workspaceCatalog,
        approvals,
        policy: { defaultDecision: mode === "allow" ? "ALLOW" : mode === "deny" ? "DENY" : "PROMPT" },
        rootDirectory: join(stateDatabase.paths.stateDir, "processes"),
        configRoot: options.configRoot ?? paths.configRoot,
        ...(options.env ? { env: options.env } : {}),
        now,
        defaultTimeoutMs: options.config.execution.defaultTimeoutMs,
        backendRouting: {
          preferred: backend === "docker" ? "DOCKER" : "HOST",
          host: hostExecutionBackend,
          ...(dockerExecutionBackend ? { docker: dockerExecutionBackend } : {}),
          mountMode: mountMode === "readWrite" ? "READ_WRITE" : "READ_ONLY",
          networkMode: networkMode === "outbound" ? "OUTBOUND" : "NONE",
          fallback: fallback === "host" ? "HOST" : "DENY",
        },
      });
      processManager.recoverOrphans();
      registerProcessTools(tools, processManager);
    }
  }

  registerDelegationTools(tools, { delegations, scheduleChild: (runId) => runCoordinator?.ensureScheduled(runId) ?? false, now });
  registerToolDiscoveryTools(tools);
  if (workspaceCatalog && options.config) {
    const configRoot = options.configRoot ?? paths.configRoot;
    skillRunService = new SkillRunService({
      state: stateDatabase,
      conversations,
      tools,
      workspaces: workspaceCatalog,
      bundledRoots: options.bundledSkillRoots ?? [resolve(import.meta.dirname, "../../../skills/builtin/catalog")],
      managedUserRoots: resolveManagedSkillRoots(options.config.skills.roots, configRoot),
      enabledSkillIds: options.config.skills.enabled,
      snapshotRoot: stateDatabase.paths.stateDir,
      currentVersion: "0.25.0-step023a",
      now,
    });
  }
  const cancelOwnedResources = (runId: string): number => {
    let affected = approvals.cancelRun(runId).length;
    for (const record of processManager?.list(runId) ?? []) {
      if (record.status === "STARTING" || record.status === "RUNNING") {
        processManager?.cancel({ processId: record.processId });
        affected += 1;
      }
    }
    const browserSessions = browserRuntime?.snapshot().sessions.filter((session) => session.owner.runId === runId && session.state === "OPEN").length ?? 0;
    if (browserSessions > 0) {
      void browserRuntime?.cancelRun(runId);
      affected += browserSessions;
    }
    if (runCoordinator?.cancel(runId)) affected += 1;
    return affected;
  };
  const publishDelegationCompletion = (completion: ReturnType<DelegationService["completeChild"]>): void => {
    if (!completion) return;
    protocol.publishNotice("delegation.updated", {
      delegationId: completion.delegation.delegationId,
      parentRunId: completion.parentRunId,
      childRunId: completion.delegation.childRunId,
      status: completion.result.status,
    });
    if (completion.resumeParent) runCoordinator?.resume(completion.parentRunId);
  };
  const terminateDelegationOrder = (order: readonly { childRunId: string }[], terminalStatus: "CANCELLED" | "TIMED_OUT", errorCode: string): number => {
    const terminating = new Set(order.map((entry) => entry.childRunId));
    let affected = 0;
    for (const entry of order) affected += cancelOwnedResources(entry.childRunId);
    for (const entry of order) {
      const completion = delegations.terminateChild(entry.childRunId, terminalStatus, errorCode);
      if (!completion) continue;
      affected += 1;
      protocol.publishNotice("delegation.updated", {
        delegationId: completion.delegation.delegationId,
        parentRunId: completion.parentRunId, childRunId: completion.delegation.childRunId, status: completion.result.status,
      });
      if (completion.resumeParent && !terminating.has(completion.parentRunId)) runCoordinator?.resume(completion.parentRunId);
    }
    return affected;
  };
  let executeConversation!: (input: LocalConversationInput) => Promise<LocalConversationResult>;
  const runHooks = {
    schedule: (runId: string) => runCoordinator?.schedule(runId) ?? false,
    execute: (input: LocalConversationInput) => executeConversation(input),
    cancel: (runId: string) => {
      const descendants = delegations.cancellationOrder(runId);
      const affected = terminateDelegationOrder(descendants, "CANCELLED", "PARENT_CANCELLED");
      return cancelOwnedResources(runId) + affected > 0;
    },
  };
  const cancelBackgroundTask = (task: BackgroundTask): void => {
    if (task.runtime === "DELEGATION") {
      const order = delegations.subtreeCancellationOrder(task.runId);
      terminateDelegationOrder(order, "CANCELLED", "OPERATOR_CANCELLED");
      return;
    }
    const conversation = conversations.get({ workspaceId: task.workspaceId, conversationId: task.conversationId });
    conversations.cancel({ workspaceId: task.workspaceId, conversationId: conversation.conversationId, runId: task.runId });
    runHooks.cancel(task.runId);
  };
  const taskFlowRuntimeFactory = new TaskFlowControllerRuntimeFactory({
    state: stateDatabase,
    conversations,
    tasks,
    taskFlows,
    scheduleRun: (runId) => runCoordinator?.ensureScheduled(runId) ?? false,
    cancelTask: (task) => tasks.cancel(
      { workspaceId: task.workspaceId, taskId: task.taskId },
      (current) => {
        cancelBackgroundTask(current);
        dispatchRunDeliveries(current.runId);
        protocol.publishNotice("task.updated", { taskId: current.taskId, runId: current.runId, status: "CANCELLED" });
      },
    ),
    now,
  });
  const goalPlanExecutor = new GoalPlanExecutorService({
    state: stateDatabase,
    tasks,
    taskFlows,
    runtimes: taskFlowRuntimeFactory,
    now,
  });
  const taskCompletionDeliveries = new TaskCompletionDeliveryService({
    state: stateDatabase,
    conversations,
    runtimes: taskFlowRuntimeFactory,
    scheduleRun: (runId) => runCoordinator?.ensureScheduled(runId) ?? false,
    now,
  });
  const controllerToolNames = new Set<string>(TASK_FLOW_CONTROLLER_TOOL_NAMES);
  const normalToolNames = (): string[] => tools.definitions()
    .map((definition) => definition.name)
    .filter((name) => !controllerToolNames.has(name));
  registerTaskFlowControllerTools(tools, (context) => {
    const binding = taskCompletionDeliveries.bindingForWakeRun(context.runId);
    if (!binding) throw new Error(`Task Flow controller tool is not bound to wake Run ${context.runId}`);
    return {
      runtime: goalPlanExecutor.controllerForFlow(binding.flowId, {
        workspaceId: binding.workspaceId,
        ownerKey: binding.ownerKey,
        controllerId: binding.controllerId,
        expectedExecutionRevision: binding.expectedExecutionRevision,
        expectedStepRevision: binding.expectedStepRevision,
        expectedFlowRevision: binding.expectedFlowRevision,
        deliveryId: binding.deliveryId,
      }) ?? taskFlowRuntimeFactory.bind({
        workspaceId: binding.workspaceId,
        ownerKey: binding.ownerKey,
        controllerId: binding.controllerId,
      }),
      flowId: binding.flowId,
    };
  });
  const publishDeliveryResult = (result: ReturnType<TaskCompletionDeliveryService["dispatch"]>): void => {
    protocol.publishNotice("task.delivery.updated", {
      deliveryId: result.delivery.deliveryId, taskId: result.delivery.taskId,
      flowId: result.delivery.flowId, status: result.delivery.deliveryStatus,
      wakeRunId: result.delivery.wakeRunId, replayed: result.replayed, scheduled: result.scheduled,
    });
  };
  const dispatchRunDeliveries = (runId: string): void => {
    for (const result of taskCompletionDeliveries.deliverRun(runId)) publishDeliveryResult(result);
  };

  const taskMaintenance = new TaskMaintenanceService({
    state: stateDatabase,
    workspaceIds,
    now,
    hostStartedAt,
    taskRetentionMs: options.config?.maintenance?.taskRetentionMs ?? 30 * 24 * 60 * 60_000,
    lostRetentionMs: options.config?.maintenance?.lostTaskRetentionMs ?? 7 * 24 * 60 * 60_000,
    runtimeAuthorityAvailable: () => runCoordinator !== null,
    isRunActive: (runId) => runCoordinator?.isActive(runId) ?? false,
    isRunExpectedIdle: (runId) => {
      try {
        return conversations.executionContext(runId).run.status === "WAITING_APPROVAL" || delegations.waitState(runId) !== null;
      } catch {
        return false;
      }
    },
    markRunLost: (runId) => { conversations.markExecutionLost(runId); },
  });
  const taskFlowMaintenance = new TaskFlowMaintenanceService({
    state: stateDatabase,
    workspaceIds,
    now,
    flowRetentionMs: options.config?.maintenance?.flowRetentionMs ?? 30 * 24 * 60 * 60_000,
    lostRetentionMs: options.config?.maintenance?.lostFlowRetentionMs ?? 7 * 24 * 60 * 60_000,
    cancelFlow: (input) => taskFlows.cancel(input, (task) => tasks.cancel(
      { workspaceId: task.workspaceId, taskId: task.taskId },
      (current) => {
        cancelBackgroundTask(current);
        dispatchRunDeliveries(current.runId);
        protocol.publishNotice("task.updated", { taskId: current.taskId, runId: current.runId, status: "CANCELLED", maintenance: true });
      },
    )),
  });
  const maintenanceRetention = new MaintenanceRetentionCoordinator({
    state: stateDatabase,
    workspaceIds,
    ownerId: instanceId,
    taskMaintenance,
    taskFlowMaintenance,
    now,
    leaseDurationMs: options.config?.maintenance?.leaseDurationMs ?? 120_000,
    batchSize: options.config?.maintenance?.batchSize ?? 100,
    connectorDeliveryRetentionMs: options.config?.maintenance?.connectorDeliveryRetentionMs ?? 30 * 24 * 60 * 60_000,
  });
  const bindTaskFlowRuntime = (input: { workspaceId: string; ownerKey: string; controllerId: string }) => taskFlowRuntimeFactory.bind(input);
  const resolveTaskFlowRuntime = (input: { workspaceId: string; ownerKey: string; controllerId: string; flowId: string }) =>
    goalPlanExecutor.controllerForFlow(input.flowId, input) ?? taskFlowRuntimeFactory.bind(input);
  const appendApprovalResult = (request: ApprovalRequestView, output: unknown, isError: boolean): void => {
    conversations.appendApprovalToolResult({
      runId: request.runId,
      requestId: request.requestId,
      toolCallId: request.toolCallId,
      name: request.toolName,
      output,
      isError,
    });
    runCoordinator?.resume(request.runId);
  };
  const protocol = attachLocalProtocolServer(server, {
    profileToken: protocolToken,
    getStatus,
    conversations,
    runHooks,
    controlUiHooks: {
      snapshot: () => ({ cursor: 0 }),
      listWorkspaces: () => controlUiService.listWorkspaces(),
      listArtifacts: (input) => controlUiService.listArtifacts(input),
      getArtifact: (input) => controlUiService.getArtifact(input),
    },
    extensionHooks: {
      list: () => ({ items: extensionRegistry.list() }),
      get: (input) => extensionRegistry.get(input.extensionId),
      enable: (input) => extensionRegistry.enable(input.extensionId),
      disable: (input) => extensionRegistry.disable(input.extensionId),
    },
    connectorHooks: {
      listAccounts: (input) => ({ items: connectorRuntime.listAccounts(input.connectorId) }),
      listIngress: (input) => ({ items: connectorRuntime.listIngress(input).map(({ payload: _payload, claimToken: _claimToken, lastErrorSummary: _lastErrorSummary, ...item }) => item) }),
      listDeliveries: (input) => ({ items: connectorRuntime.listDeliveries(input).map(({ payload: _payload, claimToken: _claimToken, lastErrorSummary: _lastErrorSummary, ...item }) => item) }),
      listDeadLetters: (input) => ({ items: connectorRuntime.listDeadLetters(input).map(({ summary: _summary, ...item }) => item) }),
      status: (input) => connectorAdapters.status(input.connectorId),
      doctor: (input) => connectorAdapters.doctor(input.connectorId),
    },
    maintenanceHooks: {
      preview: (input) => maintenanceRetention.preview(input),
      prune: (input) => {
        const result = maintenanceRetention.prune(input);
        protocol.publishNotice("maintenance.retention", {
          workspaceId: result.workspaceId, state: result.state, scanned: result.scanned,
          protected: result.protected, pruned: result.pruned, scheduled: result.scheduled,
        });
        return result;
      },
      tombstones: (input) => ({ items: maintenanceRetention.listTombstones(input) }),
    },
    taskHooks: {
      list: (input) => ({ items: tasks.list(input) }),
      get: (input) => tasks.get(input),
      cancel: (input) => tasks.cancel(input, (task) => {
        cancelBackgroundTask(task);
        dispatchRunDeliveries(task.runId);
        protocol.publishNotice("task.updated", { taskId: task.taskId, runId: task.runId, status: "CANCELLED" });
      }),
      audit: (input) => taskMaintenance.audit(input),
      reconcile: (input) => {
        const result = taskMaintenance.reconcile(input);
        protocol.publishNotice("task.maintenance", { workspaceId: input.workspaceId, mode: input.mode, reconciled: result.reconciled, lost: result.lost, retentionScheduled: result.retentionScheduled });
        if (input.mode === "APPLY") taskCompletionDeliveries.drain();
        return result;
      },
      retentionPreview: (input) => taskMaintenance.retentionPreview(input),
    },
    taskFlowHooks: {
      list: (input) => ({ items: taskFlows.list(input) }),
      get: (input) => taskFlows.get(input),
      create: (input) => {
        const runtime = bindTaskFlowRuntime(input);
        const result = runtime.createManaged(input);
        protocol.publishNotice("taskFlow.updated", {
          flowId: result.flow.flowId, workspaceId: result.flow.workspaceId,
          ownerKey: result.flow.ownerKey, controllerId: result.flow.controllerId,
          status: result.flow.status, revision: result.flow.revision, replayed: result.replayed,
        });
        return result;
      },
      run: (input) => {
        const runtime = resolveTaskFlowRuntime(input);
        const result = runtime.runTask(input);
        protocol.publishNotice("task.updated", {
          taskId: result.task.taskId, runId: result.run.runId, status: result.task.status,
          flowId: result.flow.flow.flowId, scheduled: result.scheduled, replayed: result.replayed,
        });
        protocol.publishNotice("taskFlow.updated", {
          flowId: result.flow.flow.flowId, workspaceId: result.flow.flow.workspaceId,
          ownerKey: result.flow.flow.ownerKey, controllerId: result.flow.flow.controllerId,
          status: result.flow.flow.status, revision: result.flow.flow.revision,
          admittedTaskId: result.task.taskId, scheduled: result.scheduled, replayed: result.replayed,
        });
        return result;
      },
      wait: (input) => {
        const flow = resolveTaskFlowRuntime(input).setWaiting(input);
        protocol.publishNotice("taskFlow.updated", flow);
        return flow;
      },
      resume: (input) => {
        const flow = resolveTaskFlowRuntime(input).resume(input);
        protocol.publishNotice("taskFlow.updated", flow);
        return flow;
      },
      finish: (input) => {
        const flow = resolveTaskFlowRuntime(input).finish(input);
        protocol.publishNotice("taskFlow.updated", flow);
        return flow;
      },
      fail: (input) => {
        const flow = resolveTaskFlowRuntime(input).fail(input);
        protocol.publishNotice("taskFlow.updated", flow);
        return flow;
      },
      cancel: (input) => {
        const goalRuntime = goalPlanExecutor.controllerForFlow(input.flowId, {
          workspaceId: input.workspaceId,
          ownerKey: input.ownerKey,
          controllerId: taskFlows.get(input).flow.controllerId,
        });
        const result = goalRuntime
          ? goalRuntime.cancel({ flowId: input.flowId, expectedRevision: input.expectedRevision })
          : taskFlows.cancel(input, (task) => tasks.cancel(
              { workspaceId: task.workspaceId, taskId: task.taskId },
              (current) => {
                cancelBackgroundTask(current);
                dispatchRunDeliveries(current.runId);
                protocol.publishNotice("task.updated", { taskId: current.taskId, runId: current.runId, status: "CANCELLED" });
              },
            ));
        protocol.publishNotice("taskFlow.updated", {
          flowId: result.flow.flow.flowId, workspaceId: result.flow.flow.workspaceId,
          status: result.flow.flow.status, revision: result.flow.flow.revision,
          affectedTasks: result.affectedTasks,
        });
        return result;
      },
      audit: (input) => taskFlowMaintenance.audit(input),
      reconcile: (input) => {
        const result = taskFlowMaintenance.reconcile(input);
        protocol.publishNotice("taskFlow.maintenance", { workspaceId: input.workspaceId, ownerKey: input.ownerKey, mode: input.mode, cancellationReplayed: result.cancellationReplayed, cancelled: result.cancelled, retentionScheduled: result.retentionScheduled });
        if (input.mode === "APPLY") taskCompletionDeliveries.drain();
        return result;
      },
      retentionPreview: (input) => taskFlowMaintenance.retentionPreview(input),
    },
    goalExecutionHooks: {
      start: (input) => {
        const result = goalPlanExecutor.start(input);
        protocol.publishNotice("goalExecution.updated", {
          goalId: result.view.goal.goalId, flowId: result.view.execution.flowId,
          status: result.view.execution.status, revision: result.view.execution.revision,
          admitted: result.admitted, scheduled: result.scheduled, replayed: result.replayed,
        });
        return result;
      },
      get: (input) => goalPlanExecutor.get(input),
      revisePlan: (input) => {
        const result = goalPlanExecutor.revisePlan(input);
        protocol.publishNotice("goalExecution.plan.revised", result);
        return result;
      },
      adoptPlanRevision: (input) => {
        const result = goalPlanExecutor.adoptPlanRevision(input);
        protocol.publishNotice("goalExecution.updated", {
          goalId: result.view.goal.goalId, flowId: result.view.execution.flowId,
          status: result.view.execution.status, revision: result.view.execution.revision,
          planRevision: result.planRevision, action: result.action, scheduled: result.scheduled,
        });
        return result;
      },
      retry: (input) => {
        const result = goalPlanExecutor.retry(input);
        protocol.publishNotice("goalExecution.updated", {
          goalId: result.view.goal.goalId, flowId: result.view.execution.flowId,
          status: result.view.execution.status, revision: result.view.execution.revision,
          action: result.action, scheduled: result.scheduled, blockerId: result.blocker?.blockerId ?? null,
        });
        return result;
      },
      resolveBlocker: (input) => {
        const result = goalPlanExecutor.resolveBlocker(input);
        protocol.publishNotice("goalExecution.updated", {
          goalId: result.view.goal.goalId, flowId: result.view.execution.flowId,
          status: result.view.execution.status, revision: result.view.execution.revision,
          action: result.action, scheduled: result.scheduled, blockerId: result.blocker.blockerId,
        });
        return result;
      },
      resume: (input) => {
        const result = goalPlanExecutor.resume(input);
        protocol.publishNotice("goalExecution.updated", {
          goalId: result.view.goal.goalId, flowId: result.view.execution.flowId,
          status: result.view.execution.status, revision: result.view.execution.revision,
          action: result.action, scheduled: result.scheduled,
        });
        return result;
      },
      cancel: (input) => {
        const result = goalPlanExecutor.cancel(input);
        protocol.publishNotice("goalExecution.updated", {
          goalId: result.goal.goalId, flowId: result.execution.flowId,
          status: result.execution.status, revision: result.execution.revision,
        });
        return result;
      },
    },
    delegationHooks: {
      list: (input) => ({ items: delegations.listPublic(input) }),
      get: (input) => delegations.getPublic(input.delegationId),
      cancel: (input) => {
        const before = delegations.getPublic(input.delegationId);
        const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"]);
        if (terminal.has(before.status)) {
          return { delegation: before, affectedRuns: 0, replayed: true };
        }
        const order = delegations.subtreeCancellationOrder(before.childRunId);
        const affectedRuns = terminateDelegationOrder(order, "CANCELLED", "OPERATOR_CANCELLED");
        const delegation = delegations.getPublic(input.delegationId);
        protocol.publishNotice("delegation.updated", {
          delegationId: delegation.delegationId, parentRunId: delegation.parentRunId,
          childRunId: delegation.childRunId, status: delegation.status, operatorCancelled: true,
        });
        return { delegation, affectedRuns, replayed: false };
      },
    },
    automationHooks: {
      create: (input) => {
        const job = automationDefinitions.create(input);
        protocol.publishNotice("automation.job.updated", job);
        return job;
      },
      list: (input) => ({ items: automationDefinitions.list(input) }),
      get: (input) => automationDefinitions.get(input.jobId),
      update: (input) => {
        const job = automationDefinitions.update(input.jobId, input.expectedRevision, input.patch);
        protocol.publishNotice("automation.job.updated", job);
        return job;
      },
      runNow: async (input) => {
        if (!automationScheduler) throw new AutomationError("AUTOMATION_SCHEDULER_NOT_STARTED", "automation scheduler is unavailable");
        const result = automationDefinitions.runNow(input.jobId, input.requestKey);
        protocol.publishNotice("automation.run.updated", result.run);
        await automationScheduler.wake();
        return result;
      },
      history: (input) => ({ items: automationDefinitions.listRuns(input.jobId, input.limit ?? 100) }),
    },
    approvalHooks: {
      list: (input) => ({ items: approvals.list(input.status) }),
      get: (input) => approvals.get(input.requestId),
      resolve: async (input) => {
        const resolution = approvals.resolve(input);
        let execution: unknown = null;
        if (resolution.request.status === "DENIED") {
          const output = { error: { code: "APPROVAL_DENIED", message: "process execution denied by operator" } };
          approvals.recordApprovalTerminalResult(resolution.request.requestId, "DENIED", output, "APPROVAL_DENIED");
          appendApprovalResult(resolution.request, output, true);
        } else if (resolution.request.status === "APPROVED") {
          if (!processManager) throw new HostLifecycleError("HOST_STARTUP_FAILED", "process manager is unavailable for approved execution");
          const executed = await processManager.executeApproved(resolution.request.requestId);
          execution = executed.result.output;
          appendApprovalResult(resolution.request, executed.result.output, executed.result.isError);
        } else if (resolution.request.status === "CONSUMED") {
          runCoordinator?.resume(resolution.request.runId);
        }
        const request = approvals.get(resolution.request.requestId);
        protocol.publishNotice("approval.updated", { requestId: request.requestId, runId: request.runId, status: request.status, decision: request.decision });
        if (execution && typeof execution === "object") protocol.publishNotice("process.updated", execution);
        return { request, replayed: resolution.replayed, execution };
      },
      cancel: (input) => {
        const request = approvals.cancel(input.requestId);
        if (request.status === "CANCELLED") {
          const output = { error: { code: "APPROVAL_CANCELLED", message: "approval request cancelled" } };
          approvals.recordApprovalTerminalResult(request.requestId, "CANCELLED", output, "APPROVAL_CANCELLED");
          appendApprovalResult(request, output, true);
        }
        protocol.publishNotice("approval.updated", { requestId: request.requestId, runId: request.runId, status: request.status, decision: request.decision });
        return { request: approvals.get(request.requestId) };
      },
    },
    ...(options.protocolHandshakeTimeoutMs !== undefined ? { handshakeTimeoutMs: options.protocolHandshakeTimeoutMs } : {}),
    ...(options.protocolNoticeWindowSize !== undefined ? { noticeWindowSize: options.protocolNoticeWindowSize } : {}),
  });
  publishUiNotice = (topic, data) => { protocol.publishNotice(topic, data); };
  let approvalExpiryTimer: NodeJS.Timeout | null = null;
  if (processManager) {
    approvalExpiryTimer = setInterval(() => {
      for (const requestId of approvals.expirePending()) {
        try {
          const request = approvals.get(requestId);
          const output = { error: { code: "APPROVAL_EXPIRED", message: "approval request expired" } };
          approvals.recordApprovalTerminalResult(requestId, "CANCELLED", output, "APPROVAL_EXPIRED");
          appendApprovalResult(request, output, true);
          protocol.publishNotice("approval.updated", { requestId, runId: request.runId, status: request.status, decision: request.decision });
        } catch {
          // A concurrent cancellation or terminal Run owns the final state.
        }
      }
    }, 250);
    approvalExpiryTimer.unref();
  }
  const agentSystemInstructions = [
    DEFAULT_AGENT_SYSTEM_INSTRUCTIONS,
    memoryService ? MEMORY_SYSTEM_INSTRUCTIONS : null,
    goalService ? GOAL_SYSTEM_INSTRUCTIONS : null,
  ].filter(Boolean).join("\n\n");
  if (options.config && Object.keys(options.config.modelProviders).length > 0) {
    runCoordinator = new AgentRunCoordinator({
      conversations,
      models: options.modelResolver ?? new ConfiguredModelResolver({
        config: options.config,
        configRoot: options.configRoot ?? paths.configRoot,
        ...(options.env ? { env: options.env } : {}),
        ...(options.osSecretProvider ? { osSecretProvider: options.osSecretProvider } : {}),
      }),
      tools,
      delegations,
      resolveRunPreparation: async (runId: string) => {
        const wakeBinding = taskCompletionDeliveries.bindingForWakeRun(runId);
        if (wakeBinding) {
          (goalPlanExecutor.controllerForFlow(wakeBinding.flowId, {
            workspaceId: wakeBinding.workspaceId,
            ownerKey: wakeBinding.ownerKey,
            controllerId: wakeBinding.controllerId,
            expectedExecutionRevision: wakeBinding.expectedExecutionRevision,
            expectedStepRevision: wakeBinding.expectedStepRevision,
            expectedFlowRevision: wakeBinding.expectedFlowRevision,
            deliveryId: wakeBinding.deliveryId,
          }) ?? taskFlowRuntimeFactory.bind({
            workspaceId: wakeBinding.workspaceId,
            ownerKey: wakeBinding.ownerKey,
            controllerId: wakeBinding.controllerId,
          })).get(wakeBinding.flowId);
          return {
            systemInstructions: TASK_FLOW_CONTROLLER_SYSTEM_INSTRUCTIONS,
            modelToolNames: [...TASK_FLOW_CONTROLLER_TOOL_NAMES],
          };
        }
        const budget = delegations.budget(runId);
        if (budget?.parentRunId) return { systemInstructions: agentSystemInstructions, modelToolNames: normalToolNames() };
        const execution = conversations.executionContext(runId);
        const goalContext = execution.run.status === "WAITING_APPROVAL"
          ? goalService?.readContext({
              workspaceId: execution.conversation.workspaceId,
              conversationId: execution.conversation.conversationId,
            }) ?? null
          : goalService?.prepareContext({
              workspaceId: execution.conversation.workspaceId,
              conversationId: execution.conversation.conversationId,
              sourceRunId: runId,
              sourceAttemptId: execution.attempt.attemptId,
            }) ?? null;
        const baseInstructions = `${agentSystemInstructions}${goalContext ?? ""}`;
        const resolved = skillRunService
          ? await skillRunService.resolveForRun(runId, baseInstructions)
          : null;
        const preferredToolNames = resolved
          ? resolved.snapshots.flatMap((snapshot) => snapshot.manifest.tools)
          : [];
        const discovery = resolveToolDiscoveryView(tools, { preferredToolNames });
        return {
          systemInstructions: `${resolved?.systemInstructions ?? baseInstructions}${discovery.compacted ? TOOL_DISCOVERY_SYSTEM_INSTRUCTIONS : ""}`,
          modelToolNames: discovery.visibleNames.filter((name) => !controllerToolNames.has(name)),
        };
      },
      onRunTerminal: async (result) => {
        const connectorProjection = connectorRuntime.projectRunOutput(result.runId);
        if (connectorProjection.kind === "delivery") {
          protocol.publishNotice("connector.delivery.projected", {
            runId: result.runId,
            connectorId: connectorProjection.connectorId,
            accountId: connectorProjection.accountId,
            deliveryId: connectorProjection.delivery.deliveryId,
            replayed: connectorProjection.replayed,
          });
          const registration = connectorAdapters.get(connectorProjection.connectorId);
          if (registration) await registration.port.drainDeliveries({ accountId: connectorProjection.accountId, limit: 100 });
        }
        const goalExecution = goalPlanExecutor.reconcileRun(result.runId);
        if (goalExecution) protocol.publishNotice("goalExecution.updated", {
          goalId: goalExecution.goal.goalId, flowId: goalExecution.execution.flowId,
          status: goalExecution.execution.status, revision: goalExecution.execution.revision,
          terminalRunId: result.runId,
        });
        const completedDelivery = taskCompletionDeliveries.completeWakeRun(result.runId);
        if (completedDelivery) protocol.publishNotice("task.delivery.updated", {
          deliveryId: completedDelivery.deliveryId, taskId: completedDelivery.taskId,
          flowId: completedDelivery.flowId, status: completedDelivery.deliveryStatus,
          wakeRunId: completedDelivery.wakeRunId, terminal: true,
        });
        dispatchRunDeliveries(result.runId);
        publishDelegationCompletion(delegations.completeChild(result.runId));
      },
      publishNotice: (topic, data) => { protocol.publishNotice(topic, data); },
    });
  }
  if (runCoordinator) {
    const goalRecovery = goalPlanExecutor.recover();
    if (goalRecovery.scanned > 0) protocol.publishNotice("goalExecution.recovered", goalRecovery);
    const deliveryDrain = taskCompletionDeliveries.drain();
    if (deliveryDrain.scanned > 0) protocol.publishNotice("task.delivery.drain", deliveryDrain);
    for (const completion of delegations.reconcileTerminalChildren()) publishDelegationCompletion(completion);
    for (const childRunId of delegations.runnableChildRunIds()) runCoordinator.ensureScheduled(childRunId);
    for (const runId of conversations.runnableRunIds()) {
      const budget = delegations.budget(runId);
      if (budget?.parentRunId || delegations.waitState(runId)) continue;
      runCoordinator.ensureScheduled(runId);
    }
    delegationSweepTimer = setInterval(() => {
      if (delegationSweepActive) return;
      delegationSweepActive = true;
      try {
        const handled = new Set<string>();
        for (const childRunId of delegations.expiredChildRunIds()) {
          if (handled.has(childRunId)) continue;
          const order = delegations.subtreeCancellationOrder(childRunId);
          for (const entry of order) handled.add(entry.childRunId);
          terminateDelegationOrder(order, "TIMED_OUT", "DELEGATION_TIMEOUT");
        }
      } finally {
        delegationSweepActive = false;
      }
    }, 250);
    delegationSweepTimer.unref();
  }
  for (const workspaceId of workspaceIds) {
    const taskResult = taskMaintenance.reconcile({ workspaceId, mode: "APPLY", limit: 1_000, includeRetention: false });
    const flowResult = taskFlowMaintenance.reconcile({ workspaceId, mode: "APPLY", limit: 1_000, includeRetention: false });
    if (taskResult.reconciled > 0 || taskResult.lost > 0 || flowResult.cancellationReplayed > 0 || flowResult.cancelled > 0) {
      protocol.publishNotice("maintenance.reconciled", {
        workspaceId,
        tasks: { reconciled: taskResult.reconciled, lost: taskResult.lost },
        taskFlows: { cancellationReplayed: flowResult.cancellationReplayed, cancelled: flowResult.cancelled },
      });
    }
  }
  if (runCoordinator) {
    const deliveryDrain = taskCompletionDeliveries.drain();
    if (deliveryDrain.scanned > 0) protocol.publishNotice("task.delivery.drain", deliveryDrain);
  }
  const maintenanceEnabled = options.config?.maintenance?.enabled ?? true;
  const maintenanceAutoArm = options.maintenanceAutoArm ?? true;
  const runMaintenanceSweep = (): void => {
    if (!maintenanceEnabled || !maintenanceAutoArm || maintenanceSweepActive) return;
    maintenanceSweepActive = true;
    try {
      for (const result of maintenanceRetention.sweepAll()) {
        if (result.scheduled.tasks > 0 || result.scheduled.taskFlows > 0 || result.scheduled.connectorDeliveries > 0
          || result.pruned > 0 || result.protected > 0 || result.state !== "COMPLETED") {
          protocol.publishNotice("maintenance.retention", {
            workspaceId: result.workspaceId, state: result.state, scanned: result.scanned,
            protected: result.protected, pruned: result.pruned, scheduled: result.scheduled,
          });
        }
      }
    } finally {
      maintenanceSweepActive = false;
    }
  };
  if (maintenanceEnabled && maintenanceAutoArm) {
    runMaintenanceSweep();
    maintenanceSweepTimer = setInterval(runMaintenanceSweep, options.config?.maintenance?.sweepIntervalMs ?? 300_000);
    maintenanceSweepTimer.unref();
  }

  if (options.config?.automation.enabled) {
    let executor = options.automationExecutor;
    if (!executor && runCoordinator) {
      const productionExecutor = new AutomationConversationExecutor({
        conversations, coordinator: runCoordinator, tasks, now, publishNotice: (topic, data) => protocol.publishNotice(topic, data),
      });
      executor = (context) => productionExecutor.execute(context);
    }
    if (executor) {
      automationScheduler = new AutomationScheduler({
        state: stateDatabase, executor, ownerId: instanceId, now,
        onRunUpdated: (run) => protocol.publishNotice("automation.run.updated", run),
        ...(options.automationLeaseDurationMs !== undefined ? { leaseDurationMs: options.automationLeaseDurationMs } : {}),
        ...(options.automationRenewIntervalMs !== undefined ? { renewIntervalMs: options.automationRenewIntervalMs } : {}),
        ...(options.automationAutoArm !== undefined ? { autoArm: options.automationAutoArm } : {}),
      });
    }
  }

  const assistantTextFromMessages = (messages: readonly ConversationMessage[]): string => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== "assistant" || message.content === null || typeof message.content !== "object" || Array.isArray(message.content)) continue;
      const content = message.content as Record<string, unknown>;
      if (content.type === "assistant" && typeof content.text === "string") return content.text;
    }
    return "";
  };

  const failureForRun = (runId: string): LocalConversationFailure | null => {
    const events = conversations.events(runId);
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event?.eventType !== "run.failed" || event.payload === null || typeof event.payload !== "object" || Array.isArray(event.payload)) continue;
      const payload = event.payload as Record<string, unknown>;
      const code = typeof payload.errorCode === "string" ? payload.errorCode : "AGENT_MODEL_FAILED";
      const message = typeof payload.message === "string" ? payload.message : "agent Run failed";
      return { code, message };
    }
    return null;
  };

  executeConversation = async (input: LocalConversationInput): Promise<LocalConversationResult> => {
    if (state !== "READY") throw new HostLifecycleError("HOST_CONVERSATION_FAILED", `Host is not ready: ${state}`);
    if (!runCoordinator) throw new HostLifecycleError("HOST_CONVERSATION_FAILED", "configured model execution is unavailable");
    const timeoutMs = input.timeoutMs ?? 120_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 900_000) {
      throw new HostLifecycleError("HOST_CONVERSATION_FAILED", "conversation timeout must be 1000..900000 milliseconds");
    }
    const text = input.text.trim();
    if (!text || text.length > 65_536) throw new HostLifecycleError("HOST_CONVERSATION_FAILED", "conversation input must be 1..65536 characters");
    if (input.conversationId && (input.modelProfile || input.title)) {
      throw new HostLifecycleError("HOST_CONVERSATION_FAILED", "existing Conversation execution cannot replace modelProfile or title");
    }
    const conversationId = input.conversationId ?? conversations.create({
      workspaceId: input.workspaceId,
      ...(input.modelProfile ? { modelProfile: input.modelProfile } : {}),
      ...(input.title ? { title: input.title } : { title: "OpenRill local conversation" }),
    }).conversationId;
    if (input.conversationId) conversations.get({ workspaceId: input.workspaceId, conversationId });
    const sent = conversations.send({
      workspaceId: input.workspaceId,
      conversationId,
      submissionKey: input.submissionKey ?? `local-conversation:${randomUUID()}`,
      text,
    });
    const terminal = runCoordinator.executeUntilTerminal(sent.run.runId);
    let timer: NodeJS.Timeout | null = null;
    try {
      const result = await Promise.race([
        terminal,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            runCoordinator?.cancel(sent.run.runId);
            reject(new HostLifecycleError("HOST_CONVERSATION_FAILED", `conversation timed out after ${timeoutMs}ms`));
          }, timeoutMs);
          timer.unref();
        }),
      ]);
      const view = conversations.get({ workspaceId: input.workspaceId, conversationId });
      return {
        conversationId,
        runId: sent.run.runId,
        status: result.status as "COMPLETED" | "FAILED" | "CANCELLED",
        terminalReason: result.terminalReason,
        assistantText: assistantTextFromMessages(view.messages),
        usage: result.usage,
        messageCount: view.projection.messageCount,
        lastMessageSequence: view.projection.lastMessageSequence,
        failure: result.status === "FAILED" ? failureForRun(sent.run.runId) : null,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  closeHost = (reason = "requested") => {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      closeRequested = true;
      if (state !== "FAILED" && state !== "STOPPED") {
        state = "STOPPING";
      }
      cancelReadinessDelay();
      if (metadataWritten) await persist().catch(() => undefined);
      await readinessTask?.catch(() => undefined);
      try {
        protocol.publishNotice("host.lifecycle", { state: "STOPPING", reason });
        await extensionRegistry.close();
        protocol.closeAll();
        if (approvalExpiryTimer) clearInterval(approvalExpiryTimer);
        if (maintenanceSweepTimer) clearInterval(maintenanceSweepTimer);
        maintenanceSweepTimer = null;
        await closeHttpServer(server);
        await automationScheduler?.close();
        if (delegationSweepTimer) clearInterval(delegationSweepTimer);
        delegationSweepTimer = null;
        await runCoordinator?.close();
        const drains = await Promise.allSettled([
          browserRuntime?.close() ?? Promise.resolve(),
          processManager?.close() ?? Promise.resolve(),
        ]);
        const failedDrain = drains.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failedDrain) throw failedDrain.reason;
      } finally {
        try {
          stateDatabase.close({ checkpointMode: "TRUNCATE" });
        } finally {
          state = "STOPPED";
          await rm(paths.metadataPath, { force: true }).catch(() => undefined);
          await lock.release().catch(() => undefined);
          resolveClosed();
          void reason;
        }
      }
    })();
    return closePromise;
  };

  try {
    if (options.config?.automation.enabled && !automationScheduler) {
      throw new HostLifecycleError(
        "HOST_STARTUP_FAILED",
        "automation.enabled requires either configured model providers or an injected Automation executor",
      );
    }
    if (connectorRecovery.ingress > 0 || connectorRecovery.delivery.safe > 0 || connectorRecovery.delivery.uncertain > 0) {
      protocol.publishNotice("connector.recovered", connectorRecovery);
    }
    await extensionRegistry.startConfigured();
    const connectorRunRecovery = connectorRuntime.recoverRunOutputs();
    for (const delivery of connectorRunRecovery.deliveries) {
      const registration = connectorAdapters.get(delivery.connectorId);
      if (registration) await registration.port.drainDeliveries({ accountId: delivery.accountId, limit: 100 });
    }
    if (connectorRunRecovery.projected > 0 || connectorRunRecovery.replayed > 0) {
      protocol.publishNotice("connector.run-output.recovered", connectorRunRecovery);
    }
    await automationScheduler?.start();
    actualPort = await listenHttpServer(server, bind, requestedPort);
    state = "LISTENING";
    await persist();
    protocol.publishNotice("host.lifecycle", { state: "LISTENING" });
    readinessTask = (async () => {
      try {
        await waitForReadinessDelay(options.readyDelayMs ?? 0);
        if (state !== "LISTENING") throw new HostLifecycleError("HOST_STARTUP_FAILED", "Host stopped before readiness");
        state = "READY";
        await persist();
        if (state !== "READY") throw new HostLifecycleError("HOST_STARTUP_FAILED", "Host stopped during readiness persistence");
        protocol.publishNotice("host.lifecycle", { state: "READY" });
        resolveReady(getStatus());
      } catch (error) {
        rejectReady(error);
        if (!closeRequested) {
          state = "FAILED";
          queueMicrotask(() => { void closeHost("readiness-failed"); });
        }
      }
    })();
  } catch (error) {
    state = "FAILED";
    await closeHttpServer(server).catch(() => undefined);
    await extensionRegistry.close().catch(() => undefined);
    await automationScheduler?.close().catch(() => undefined);
    await browserRuntime?.close().catch(() => undefined);
    try { stateDatabase.close({ checkpointMode: "TRUNCATE" }); } catch { /* preserve startup failure */ }
    await rm(paths.metadataPath, { force: true }).catch(() => undefined);
    await lock.release().catch(() => undefined);
    resolveClosed();
    throw new HostLifecycleError("HOST_STARTUP_FAILED", `OpenRill Host startup failed for profile ${paths.profile}`, error);
  }

  return { paths, port: actualPort, ready, closed, status: getStatus, close: closeHost, publishNotice: (topic, data) => { protocol.publishNotice(topic, data); }, runConversation: executeConversation };
}
