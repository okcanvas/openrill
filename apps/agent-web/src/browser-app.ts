import type { NoticeFrame, PublicArtifactView, PublicWorkspaceView, PublicDelegationView } from "@openrill/protocol";
import { LocalProtocolClient, type LocalProtocolGap } from "./api/local-protocol-client.js";
import {
  applyControlUiNotice,
  createControlUiProjection,
  moveControlUiCardSelection,
  type ControlUiCard,
  type ControlUiFixture,
  type ControlUiProjection,
} from "./control-ui-projection.js";

type VueRef<T> = { value: T };
interface VueRuntime {
  readonly version?: string;
  readonly createApp: (component: Readonly<Record<string, unknown>>) => { mount: (selector: string) => void };
  readonly ref: <T>(value: T) => VueRef<T>;
  readonly shallowRef: <T>(value: T) => VueRef<T>;
  readonly reactive: <T extends object>(value: T) => T;
  readonly computed: <T>(getter: () => T) => VueRef<T>;
  readonly onMounted: (callback: () => void | Promise<void>) => void;
  readonly onBeforeUnmount: (callback: () => void) => void;
  readonly h: (type: string, props?: Readonly<Record<string, unknown>> | null, children?: unknown) => unknown;
}

declare global {
  interface Window { readonly Vue?: VueRuntime; }
}

interface BootstrapPayload {
  readonly product: "OpenRill";
  readonly version: string;
  readonly profile: string;
  readonly instanceId: string;
  readonly protocol: { readonly path: "/protocol"; readonly token: string };
  readonly workspaces: readonly PublicWorkspaceView[];
}
interface ConversationSummary { readonly conversationId: string; readonly workspaceId: string; readonly title: string | null; readonly status: string; readonly projection?: Readonly<Record<string, unknown>>; }
interface ConversationView extends ConversationSummary { readonly messages: readonly Readonly<Record<string, unknown>>[]; readonly runs: readonly Readonly<Record<string, unknown>>[]; }
interface ApprovalView { readonly requestId: string; readonly runId: string; readonly status: string; readonly version: number; readonly toolName?: string; readonly decision?: string | null; }
interface ArtifactListOutput { readonly items: readonly PublicArtifactView[]; }
interface WorkspaceListOutput { readonly items: readonly PublicWorkspaceView[]; }
interface ConversationListOutput { readonly items: readonly ConversationSummary[]; }
interface ApprovalListOutput { readonly items: readonly ApprovalView[]; }
interface UiSnapshotOutput { readonly cursor: number; }
interface AutomationScheduleViewAt { readonly kind: "at"; readonly at: string; }
interface AutomationScheduleViewInterval { readonly kind: "interval"; readonly everyMs: number; readonly anchorMs: number; }
interface AutomationScheduleViewCron { readonly kind: "cron"; readonly expression: string; }
type AutomationScheduleView = AutomationScheduleViewAt | AutomationScheduleViewInterval | AutomationScheduleViewCron;
interface AutomationJobView {
  readonly jobId: string;
  readonly revision: number;
  readonly config: {
    readonly name: string;
    readonly enabled: boolean;
    readonly schedule: AutomationScheduleView;
    readonly timezone: string;
    readonly conversationTemplate: { readonly workspaceId: string; readonly prompt: string; readonly modelProfile?: string; readonly title?: string };
    readonly catchUpPolicy: { readonly kind: "SKIP" | "RUN_ONCE" } | { readonly kind: "BOUNDED"; readonly limit: number };
    readonly failurePolicy: { readonly backoffMs: number; readonly maxConsecutiveFailures: number; readonly autoDisable: boolean };
  };
  readonly runtime: { readonly nextScheduledFor: number | null; readonly lastScheduledFor: number | null; readonly consecutiveFailures: number };
  readonly createdAt: number;
  readonly updatedAt: number;
}
interface AutomationRunView {
  readonly automationRunId: string;
  readonly jobId: string;
  readonly scheduledFor: number;
  readonly triggerKind: "SCHEDULED" | "MANUAL";
  readonly requestKey: string | null;
  readonly runId: string | null;
  readonly status: string;
  readonly attempt: number;
  readonly errorCode: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}
interface AutomationListOutput { readonly items: readonly AutomationJobView[]; }
interface AutomationHistoryOutput { readonly items: readonly AutomationRunView[]; }
interface AutomationRunNowOutput { readonly created: boolean; readonly run: AutomationRunView; }
interface DelegationListOutput { readonly items: readonly PublicDelegationView[]; }
interface DelegationCancelOutput { readonly delegation: PublicDelegationView; readonly affectedRuns: number; readonly replayed: boolean; }
interface AutomationFormState {
  name: string;
  enabled: boolean;
  scheduleKind: "at" | "interval" | "cron";
  at: string;
  intervalMinutes: string;
  cronExpression: string;
  timezone: string;
  workspaceId: string;
  prompt: string;
  title: string;
  modelProfile: string;
  catchUpKind: "SKIP" | "RUN_ONCE" | "BOUNDED";
  catchUpLimit: string;
  backoffMs: string;
  maxConsecutiveFailures: string;
  autoDisable: boolean;
}

const ROUTES = ["conversations", "delegations", "automations", "workspaces", "skills", "approvals", "artifacts", "settings", "diagnostics"] as const;
type RouteName = typeof ROUTES[number];
const MAX_RENDERED_CARDS = 40;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringValue(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
function routeSegments(): string[] { return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean); }
function routeFromLocation(): RouteName {
  const value = routeSegments()[0]?.toLowerCase();
  return ROUTES.includes(value as RouteName) ? value as RouteName : "conversations";
}
function approvalRequestFromLocation(): string { return routeSegments()[0] === "approvals" ? routeSegments()[1] ?? "" : ""; }
function websocketUrl(pathname: string): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${pathname}`;
}
function makeId(prefix: string): string { return `${prefix}:${crypto.randomUUID()}`; }
function cursorKey(profile: string): string { return `openrill.ui.cursor.${profile}`; }
function readStoredCursor(profile: string): number | undefined {
  const raw = localStorage.getItem(cursorKey(profile));
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
function writeStoredCursor(profile: string, cursor: number): void { localStorage.setItem(cursorKey(profile), String(cursor)); }
function localDateTimeInput(timestamp: number): string {
  const date = new Date(timestamp);
  const local = new Date(timestamp - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function defaultAutomationForm(workspaceId = ""): AutomationFormState {
  return {
    name: "",
    enabled: false,
    scheduleKind: "interval",
    at: localDateTimeInput(Date.now() + 60 * 60 * 1_000),
    intervalMinutes: "60",
    cronExpression: "0 9 * * 1-5",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    workspaceId,
    prompt: "",
    title: "",
    modelProfile: "",
    catchUpKind: "SKIP",
    catchUpLimit: "1",
    backoffMs: "0",
    maxConsecutiveFailures: "3",
    autoDisable: false,
  };
}
function formatTimestamp(value: number | null): string {
  return value === null ? "—" : new Date(value).toLocaleString();
}
function scheduleLabel(schedule: AutomationScheduleView): string {
  if (schedule.kind === "at") return `At ${new Date(schedule.at).toLocaleString()}`;
  if (schedule.kind === "interval") return `Every ${Math.round(schedule.everyMs / 60_000)} min`;
  return `Cron ${schedule.expression}`;
}
function assignAutomationForm(target: AutomationFormState, source: AutomationFormState): void { Object.assign(target, source); }
function automationFormFromJob(job: AutomationJobView): AutomationFormState {
  const schedule = job.config.schedule;
  return {
    name: job.config.name,
    enabled: job.config.enabled,
    scheduleKind: schedule.kind,
    at: schedule.kind === "at" ? localDateTimeInput(Date.parse(schedule.at)) : localDateTimeInput(Date.now() + 60 * 60 * 1_000),
    intervalMinutes: schedule.kind === "interval" ? String(schedule.everyMs / 60_000) : "60",
    cronExpression: schedule.kind === "cron" ? schedule.expression : "0 9 * * 1-5",
    timezone: job.config.timezone,
    workspaceId: job.config.conversationTemplate.workspaceId,
    prompt: job.config.conversationTemplate.prompt,
    title: job.config.conversationTemplate.title ?? "",
    modelProfile: job.config.conversationTemplate.modelProfile ?? "",
    catchUpKind: job.config.catchUpPolicy.kind,
    catchUpLimit: job.config.catchUpPolicy.kind === "BOUNDED" ? String(job.config.catchUpPolicy.limit) : "1",
    backoffMs: String(job.config.failurePolicy.backoffMs),
    maxConsecutiveFailures: String(job.config.failurePolicy.maxConsecutiveFailures),
    autoDisable: job.config.failurePolicy.autoDisable,
  };
}

function cardsFromConversation(view: ConversationView, artifacts: readonly PublicArtifactView[]): ControlUiCard[] {
  const cards: ControlUiCard[] = [];
  for (const message of view.messages) {
    const content = asRecord(message.content);
    const role = stringValue(message.role, "unknown");
    if (content.type === "text") {
      cards.push({ kind: "text", id: stringValue(message.messageId), title: role, text: stringValue(content.text), status: "PERSISTED" });
    } else if (content.type === "assistant") {
      const text = stringValue(content.text);
      if (text) cards.push({ kind: "text", id: stringValue(message.messageId), title: "assistant", text, status: "PERSISTED" });
      const calls = Array.isArray(content.toolCalls) ? content.toolCalls : [];
      for (const raw of calls) {
        const call = asRecord(raw);
        cards.push({ kind: "tool", id: stringValue(call.toolCallId), title: stringValue(call.name, "Tool"), status: "REQUESTED", raw: call });
      }
    } else if (content.type === "tool_result") {
      cards.push({ kind: "tool", id: stringValue(content.toolCallId), title: stringValue(content.name, "Tool"), status: content.isError === true ? "FAILED" : "COMPLETED", raw: content.output });
    } else {
      cards.push({ kind: "unknown", id: stringValue(message.messageId), title: `message:${role}`, status: "UNRECOGNIZED", raw: content });
    }
  }
  for (const artifact of artifacts) {
    cards.push({ kind: "artifact", id: artifact.artifactId, runId: artifact.runId, title: artifact.relativePath ?? artifact.operation, status: artifact.kind, raw: artifact });
  }
  return cards;
}

function fixtureFrom(view: ConversationView | null, artifacts: readonly PublicArtifactView[], cursor: number): ControlUiFixture {
  const lastRun = view?.runs.at(-1) ?? {};
  return {
    fixtureId: view?.conversationId ?? "openrill-control-ui-empty",
    initialCursor: cursor,
    snapshot: {
      conversation: view ? asRecord(view) : {},
      run: asRecord(lastRun),
      cards: view ? cardsFromConversation(view, artifacts) : [],
    },
  };
}

const vue = window.Vue;
if (!vue) throw new Error("OpenRill Control UI requires the packaged Vue runtime");
const { createApp, ref, shallowRef, reactive, computed, onMounted, onBeforeUnmount, h } = vue;

createApp({
  setup() {
    const route = ref<RouteName>(routeFromLocation());
    const routeHash = ref(location.hash);
    const connection = ref("BOOTSTRAPPING");
    const startupPhase = ref("BOOTSTRAPPING");
    const bootstrap = shallowRef<BootstrapPayload | null>(null);
    const workspaces = shallowRef<readonly PublicWorkspaceView[]>([]);
    const selectedWorkspaceId = ref("");
    const conversations = shallowRef<readonly ConversationSummary[]>([]);
    const selectedConversationId = ref("");
    const conversation = shallowRef<ConversationView | null>(null);
    const approvals = shallowRef<readonly ApprovalView[]>([]);
    const artifacts = shallowRef<readonly PublicArtifactView[]>([]);
    const automations = shallowRef<readonly AutomationJobView[]>([]);
    const delegations = shallowRef<readonly PublicDelegationView[]>([]);
    const selectedDelegationId = ref("");
    const selectedDelegation = shallowRef<PublicDelegationView | null>(null);
    const delegationActionState = ref("IDLE");
    const selectedAutomationId = ref("");
    const automationRuns = shallowRef<readonly AutomationRunView[]>([]);
    const automationForm = reactive<AutomationFormState>(defaultAutomationForm());
    const automationMode = ref<"CREATE" | "EDIT">("CREATE");
    const automationActionState = ref("IDLE");
    const lastManualRequestKey = ref("");
    const projection = reactive<ControlUiProjection>(createControlUiProjection(fixtureFrom(null, [], 0)));
    const composer = ref("");
    const submitState = ref<"IDLE" | "SENDING" | "SENT" | "NOT_SENT">("IDLE");
    const error = ref("");
    const artifactPreview = ref("");
    const artifactPreviewTitle = ref("");
    const diagnostics = shallowRef<Readonly<Record<string, unknown>>>({});
    let client: LocalProtocolClient | null = null;
    let resyncing = false;
    let unlistenNotice: (() => void) | null = null;
    let unlistenGap: (() => void) | null = null;
    let unlistenState: (() => void) | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let suppressReconnect = false;
    let unmounting = false;
    const onHashChange = () => { routeHash.value = location.hash; route.value = routeFromLocation(); };

    const visibleCards = computed(() => projection.cards.slice(Math.max(0, projection.cards.length - MAX_RENDERED_CARDS)));
    const pendingApprovals = computed(() => approvals.value.filter((item) => item.status === "PENDING"));
    const selectedWorkspace = computed(() => workspaces.value.find((item) => item.workspaceId === selectedWorkspaceId.value) ?? null);
    const selectedAutomation = computed(() => automations.value.find((item) => item.jobId === selectedAutomationId.value) ?? null);
    const approvalDeepLink = computed(() => { routeHash.value; return approvalRequestFromLocation(); });
    const activeDelegationStatuses = new Set(["CREATED", "RUNNING", "WAITING"]);
    const orderedDelegations = computed(() => {
      const childRunIds = new Set(delegations.value.map((item) => item.childRunId));
      const byParent = new Map<string, PublicDelegationView[]>();
      for (const item of delegations.value) {
        const list = byParent.get(item.parentRunId) ?? []; list.push(item); byParent.set(item.parentRunId, list);
      }
      for (const list of byParent.values()) list.sort((left, right) => left.createdAt - right.createdAt || left.delegationId.localeCompare(right.delegationId));
      const roots = delegations.value.filter((item) => !childRunIds.has(item.parentRunId)).sort((left, right) => left.createdAt - right.createdAt || left.delegationId.localeCompare(right.delegationId));
      const ordered: PublicDelegationView[] = []; const seen = new Set<string>();
      const append = (item: PublicDelegationView) => {
        if (seen.has(item.delegationId)) return; seen.add(item.delegationId); ordered.push(item);
        for (const child of byParent.get(item.childRunId) ?? []) append(child);
      };
      for (const root of roots) append(root);
      for (const item of delegations.value) append(item);
      return ordered;
    });

    function navigate(next: RouteName): void { location.hash = `#/${next}`; route.value = next; }
    function idempotency(operation: string): string { return makeId(`ui:${operation}`); }
    async function call<T>(operation: string, input: unknown, key = idempotency(operation)): Promise<T> {
      if (!client) throw new Error("protocol client is unavailable");
      return await client.call(operation, input, key) as T;
    }

    async function loadWorkspaces(): Promise<void> {
      const output = await call<WorkspaceListOutput>("workspace.list", {});
      workspaces.value = output.items;
      if (!selectedWorkspaceId.value || !output.items.some((item) => item.workspaceId === selectedWorkspaceId.value)) {
        selectedWorkspaceId.value = output.items[0]?.workspaceId ?? "";
      }
    }
    async function loadConversations(): Promise<void> {
      if (!selectedWorkspaceId.value) { conversations.value = []; selectedConversationId.value = ""; return; }
      const output = await call<ConversationListOutput>("conversation.list", { workspaceId: selectedWorkspaceId.value, limit: 100 });
      conversations.value = output.items;
      if (!selectedConversationId.value || !output.items.some((item) => item.conversationId === selectedConversationId.value)) {
        selectedConversationId.value = output.items[0]?.conversationId ?? "";
      }
    }
    async function loadApprovals(): Promise<void> {
      const output = await call<ApprovalListOutput>("approval.list", {});
      approvals.value = output.items;
    }
    async function loadArtifacts(): Promise<void> {
      const output = await call<ArtifactListOutput>("artifact.list", { limit: 100 });
      artifacts.value = output.items;
    }

    async function loadDelegations(): Promise<void> {
      const output = await call<DelegationListOutput>("delegation.list", { limit: 200 });
      delegations.value = output.items;
      if (selectedDelegationId.value && !output.items.some((item) => item.delegationId === selectedDelegationId.value)) {
        selectedDelegationId.value = ""; selectedDelegation.value = null;
      }
      if (selectedDelegationId.value) selectedDelegation.value = await call<PublicDelegationView>("delegation.get", { delegationId: selectedDelegationId.value });
    }
    async function selectDelegation(delegationId: string): Promise<void> {
      selectedDelegationId.value = delegationId;
      selectedDelegation.value = await call<PublicDelegationView>("delegation.get", { delegationId });
      delegationActionState.value = "IDLE";
    }
    async function cancelDelegation(): Promise<void> {
      const current = selectedDelegation.value;
      if (!current) return;
      delegationActionState.value = "CANCELLING";
      try {
        const output = await call<DelegationCancelOutput>("delegation.cancel", { delegationId: current.delegationId });
        delegationActionState.value = output.replayed ? "ALREADY_TERMINAL" : `CANCELLED_${output.affectedRuns}`;
        await loadDelegations();
      } catch (cause) {
        delegationActionState.value = "FAILED";
        throw cause;
      }
    }

    async function loadAutomationHistory(): Promise<void> {
      if (!selectedAutomationId.value) { automationRuns.value = []; return; }
      const output = await call<AutomationHistoryOutput>("automation.history", { jobId: selectedAutomationId.value, limit: 100 });
      automationRuns.value = output.items;
    }
    async function loadAutomations(): Promise<void> {
      const output = await call<AutomationListOutput>("automation.list", { includeDisabled: true, limit: 200 });
      automations.value = output.items;
      if (selectedAutomationId.value && !output.items.some((item) => item.jobId === selectedAutomationId.value)) selectedAutomationId.value = "";
      if (automationMode.value === "CREATE" && !automationForm.workspaceId && workspaces.value[0]) automationForm.workspaceId = workspaces.value[0].workspaceId;
      await loadAutomationHistory();
    }
    async function loadConversation(): Promise<void> {
      if (!selectedWorkspaceId.value || !selectedConversationId.value) {
        conversation.value = null;
        Object.assign(projection, createControlUiProjection(fixtureFrom(null, [], client?.currentCursor ?? 0)));
        return;
      }
      conversation.value = await call<ConversationView>("conversation.get", {
        workspaceId: selectedWorkspaceId.value,
        conversationId: selectedConversationId.value,
      });
      const runIds = new Set((conversation.value.runs ?? []).map((run) => stringValue(run.runId)));
      const matchingArtifacts = artifacts.value.filter((item) => runIds.has(item.runId));
      Object.assign(projection, createControlUiProjection(fixtureFrom(conversation.value, matchingArtifacts, client?.currentCursor ?? 0)));
    }
    async function reloadServerProjection(): Promise<void> {
      await Promise.all([loadWorkspaces(), loadApprovals(), loadArtifacts(), loadAutomations(), loadDelegations()]);
      await loadConversations();
      await loadConversation();
      diagnostics.value = await call<Readonly<Record<string, unknown>>>("host.status", {});
    }
    async function loadInitialServerProjection(): Promise<void> {
      startupPhase.value = "LOAD_WORKSPACES";
      await loadWorkspaces();
      startupPhase.value = "LOAD_APPROVALS";
      await loadApprovals();
      startupPhase.value = "LOAD_ARTIFACTS";
      await loadArtifacts();
      startupPhase.value = "LOAD_AUTOMATIONS";
      await loadAutomations();
      startupPhase.value = "LOAD_DELEGATIONS";
      await loadDelegations();
      startupPhase.value = "LOAD_CONVERSATIONS";
      await loadConversations();
      startupPhase.value = "LOAD_CONVERSATION";
      await loadConversation();
      startupPhase.value = "LOAD_HOST_STATUS";
      diagnostics.value = await call<Readonly<Record<string, unknown>>>("host.status", {});
    }

    function detachClient(): void {
      unlistenNotice?.(); unlistenNotice = null;
      unlistenGap?.(); unlistenGap = null;
      unlistenState?.(); unlistenState = null;
      suppressReconnect = true;
      client?.close(); client = null;
      suppressReconnect = false;
    }
    function scheduleReconnect(): void {
      if (unmounting || suppressReconnect || resyncing || !bootstrap.value || reconnectTimer !== null) return;
      const delay = Math.min(5_000, 250 * 2 ** Math.min(reconnectAttempt, 4));
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        reconnectAttempt += 1;
        detachClient();
        void connectProtocol(readStoredCursor(bootstrap.value!.profile))
          .then(async () => { reconnectAttempt = 0; await reloadServerProjection(); })
          .catch((cause) => {
            error.value = cause instanceof Error ? cause.message : "reconnect failed";
            scheduleReconnect();
          });
      }, delay);
    }
    async function resynchronize(gap?: LocalProtocolGap): Promise<void> {
      if (resyncing || !client || !bootstrap.value) return;
      resyncing = true;
      connection.value = "RESYNCING";
      try {
        const snapshot = await call<UiSnapshotOutput>("ui.snapshot", {});
        await reloadServerProjection();
        const cursor = snapshot.cursor;
        writeStoredCursor(bootstrap.value.profile, cursor);
        detachClient();
        await connectProtocol(cursor);
        projection.cursor = cursor;
        projection.resyncRequired = false;
        error.value = gap ? `Recovered notice gap ${gap.expected}→${gap.received}` : "";
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : "snapshot resync failed";
        connection.value = "DISCONNECTED";
      } finally { resyncing = false; }
    }
    async function handleNotice(notice: NoticeFrame): Promise<void> {
      const payload = asRecord(notice.data);
      const result = applyControlUiNotice(projection, { sequence: notice.sequence, notice: notice.topic, payload });
      if (result.outcome === "GAP") { await resynchronize({ expected: result.expected, received: result.received, cursor: projection.cursor }); return; }
      if (bootstrap.value) writeStoredCursor(bootstrap.value.profile, projection.cursor);
      if (notice.topic === "approval.updated") await loadApprovals();
      if (notice.topic === "automation.job.updated") {
        await loadAutomations();
        const jobId = stringValue(payload.jobId);
        if (jobId && selectedAutomationId.value === jobId) {
          const refreshed = automations.value.find((item) => item.jobId === jobId);
          if (refreshed && automationMode.value === "EDIT") assignAutomationForm(automationForm, automationFormFromJob(refreshed));
        }
      }
      if (notice.topic === "automation.run.updated") await loadAutomationHistory();
      if (notice.topic === "delegation.updated") await loadDelegations();
      if (notice.topic === "artifact.created") { await loadArtifacts(); await loadConversation(); }
      if (notice.topic === "conversation.updated" || notice.topic === "run.updated") {
        await loadConversations();
        if (!selectedConversationId.value || selectedConversationId.value === stringValue(payload.conversationId, selectedConversationId.value)) await loadConversation();
      }
    }
    async function connectProtocol(cursor?: number): Promise<void> {
      if (!bootstrap.value) throw new Error("bootstrap is unavailable");
      connection.value = "CONNECTING";
      client = new LocalProtocolClient({
        url: websocketUrl(bootstrap.value.protocol.path),
        token: bootstrap.value.protocol.token,
        clientId: "openrill-control-ui",
        clientVersion: bootstrap.value.version,
        platform: navigator.platform || "web",
        ...(cursor !== undefined ? { cursor } : {}),
      });
      unlistenNotice = client.onNotice((notice) => { void handleNotice(notice).catch((cause) => { error.value = cause instanceof Error ? cause.message : "notice failed"; }); });
      unlistenGap = client.onGap((gap) => { void resynchronize(gap); });
      unlistenState = client.onConnectionState((state) => {
        connection.value = state;
        if (state === "DISCONNECTED") scheduleReconnect();
      });
      const accepted = await client.connect();
      projection.cursor = accepted.cursor;
      if (accepted.resyncRequired) await resynchronize();
      else { connection.value = "CONNECTED"; reconnectAttempt = 0; }
    }

    async function bootstrapApp(): Promise<void> {
      startupPhase.value = "FETCH_BOOTSTRAP";
      const response = await fetch("/ui/bootstrap", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(`bootstrap failed (${response.status})`);
      startupPhase.value = "PARSE_BOOTSTRAP";
      bootstrap.value = await response.json() as BootstrapPayload;
      workspaces.value = bootstrap.value.workspaces;
      selectedWorkspaceId.value = bootstrap.value.workspaces[0]?.workspaceId ?? "";
      startupPhase.value = "CONNECT_PROTOCOL";
      await connectProtocol(readStoredCursor(bootstrap.value.profile));
      await loadInitialServerProjection();
      startupPhase.value = "READY";
    }
    async function createConversation(): Promise<void> {
      if (!selectedWorkspaceId.value) return;
      const created = await call<ConversationSummary>("conversation.create", { workspaceId: selectedWorkspaceId.value, title: "New conversation" });
      await loadConversations();
      selectedConversationId.value = created.conversationId;
      await loadConversation();
    }
    async function selectWorkspace(workspaceId: string): Promise<void> {
      selectedWorkspaceId.value = workspaceId;
      selectedConversationId.value = "";
      await loadConversations();
      await loadConversation();
    }
    async function selectConversation(conversationId: string): Promise<void> {
      selectedConversationId.value = conversationId;
      await loadConversation();
    }
    function newAutomation(): void {
      selectedAutomationId.value = "";
      automationRuns.value = [];
      automationMode.value = "CREATE";
      automationActionState.value = "IDLE";
      lastManualRequestKey.value = "";
      assignAutomationForm(automationForm, defaultAutomationForm(selectedWorkspaceId.value || workspaces.value[0]?.workspaceId || ""));
    }
    async function selectAutomation(jobId: string): Promise<void> {
      selectedAutomationId.value = jobId;
      const job = await call<AutomationJobView>("automation.get", { jobId });
      automationMode.value = "EDIT";
      automationActionState.value = "IDLE";
      lastManualRequestKey.value = "";
      assignAutomationForm(automationForm, automationFormFromJob(job));
      await loadAutomationHistory();
    }
    function automationInput(): Readonly<Record<string, unknown>> {
      const intervalMinutes = Number(automationForm.intervalMinutes);
      const intervalEveryMs = Math.round(intervalMinutes * 60_000);
      const currentSchedule = selectedAutomation.value?.config.schedule;
      const intervalAnchorMs = currentSchedule?.kind === "interval" && currentSchedule.everyMs === intervalEveryMs
        ? currentSchedule.anchorMs
        : Date.now();
      const atTimestamp = new Date(automationForm.at).getTime();
      const schedule: AutomationScheduleView = automationForm.scheduleKind === "at"
        ? { kind: "at", at: new Date(atTimestamp).toISOString() }
        : automationForm.scheduleKind === "interval"
          ? { kind: "interval", everyMs: intervalEveryMs, anchorMs: intervalAnchorMs }
          : { kind: "cron", expression: automationForm.cronExpression.trim() };
      const catchUpPolicy = automationForm.catchUpKind === "BOUNDED"
        ? { kind: "BOUNDED", limit: Number(automationForm.catchUpLimit) }
        : { kind: automationForm.catchUpKind };
      return {
        name: automationForm.name.trim(),
        enabled: automationForm.enabled,
        schedule,
        timezone: automationForm.timezone.trim(),
        conversationTemplate: {
          workspaceId: automationForm.workspaceId,
          prompt: automationForm.prompt.trim(),
          ...(automationForm.modelProfile.trim() ? { modelProfile: automationForm.modelProfile.trim() } : {}),
          ...(automationForm.title.trim() ? { title: automationForm.title.trim() } : {}),
        },
        catchUpPolicy,
        failurePolicy: {
          backoffMs: Number(automationForm.backoffMs),
          maxConsecutiveFailures: Number(automationForm.maxConsecutiveFailures),
          autoDisable: automationForm.autoDisable,
        },
      };
    }
    async function saveAutomation(): Promise<void> {
      automationActionState.value = "SAVING";
      try {
        if (automationMode.value === "CREATE") {
          const created = await call<AutomationJobView>("automation.create", automationInput());
          await loadAutomations();
          await selectAutomation(created.jobId);
          automationActionState.value = "CREATED";
        } else {
          const job = selectedAutomation.value;
          if (!job) return;
          const updated = await call<AutomationJobView>("automation.update", { jobId: job.jobId, expectedRevision: job.revision, patch: automationInput() });
          await loadAutomations();
          await selectAutomation(updated.jobId);
          automationActionState.value = "UPDATED";
        }
      } catch (cause) {
        automationActionState.value = "FAILED";
        await loadAutomations();
        throw cause;
      }
    }
    async function setAutomationEnabled(enabled: boolean): Promise<void> {
      const job = selectedAutomation.value;
      if (!job) return;
      const updated = await call<AutomationJobView>("automation.update", { jobId: job.jobId, expectedRevision: job.revision, patch: { enabled } });
      await loadAutomations();
      await selectAutomation(updated.jobId);
      automationActionState.value = enabled ? "ENABLED" : "DISABLED";
    }
    async function runAutomation(replay: boolean): Promise<void> {
      const job = selectedAutomation.value;
      if (!job) return;
      const requestKey = replay && lastManualRequestKey.value ? lastManualRequestKey.value : makeId("automation-manual");
      lastManualRequestKey.value = requestKey;
      automationActionState.value = replay ? "REPLAYING" : "RUNNING";
      const output = await call<AutomationRunNowOutput>("automation.run_now", { jobId: job.jobId, requestKey });
      automationActionState.value = output.created ? "RUN_CREATED" : "RUN_REPLAYED";
      await loadAutomationHistory();
    }
    async function sendMessage(): Promise<void> {
      const text = composer.value.trim();
      if (!text || !selectedConversationId.value || !selectedWorkspaceId.value) return;
      const submissionKey = makeId("submission");
      submitState.value = "SENDING";
      projection.cards.push({ kind: "text", id: submissionKey, title: "user", text, status: "SENDING" });
      composer.value = "";
      try {
        await call("conversation.send", { workspaceId: selectedWorkspaceId.value, conversationId: selectedConversationId.value, submissionKey, text }, submissionKey);
        submitState.value = "SENT";
        await loadConversation();
      } catch (cause) {
        submitState.value = "NOT_SENT";
        const card = projection.cards.find((item) => item.id === submissionKey);
        if (card) projection.cards[projection.cards.indexOf(card)] = { ...card, status: "NOT_SENT" };
        error.value = cause instanceof Error ? cause.message : "send failed";
      }
    }
    async function resolveApproval(item: ApprovalView, decision: "allow_once" | "allow_for_conversation" | "deny"): Promise<void> {
      await call("approval.resolve", { requestId: item.requestId, expectedVersion: item.version, decision });
      await loadApprovals();
      await loadConversation();
    }
    async function openArtifact(artifact: PublicArtifactView | undefined, fileName?: string): Promise<void> {
      if (!artifact) return;
      const file = fileName ?? artifact.files[0]?.name;
      if (!bootstrap.value || !file) return;
      const response = await fetch(`/ui/artifacts/${encodeURIComponent(artifact.artifactId)}/content?file=${encodeURIComponent(file)}`, {
        headers: { authorization: `Bearer ${bootstrap.value.protocol.token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`artifact open failed (${response.status})`);
      artifactPreviewTitle.value = `${artifact.relativePath ?? artifact.operation} · ${file}`;
      artifactPreview.value = await response.text();
    }
    function closeArtifact(): void { artifactPreview.value = ""; artifactPreviewTitle.value = ""; }
    function moveSelection(direction: "next" | "previous"): void { moveControlUiCardSelection(projection, direction); }
    function onGlobalKey(event: KeyboardEvent): void {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowDown") { event.preventDefault(); moveSelection("next"); }
      if (event.key === "ArrowUp") { event.preventDefault(); moveSelection("previous"); }
      if (event.key === "Escape") closeArtifact();
    }

    onMounted(async () => {
      addEventListener("hashchange", onHashChange);
      addEventListener("keydown", onGlobalKey);
      try { await bootstrapApp(); }
      catch (cause) {
        const failedPhase = startupPhase.value;
        startupPhase.value = "FAILED";
        if (connection.value !== "CONNECTED") connection.value = "FAILED";
        const detail = cause instanceof Error ? cause.message : "startup failed";
        error.value = `${failedPhase}: ${detail}`;
      }
    });
    onBeforeUnmount(() => {
      unmounting = true;
      removeEventListener("hashchange", onHashChange);
      removeEventListener("keydown", onGlobalKey);
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      detachClient();
    });

    function runAction(action: () => Promise<void>): void {
      void action().catch((cause) => {
        error.value = cause instanceof Error ? cause.message : "Control UI action failed";
      });
    }

    function renderCard(card: ControlUiCard, index: number): unknown {
      const absoluteIndex = projection.cards.length - visibleCards.value.length + index;
      let content: unknown;
      if (card.kind === "text") content = h("p", null, card.text ?? "");
      else if (card.kind === "tool") content = h("pre", null, JSON.stringify(card.raw, null, 2));
      else if (card.kind === "approval") {
        content = h("div", { class: "approval-actions" }, (card.actions ?? []).map((action) => h("button", { key: action, type: "button" }, action)));
      } else if (card.kind === "artifact") {
        content = h("button", {
          type: "button",
          "data-testid": "open-artifact-card",
          onClick: () => runAction(() => openArtifact(artifacts.value.find((item) => item.artifactId === card.id))),
        }, "Open artifact");
      } else content = h("pre", null, JSON.stringify(card.raw, null, 2));
      return h("li", {
        key: card.id ?? index,
        class: ["card", `card-${card.kind}`, { selected: projection.selectedCardIndex === absoluteIndex }],
        "data-testid": `card-${card.kind}`,
        "data-card-status": card.status ?? "",
        tabindex: 0,
      }, [
        h("header", null, [h("strong", null, card.title ?? card.kind), h("span", null, card.status ?? "")]),
        content,
      ]);
    }

    function renderConversations(): unknown {
      return h("section", { class: "conversation-layout", "aria-labelledby": "conversations-title" }, [
        h("aside", { class: "sidebar" }, [
          h("h1", { id: "conversations-title" }, "Conversations"),
          h("label", null, [
            "Workspace",
            h("select", {
              "data-testid": "workspace-select",
              value: selectedWorkspaceId.value,
              onChange: (event: Event) => {
                const target = event.target;
                if (target instanceof HTMLSelectElement) runAction(() => selectWorkspace(target.value));
              },
            }, workspaces.value.map((workspace) => h("option", { key: workspace.workspaceId, value: workspace.workspaceId }, workspace.displayName))),
          ]),
          h("button", {
            type: "button",
            "data-testid": "new-conversation",
            disabled: !selectedWorkspaceId.value,
            onClick: () => runAction(createConversation),
          }, "New conversation"),
          ...conversations.value.map((item) => h("button", {
            key: item.conversationId,
            type: "button",
            class: ["conversation-link", { active: item.conversationId === selectedConversationId.value }],
            "data-testid": `conversation-${item.conversationId}`,
            onClick: () => runAction(() => selectConversation(item.conversationId)),
          }, item.title ?? item.conversationId.slice(0, 8))),
        ]),
        h("section", { class: "transcript", "aria-label": "Conversation transcript" }, [
          h("div", { class: "transcript-meta" }, [
            h("span", null, `${projection.cards.length} cards`),
            h("span", null, `rendering ≤ ${MAX_RENDERED_CARDS}`),
            h("span", null, `cursor ${projection.cursor}`),
          ]),
          h("ol", { class: "cards", "data-testid": "transcript", role: "log", "aria-live": "polite" }, visibleCards.value.map(renderCard)),
          h("form", {
            class: "composer",
            onSubmit: (event: Event) => { event.preventDefault(); runAction(sendMessage); },
          }, [
            h("label", { class: "sr-only", for: "composer" }, "Message"),
            h("textarea", {
              id: "composer",
              "data-testid": "composer",
              value: composer.value,
              rows: 3,
              placeholder: "Ask OpenRill…",
              disabled: !selectedConversationId.value || connection.value !== "CONNECTED",
              onInput: (event: Event) => {
                const target = event.target;
                if (target instanceof HTMLTextAreaElement) composer.value = target.value;
              },
            }),
            h("button", {
              type: "submit",
              "data-testid": "send-message",
              disabled: !composer.value.trim() || submitState.value === "SENDING",
            }, "Send"),
            h("span", { role: "status", "data-testid": "submit-state" }, submitState.value),
          ]),
        ]),
      ]);
    }

    function formInput(label: string, testId: string, value: string, onValue: (value: string) => void, type = "text"): unknown {
      return h("label", { class: "field" }, [
        h("span", null, label),
        h("input", {
          type,
          value,
          "data-testid": testId,
          onInput: (event: Event) => { const target = event.target; if (target instanceof HTMLInputElement) onValue(target.value); },
        }),
      ]);
    }
    function renderAutomations(): unknown {
      const job = selectedAutomation.value;
      return h("section", { class: "automation-layout", "aria-labelledby": "automations-title" }, [
        h("aside", { class: "sidebar automation-list" }, [
          h("h1", { id: "automations-title" }, "Automations"),
          h("button", { type: "button", "data-testid": "automation-new", onClick: newAutomation }, "New automation"),
          ...automations.value.map((item) => h("button", {
            key: item.jobId,
            type: "button",
            class: ["conversation-link", { active: item.jobId === selectedAutomationId.value }],
            "data-testid": `automation-${item.jobId}`,
            onClick: () => runAction(() => selectAutomation(item.jobId)),
          }, `${item.config.enabled ? "●" : "○"} ${item.config.name}`)),
          automations.value.length === 0 ? h("p", null, "No automations.") : null,
        ]),
        h("section", { class: "automation-editor panel" }, [
          h("header", { class: "section-header" }, [
            h("div", null, [
              h("h2", null, automationMode.value === "CREATE" ? "Create automation" : automationForm.name || "Automation"),
              job ? h("p", { class: "muted" }, `Revision ${job.revision} · ${job.jobId}`) : h("p", { class: "muted" }, "Create a durable scheduled Conversation Run."),
            ]),
            h("span", { role: "status", "data-testid": "automation-action-state" }, automationActionState.value),
          ]),
          h("form", { class: "automation-form", onSubmit: (event: Event) => { event.preventDefault(); runAction(saveAutomation); } }, [
            formInput("Name", "automation-name", automationForm.name, (value) => { automationForm.name = value; }),
            h("label", { class: "field" }, [h("span", null, "Workspace"), h("select", {
              value: automationForm.workspaceId,
              "data-testid": "automation-workspace",
              onChange: (event: Event) => { const target = event.target; if (target instanceof HTMLSelectElement) automationForm.workspaceId = target.value; },
            }, workspaces.value.map((workspace) => h("option", { key: workspace.workspaceId, value: workspace.workspaceId }, workspace.displayName)))]),
            h("label", { class: "field field-wide" }, [h("span", null, "Prompt"), h("textarea", {
              rows: 5,
              value: automationForm.prompt,
              "data-testid": "automation-prompt",
              onInput: (event: Event) => { const target = event.target; if (target instanceof HTMLTextAreaElement) automationForm.prompt = target.value; },
            })]),
            formInput("Conversation title", "automation-title", automationForm.title, (value) => { automationForm.title = value; }),
            formInput("Model profile", "automation-model-profile", automationForm.modelProfile, (value) => { automationForm.modelProfile = value; }),
            h("label", { class: "field" }, [h("span", null, "Schedule"), h("select", {
              value: automationForm.scheduleKind,
              "data-testid": "automation-schedule-kind",
              onChange: (event: Event) => { const target = event.target; if (target instanceof HTMLSelectElement) automationForm.scheduleKind = target.value as AutomationFormState["scheduleKind"]; },
            }, [h("option", { value: "at" }, "One time"), h("option", { value: "interval" }, "Interval"), h("option", { value: "cron" }, "Cron")])]),
            automationForm.scheduleKind === "at" ? formInput("Run at", "automation-at", automationForm.at, (value) => { automationForm.at = value; }, "datetime-local") : null,
            automationForm.scheduleKind === "interval" ? formInput("Interval minutes", "automation-interval-minutes", automationForm.intervalMinutes, (value) => { automationForm.intervalMinutes = value; }, "number") : null,
            automationForm.scheduleKind === "cron" ? formInput("Cron expression", "automation-cron", automationForm.cronExpression, (value) => { automationForm.cronExpression = value; }) : null,
            formInput("Timezone", "automation-timezone", automationForm.timezone, (value) => { automationForm.timezone = value; }),
            h("label", { class: "field" }, [h("span", null, "Catch-up"), h("select", {
              value: automationForm.catchUpKind,
              "data-testid": "automation-catch-up",
              onChange: (event: Event) => { const target = event.target; if (target instanceof HTMLSelectElement) automationForm.catchUpKind = target.value as AutomationFormState["catchUpKind"]; },
            }, [h("option", { value: "SKIP" }, "Skip"), h("option", { value: "RUN_ONCE" }, "Run once"), h("option", { value: "BOUNDED" }, "Bounded")])]),
            automationForm.catchUpKind === "BOUNDED" ? formInput("Catch-up limit", "automation-catch-up-limit", automationForm.catchUpLimit, (value) => { automationForm.catchUpLimit = value; }, "number") : null,
            formInput("Failure backoff ms", "automation-backoff-ms", automationForm.backoffMs, (value) => { automationForm.backoffMs = value; }, "number"),
            formInput("Max failures", "automation-max-failures", automationForm.maxConsecutiveFailures, (value) => { automationForm.maxConsecutiveFailures = value; }, "number"),
            h("label", { class: "check-field" }, [h("input", { type: "checkbox", checked: automationForm.enabled, "data-testid": "automation-enabled", onChange: (event: Event) => { const target = event.target; if (target instanceof HTMLInputElement) automationForm.enabled = target.checked; } }), "Enabled"]),
            h("label", { class: "check-field" }, [h("input", { type: "checkbox", checked: automationForm.autoDisable, "data-testid": "automation-auto-disable", onChange: (event: Event) => { const target = event.target; if (target instanceof HTMLInputElement) automationForm.autoDisable = target.checked; } }), "Auto-disable after failures"]),
            h("div", { class: "form-actions field-wide" }, [
              h("button", { type: "submit", "data-testid": "automation-save" }, automationMode.value === "CREATE" ? "Create" : "Save changes"),
              job ? h("button", { type: "button", "data-testid": "automation-toggle", onClick: () => runAction(() => setAutomationEnabled(!job.config.enabled)) }, job.config.enabled ? "Disable" : "Enable") : null,
              job ? h("button", { type: "button", "data-testid": "automation-run-now", onClick: () => runAction(() => runAutomation(false)) }, "Run now") : null,
              job && lastManualRequestKey.value ? h("button", { type: "button", "data-testid": "automation-replay-run", onClick: () => runAction(() => runAutomation(true)) }, "Replay last request") : null,
            ]),
          ]),
          job ? h("section", { class: "automation-summary", "data-testid": "automation-summary" }, [
            h("h3", null, "Current state"),
            h("dl", { class: "summary-grid" }, [
              h("dt", null, "Status"), h("dd", null, job.config.enabled ? "ENABLED" : "DISABLED"),
              h("dt", null, "Schedule"), h("dd", null, scheduleLabel(job.config.schedule)),
              h("dt", null, "Next"), h("dd", null, formatTimestamp(job.runtime.nextScheduledFor)),
              h("dt", null, "Last"), h("dd", null, formatTimestamp(job.runtime.lastScheduledFor)),
              h("dt", null, "Failures"), h("dd", null, String(job.runtime.consecutiveFailures)),
            ]),
          ]) : null,
          job ? h("section", { class: "automation-history", "data-testid": "automation-history" }, [
            h("h3", null, "Run history"),
            ...automationRuns.value.map((run) => h("article", { key: run.automationRunId, class: "run-row", "data-testid": `automation-history-row-${run.automationRunId}` }, [
              h("strong", null, run.status),
              h("span", null, `${run.triggerKind} · attempt ${run.attempt}`),
              h("span", null, formatTimestamp(run.scheduledFor)),
              run.runId ? h("code", null, run.runId) : null,
              run.errorCode ? h("span", { class: "error-code" }, run.errorCode) : null,
            ])),
            automationRuns.value.length === 0 ? h("p", null, "No runs.") : null,
          ]) : null,
        ]),
      ]);
    }


    function renderDelegations(): unknown {
      const selected = selectedDelegation.value;
      return h("section", { class: "delegation-layout", "aria-labelledby": "delegations-title" }, [
        h("aside", { class: "sidebar delegation-list" }, [
          h("h1", { id: "delegations-title" }, "Delegated work"),
          h("p", { class: "muted" }, "Bounded parent-child Run graph. Raw child transcripts are not exposed."),
          ...orderedDelegations.value.map((item) => h("button", {
            key: item.delegationId, type: "button",
            class: ["delegation-row", { active: item.delegationId === selectedDelegationId.value }],
            style: `--delegation-depth:${Math.max(0, item.depth - 1)}`,
            "data-testid": `delegation-${item.delegationId}`,
            "data-depth": String(item.depth),
            onClick: () => runAction(() => selectDelegation(item.delegationId)),
          }, [
            h("span", { class: "delegation-status", "data-status": item.status }, item.status),
            h("strong", null, `Depth ${item.depth}`),
            h("code", null, item.childRunId.slice(0, 8)),
          ])),
          delegations.value.length === 0 ? h("p", null, "No delegated work.") : null,
        ]),
        h("section", { class: "panel delegation-detail", "data-testid": "delegation-detail" }, selected ? [
          h("header", { class: "section-header" }, [
            h("div", null, [h("h2", null, selected.status), h("p", { class: "muted" }, selected.delegationId)]),
            h("span", { role: "status", "data-testid": "delegation-action-state" }, delegationActionState.value),
          ]),
          h("dl", { class: "summary-grid" }, [
            h("dt", null, "Root Run"), h("dd", null, selected.rootRunId),
            h("dt", null, "Parent Run"), h("dd", null, selected.parentRunId),
            h("dt", null, "Child Run"), h("dd", null, selected.childRunId),
            h("dt", null, "Depth"), h("dd", null, String(selected.depth)),
            h("dt", null, "Wait"), h("dd", null, selected.waitState ?? "—"),
            h("dt", null, "Deadline"), h("dd", null, formatTimestamp(selected.budget.deadlineAt)),
            h("dt", null, "Usage"), h("dd", null, `${selected.usage.turns} turns · ${selected.usage.inputTokens + selected.usage.outputTokens} tokens · ${selected.usage.toolCalls} tools`),
            h("dt", null, "Budget"), h("dd", null, `${selected.budget.maxTurns} turns · ${selected.budget.maxTotalTokens} tokens · depth ${selected.budget.maxDelegationDepth}`),
            h("dt", null, "Tools"), h("dd", null, selected.toolNames.join(", ") || "none"),
            h("dt", null, "Skills"), h("dd", null, selected.skillIds.join(", ") || "none"),
            h("dt", null, "Error"), h("dd", null, selected.errorCode ?? "—"),
          ]),
          selected.summary ? h("section", null, [h("h3", null, "Bounded result"), h("p", { "data-testid": "delegation-summary" }, selected.summary)]) : null,
          h("section", null, [h("h3", null, "Artifacts"), ...(selected.artifacts.map((artifact) => h("p", { key: artifact.artifactId }, `${artifact.kind} · ${artifact.relativePath ?? artifact.artifactId} · ${artifact.sizeBytes} bytes`))), selected.artifacts.length === 0 ? h("p", null, "No artifacts.") : null]),
          h("section", null, [h("h3", null, "Events"), h("ol", { class: "event-list" }, selected.events.map((event) => h("li", { key: event.sequence }, `${event.sequence} · ${event.eventType} · ${formatTimestamp(event.emittedAt)}`)))]),
          activeDelegationStatuses.has(selected.status) ? h("button", { type: "button", class: "danger", "data-testid": "delegation-cancel", onClick: () => runAction(cancelDelegation) }, "Cancel subtree") : null,
        ] : [h("h2", null, "Select delegated work"), h("p", null, "Choose a child Run to inspect bounded usage and evidence.")]),
      ]);
    }

    function renderRoute(): unknown {
      if (route.value === "conversations") return renderConversations();
      if (route.value === "delegations") return renderDelegations();
      if (route.value === "automations") return renderAutomations();
      if (route.value === "workspaces") {
        return h("section", null, [
          h("h1", null, "Workspaces"),
          ...workspaces.value.map((item) => h("article", { key: item.workspaceId, class: "panel" }, [
            h("h2", null, item.displayName),
            h("p", null, `${item.workspaceId} · ${item.accessMode}`),
            h("code", null, item.rootRevision),
          ])),
        ]);
      }
      if (route.value === "skills") {
        return h("section", null, [h("h1", null, "Skills"), h("p", null, "Skill discovery and immutable Run snapshots remain Host-owned. This vertical slice does not expose filesystem paths.")]);
      }
      if (route.value === "approvals") {
        return h("section", null, [
          h("h1", null, "Approvals"),
          ...approvals.value.map((item) => h("article", {
            key: item.requestId,
            class: ["panel", { selected: approvalDeepLink.value === item.requestId }],
            "data-request-id": item.requestId,
            "data-testid": `approval-${item.requestId}`,
          }, [
            h("h2", null, item.toolName ?? "Process approval"),
            h("p", null, `${item.status} · ${item.requestId}`),
            item.status === "PENDING" ? h("div", { class: "approval-actions" }, [
              h("button", { type: "button", "data-testid": "approval-allow-once", onClick: () => runAction(() => resolveApproval(item, "allow_once")) }, "Allow once"),
              h("button", { type: "button", "data-testid": "approval-allow-conversation", onClick: () => runAction(() => resolveApproval(item, "allow_for_conversation")) }, "Allow for conversation"),
              h("button", { type: "button", "data-testid": "approval-deny", onClick: () => runAction(() => resolveApproval(item, "deny")) }, "Deny"),
            ]) : null,
          ])),
          approvals.value.length === 0 ? h("p", null, "No approvals.") : null,
        ]);
      }
      if (route.value === "artifacts") {
        return h("section", null, [
          h("h1", null, "Artifacts"),
          ...artifacts.value.map((item) => h("article", { key: item.artifactId, class: "panel" }, [
            h("h2", null, item.relativePath ?? item.operation),
            h("p", null, `${item.kind} · ${item.sizeBytes} bytes`),
            ...item.files.map((file) => h("button", {
              key: file.name,
              type: "button",
              "data-testid": "artifact-file",
              onClick: () => runAction(() => openArtifact(item, file.name)),
            }, file.name)),
          ])),
          artifacts.value.length === 0 ? h("p", null, "No artifacts.") : null,
        ]);
      }
      if (route.value === "settings") {
        return h("section", null, [h("h1", null, "Settings"), h("p", null, "Connection credentials are kept in memory and never written to localStorage. Only the non-secret notice cursor is persisted.")]);
      }
      return h("section", null, [h("h1", null, "Diagnostics"), h("pre", { class: "panel" }, JSON.stringify(diagnostics.value, null, 2))]);
    }

    return () => h("div", { class: "app-shell", "data-framework": "vue-3", "data-testid": "app-shell" }, [
      h("header", { class: "topbar", role: "banner" }, [
        h("div", null, [h("strong", null, "OpenRill"), h("span", { class: "version" }, bootstrap.value?.version ?? "starting")]),
        h("div", { class: "connection-status" }, [
          h("span", { class: "connection", "data-state": connection.value, "data-testid": "connection-state", role: "status", "aria-live": "polite" }, connection.value),
          h("span", { class: "startup-phase", "data-testid": "startup-phase" }, startupPhase.value),
        ]),
      ]),
      h("nav", { class: "primary-nav", "aria-label": "Control UI sections" }, ROUTES.map((item) => h("button", {
        key: item,
        type: "button",
        "data-testid": `nav-${item}`,
        class: { active: route.value === item },
        onClick: () => navigate(item),
      }, item))),
      h("main", { id: "main-content", class: "main", tabindex: -1 }, [
        error.value ? h("p", { class: "error", role: "alert" }, error.value) : null,
        renderRoute(),
      ]),
      artifactPreview.value ? h("div", {
        class: "modal-backdrop",
        onClick: (event: Event) => { if (event.target === event.currentTarget) closeArtifact(); },
      }, [
        h("section", { class: "modal", "data-testid": "artifact-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "artifact-title" }, [
          h("header", null, [
            h("h2", { id: "artifact-title" }, artifactPreviewTitle.value),
            h("button", { type: "button", onClick: closeArtifact, "aria-label": "Close artifact" }, "×"),
          ]),
          h("pre", { "data-testid": "artifact-content" }, artifactPreview.value),
        ]),
      ]) : null,
    ]);
  },
}).mount("#app");
