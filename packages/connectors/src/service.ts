import { createHash, randomUUID } from "node:crypto";
import type { ConversationService } from "@openrill/conversations";
import type {
  LedgerConnectorAccountStatus,
  LedgerConnectorDeadLetterRow,
  LedgerConnectorDeliveryAttemptRow,
  LedgerConnectorDeliveryReceiptRow,
  LedgerConnectorDeliveryStatus,
  LedgerConnectorIngressStatus,
  OpenRillStateDatabase,
  StateRepositories,
} from "@openrill/state";
import { ConnectorError, type ConnectorDeliveryCertainty } from "./errors.js";
import type {
  ConnectorAccount,
  ConnectorConversationBinding,
  ConnectorDeadLetter,
  ConnectorDelivery,
  ConnectorDeliveryClaim,
  ConnectorDeliveryEnqueueResult,
  ConnectorDeliveryRequest,
  ConnectorDeliveryReceipt,
  ConnectorIngress,
  ConnectorIngressAdmission,
  ConnectorIngressAdmissionResult,
  ConnectorIngressAdoptionResult,
  ConnectorIngressClaim,
  ConnectorIngressRoute,
  ConnectorProviderReceipt,
  ConnectorRunOutputProjection,
  ConnectorRunRecoveryResult,
} from "./types.js";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const WORKSPACE_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const DEFAULT_INGRESS_LEASE_MS = 30_000;
const DEFAULT_DELIVERY_LEASE_MS = 30_000;
const DEFAULT_MAX_DELIVERY_ATTEMPTS = 5;

function bounded(value: string, label: string, max: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || (pattern && !pattern.test(value))) {
    throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", `invalid ${label}`);
  }
  return value;
}

function optionalBounded(value: string | undefined, label: string, max: number): string | undefined {
  return value === undefined ? undefined : bounded(value, label, max);
}

function positiveInteger(value: number, label: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", `${label} must be a positive integer`);
  }
  return value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function same(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function boundedSummary(value: string, fallback: string): string {
  const normalized = String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
  return (normalized || fallback).slice(0, 1000);
}

function publicAccount(row: ConnectorAccount): ConnectorAccount { return { ...row }; }
function publicIngress(row: ConnectorIngress): ConnectorIngress { return { ...row }; }
function publicDelivery(row: ConnectorDelivery): ConnectorDelivery { return { ...row }; }

function completionText(messages: readonly { readonly role: string; readonly content: unknown }[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant" || message.content === null || typeof message.content !== "object" || Array.isArray(message.content)) continue;
    const content = message.content as Record<string, unknown>;
    if (content.type === "assistant" && typeof content.text === "string" && content.text.trim()) return content.text.trim();
    if (content.type === "text" && typeof content.text === "string" && content.text.trim()) return content.text.trim();
  }
  return "";
}

export interface ConnectorRuntimeServiceOptions {
  readonly state: OpenRillStateDatabase;
  readonly conversations: ConversationService;
  readonly workspaceIds: readonly string[];
  readonly now?: () => number;
  readonly createId?: () => string;
  readonly ingressLeaseMs?: number;
  readonly deliveryLeaseMs?: number;
  readonly maxDeliveryAttempts?: number;
}

export class ConnectorRuntimeService {
  readonly #now: () => number;
  readonly #createId: () => string;
  readonly #workspaceIds: ReadonlySet<string>;
  readonly #ingressLeaseMs: number;
  readonly #deliveryLeaseMs: number;
  readonly #maxDeliveryAttempts: number;

  public constructor(private readonly options: ConnectorRuntimeServiceOptions) {
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? randomUUID;
    this.#workspaceIds = new Set(options.workspaceIds);
    this.#ingressLeaseMs = positiveInteger(options.ingressLeaseMs ?? DEFAULT_INGRESS_LEASE_MS, "ingressLeaseMs", 15 * 60_000);
    this.#deliveryLeaseMs = positiveInteger(options.deliveryLeaseMs ?? DEFAULT_DELIVERY_LEASE_MS, "deliveryLeaseMs", 15 * 60_000);
    this.#maxDeliveryAttempts = positiveInteger(options.maxDeliveryAttempts ?? DEFAULT_MAX_DELIVERY_ATTEMPTS, "maxDeliveryAttempts", 100);
  }

  #authorizeWorkspace(workspaceId: string): void {
    bounded(workspaceId, "workspaceId", 64, WORKSPACE_PATTERN);
    if (!this.#workspaceIds.has(workspaceId)) {
      throw new ConnectorError("CONNECTOR_WORKSPACE_ACCESS_DENIED", "connector workspace access denied");
    }
  }

  #account(repositories: StateRepositories, connectorId: string, accountId: string, requireEnabled = true): ConnectorAccount {
    const account = repositories.connectors.getAccount(connectorId, accountId);
    if (!account) throw new ConnectorError("CONNECTOR_ACCOUNT_NOT_FOUND", "connector account not found");
    if (requireEnabled && account.status !== "ENABLED") {
      throw new ConnectorError("CONNECTOR_ACCOUNT_DISABLED", "connector account is disabled");
    }
    this.#authorizeWorkspace(account.workspaceId);
    return account;
  }

  public registerAccount(input: {
    readonly connectorId: string;
    readonly accountId: string;
    readonly workspaceId: string;
    readonly extensionId: string;
    readonly status?: LedgerConnectorAccountStatus;
  }): ConnectorAccount {
    const connectorId = bounded(input.connectorId, "connectorId", 128, ID_PATTERN);
    const accountId = bounded(input.accountId, "accountId", 128, ID_PATTERN);
    const extensionId = bounded(input.extensionId, "extensionId", 128, ID_PATTERN);
    this.#authorizeWorkspace(input.workspaceId);
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const existing = repositories.connectors.getAccount(connectorId, accountId);
      if (existing && (existing.workspaceId !== input.workspaceId || existing.extensionId !== extensionId)) {
        throw new ConnectorError("CONNECTOR_BINDING_CONFLICT", "connector account ownership cannot be rebound");
      }
      return publicAccount(repositories.connectors.upsertAccount({
        connectorId,
        accountId,
        workspaceId: input.workspaceId,
        extensionId,
        status: input.status ?? "ENABLED",
        revision: 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }));
    });
  }

  public listAccounts(connectorId?: string): ConnectorAccount[] {
    if (connectorId !== undefined) bounded(connectorId, "connectorId", 128, ID_PATTERN);
    return this.options.state.transaction((repositories) => repositories.connectors.listAccounts(connectorId).map(publicAccount));
  }

  public projectRunOutput(runIdInput: string): ConnectorRunOutputProjection {
    const runId = bounded(runIdInput, "runId", 128, ID_PATTERN);
    const context = this.options.conversations.executionContext(runId);
    const ingress = this.options.state.transaction((repositories) => repositories.connectors.getIngressByRunId(runId));
    if (!ingress) return { kind: "not-connector-run", runId };
    if (context.run.status !== "COMPLETED") return { kind: "not-deliverable", runId, reason: `run is ${context.run.status}` };
    const text = completionText(context.messages);
    if (!text) return { kind: "not-deliverable", runId, reason: "run has no completion text" };
    if (ingress.status !== "ADOPTED" || !ingress.bindingId) {
      return { kind: "not-deliverable", runId, reason: "connector ingress is not adopted" };
    }
    const binding = this.options.state.transaction((repositories) => repositories.connectors.getBinding(ingress.bindingId!));
    if (!binding || binding.conversationId !== context.conversation.conversationId) {
      return { kind: "not-deliverable", runId, reason: "connector binding is unavailable or conflicts with the Run" };
    }
    const queued = this.enqueueDelivery(ingress.connectorId, {
      accountId: ingress.accountId,
      conversationId: binding.conversationId,
      runId,
      targetKey: binding.externalConversationId,
      ...(binding.externalThreadId ? { threadKey: binding.externalThreadId } : {}),
      payloadVersion: 1,
      payload: { type: "text", text },
      idempotencyKey: `run:${runId}:assistant-final:v1`,
    });
    return {
      kind: "delivery",
      runId,
      connectorId: ingress.connectorId,
      accountId: ingress.accountId,
      delivery: queued.delivery,
      replayed: queued.replayed,
    };
  }

  public recoverRunOutputs(limitInput = 1_000): ConnectorRunRecoveryResult {
    const limit = positiveInteger(limitInput, "limit", 10_000);
    const rows = this.listIngress({ status: "ADOPTED", limit });
    const seen = new Set<string>();
    const deliveries: { connectorId: string; accountId: string; deliveryId: string }[] = [];
    let projected = 0;
    let replayed = 0;
    let skipped = 0;
    for (const ingress of rows) {
      if (!ingress.runId || seen.has(ingress.runId)) { skipped += 1; continue; }
      seen.add(ingress.runId);
      const result = this.projectRunOutput(ingress.runId);
      if (result.kind !== "delivery") { skipped += 1; continue; }
      if (result.replayed) replayed += 1;
      else projected += 1;
      deliveries.push({ connectorId: result.connectorId, accountId: result.accountId, deliveryId: result.delivery.deliveryId });
    }
    return { scanned: rows.length, projected, replayed, skipped, deliveries };
  }

  public receiveIngress(connectorIdInput: string, input: ConnectorIngressAdmission): ConnectorIngressAdmissionResult {
    const connectorId = bounded(connectorIdInput, "connectorId", 128, ID_PATTERN);
    const accountId = bounded(input.accountId, "accountId", 128, ID_PATTERN);
    const externalEventId = bounded(input.externalEventId, "externalEventId", 256);
    const laneKey = bounded(input.laneKey, "laneKey", 512);
    const payloadVersion = positiveInteger(input.payloadVersion, "payloadVersion", 1_000_000);
    const payloadHash = hash(input.payload);
    const now = input.receivedAt ?? this.#now();
    if (!Number.isInteger(now) || now < 0) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "receivedAt must be a non-negative integer");
    return this.options.state.transaction((repositories) => {
      this.#account(repositories, connectorId, accountId);
      const existing = repositories.connectors.getIngressByExternalEvent(connectorId, accountId, externalEventId);
      if (existing) {
        if (existing.laneKey !== laneKey || existing.payloadVersion !== payloadVersion || existing.payloadHash !== payloadHash || !same(existing.payload, input.payload)) {
          throw new ConnectorError("CONNECTOR_INGRESS_CONFLICT", "external event id was reused with different ingress content");
        }
        return { ingress: publicIngress(existing), replayed: true, acknowledge: true };
      }
      const ingress: ConnectorIngress = {
        ingressId: this.#createId(), connectorId, accountId, externalEventId, laneKey,
        payloadVersion, payload: input.payload, payloadHash, status: "RECEIVED", attemptCount: 0,
        availableAt: now, claimToken: null, claimDeadlineAt: null, bindingId: null,
        messageId: null, runId: null, lastErrorCode: null, lastErrorSummary: null,
        receivedAt: now, updatedAt: now,
      };
      repositories.connectors.insertIngress(ingress);
      return { ingress: publicIngress(ingress), replayed: false, acknowledge: true };
    });
  }

  #recoverExpiredIngressWithRepositories(repositories: StateRepositories, now: number, limit: number): number {
    let recovered = 0;
    for (const claim of repositories.connectors.listExpiredIngressClaims(now, limit)) {
      if (!claim.claimToken) continue;
      if (repositories.connectors.updateIngressClaim({
        ingressId: claim.ingressId,
        claimToken: claim.claimToken,
        status: "RECEIVED",
        availableAt: now,
        errorCode: "HOST_RESTART_RECLAIMED",
        errorSummary: "expired ingress claim was safely reclaimed",
        now,
      })) recovered += 1;
    }
    return recovered;
  }

  public recoverExpiredIngressClaims(limit = 100): number {
    positiveInteger(limit, "limit", 1000);
    const now = this.#now();
    return this.options.state.transaction((repositories) => this.#recoverExpiredIngressWithRepositories(repositories, now, limit));
  }

  public claimIngress(connectorIdInput: string, accountIdInput: string, laneKey?: string): ConnectorIngressClaim | null {
    const connectorId = bounded(connectorIdInput, "connectorId", 128, ID_PATTERN);
    const accountId = bounded(accountIdInput, "accountId", 128, ID_PATTERN);
    if (laneKey !== undefined) bounded(laneKey, "laneKey", 512);
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      this.#account(repositories, connectorId, accountId);
      this.#recoverExpiredIngressWithRepositories(repositories, now, 100);
      const claimToken = this.#createId();
      const claimDeadlineAt = now + this.#ingressLeaseMs;
      const ingress = repositories.connectors.claimIngress({
        connectorId, accountId, ...(laneKey === undefined ? {} : { laneKey }),
        now, claimToken, claimDeadlineAt,
      });
      return ingress ? { ingress: publicIngress(ingress), claimToken, claimDeadlineAt } : null;
    });
  }

  #requireIngressClaim(repositories: StateRepositories, claim: ConnectorIngressClaim): ConnectorIngress {
    const current = repositories.connectors.getIngress(claim.ingress.ingressId);
    if (!current) throw new ConnectorError("CONNECTOR_INGRESS_NOT_FOUND", "connector ingress not found");
    if (current.status === "ADOPTED") return current;
    if (current.status !== "CLAIMED") throw new ConnectorError("CONNECTOR_INGRESS_STATE_INVALID", `connector ingress is ${current.status}`);
    if (current.claimToken !== claim.claimToken) throw new ConnectorError("CONNECTOR_INGRESS_CLAIM_LOST", "connector ingress claim token no longer owns the row");
    return current;
  }

  public adoptIngress(claim: ConnectorIngressClaim, route: ConnectorIngressRoute, textInput: string): ConnectorIngressAdoptionResult {
    const text = bounded(textInput, "text", 65_536);
    this.#authorizeWorkspace(route.workspaceId);
    const externalScopeId = bounded(route.externalScopeId, "externalScopeId", 256);
    const externalConversationId = bounded(route.externalConversationId, "externalConversationId", 256);
    const externalThreadId = route.externalThreadId === undefined ? "" : bounded(route.externalThreadId, "externalThreadId", 256);
    optionalBounded(route.modelProfile, "modelProfile", 64);
    optionalBounded(route.title, "title", 256);
    return this.options.state.transaction((repositories) => {
      const ingress = this.#requireIngressClaim(repositories, claim);
      if (ingress.status === "ADOPTED") {
        const binding = ingress.bindingId ? repositories.connectors.getBinding(ingress.bindingId) : null;
        const message = ingress.messageId ? repositories.conversations.getMessage(ingress.messageId) : null;
        const conversation = binding ? repositories.conversations.getConversation(binding.conversationId) : null;
        if (!binding || !message || !conversation || !ingress.runId) {
          throw new ConnectorError("CONNECTOR_INGRESS_STATE_INVALID", "adopted connector ingress is incomplete");
        }
        const routeMatches = binding.workspaceId === route.workspaceId
          && binding.externalScopeId === externalScopeId
          && binding.externalConversationId === externalConversationId
          && binding.externalThreadId === externalThreadId
          && conversation.modelProfile === (route.modelProfile ?? "default")
          && conversation.title === (route.title ?? null);
        const textMatches = message.role === "user"
          && same(message.content, { type: "text", text });
        if (!routeMatches || !textMatches) {
          throw new ConnectorError("CONNECTOR_INGRESS_CONFLICT", "adopted connector ingress replay differs from its durable route or message");
        }
        return { ingress, binding, conversationId: binding.conversationId, messageId: ingress.messageId!, runId: ingress.runId, replayed: true };
      }
      const account = this.#account(repositories, ingress.connectorId, ingress.accountId);
      if (account.workspaceId !== route.workspaceId) {
        throw new ConnectorError("CONNECTOR_BINDING_CONFLICT", "connector route workspace differs from the registered account workspace");
      }
      let binding = repositories.connectors.getBindingByRoute({
        connectorId: ingress.connectorId,
        accountId: ingress.accountId,
        externalScopeId,
        externalConversationId,
        externalThreadId,
      });
      if (binding && binding.workspaceId !== route.workspaceId) {
        throw new ConnectorError("CONNECTOR_BINDING_CONFLICT", "connector route is already bound to a different workspace");
      }
      if (!binding) {
        const conversation = this.options.conversations.createInTransaction(repositories, {
          workspaceId: route.workspaceId,
          ...(route.modelProfile === undefined ? {} : { modelProfile: route.modelProfile }),
          ...(route.title === undefined ? {} : { title: route.title }),
        });
        binding = {
          bindingId: this.#createId(),
          connectorId: ingress.connectorId,
          accountId: ingress.accountId,
          workspaceId: route.workspaceId,
          externalScopeId,
          externalConversationId,
          externalThreadId,
          conversationId: conversation.conversationId,
          createdAt: this.#now(),
          updatedAt: this.#now(),
        };
        repositories.connectors.insertBinding(binding);
      }
      const submissionKey = `connector:${hash({ connectorId: ingress.connectorId, accountId: ingress.accountId, externalEventId: ingress.externalEventId }).slice(0, 64)}`;
      const sent = this.options.conversations.sendInTransaction(repositories, {
        workspaceId: route.workspaceId,
        conversationId: binding.conversationId,
        submissionKey,
        text,
      });
      const now = this.#now();
      const updated = repositories.connectors.updateIngressClaim({
        ingressId: ingress.ingressId,
        claimToken: claim.claimToken,
        status: "ADOPTED",
        availableAt: now,
        bindingId: binding.bindingId,
        messageId: sent.message.messageId,
        runId: sent.run.runId,
        now,
      });
      if (!updated) throw new ConnectorError("CONNECTOR_INGRESS_CLAIM_LOST", "connector ingress claim was lost before adoption commit");
      return {
        ingress: repositories.connectors.getIngress(ingress.ingressId)!,
        binding,
        conversationId: binding.conversationId,
        messageId: sent.message.messageId,
        runId: sent.run.runId,
        replayed: sent.replayed,
      };
    });
  }

  public ignoreIngress(claim: ConnectorIngressClaim, reasonInput: string): ConnectorIngress {
    const reason = boundedSummary(reasonInput, "connector ingress ignored");
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const ingress = this.#requireIngressClaim(repositories, claim);
      if (ingress.status === "ADOPTED") throw new ConnectorError("CONNECTOR_INGRESS_STATE_INVALID", "adopted connector ingress cannot be ignored");
      const updated = repositories.connectors.updateIngressClaim({
        ingressId: ingress.ingressId, claimToken: claim.claimToken, status: "IGNORED",
        availableAt: now, errorCode: "IGNORED", errorSummary: reason, now,
      });
      if (!updated) throw new ConnectorError("CONNECTOR_INGRESS_CLAIM_LOST", "connector ingress claim was lost");
      return repositories.connectors.getIngress(ingress.ingressId)!;
    });
  }

  public failIngress(claim: ConnectorIngressClaim, input: { readonly errorCode: string; readonly summary: string; readonly retryable: boolean; readonly retryAfterMs?: number }): ConnectorIngress {
    const errorCode = bounded(input.errorCode, "errorCode", 128, ID_PATTERN);
    const summary = boundedSummary(input.summary, "connector ingress failed");
    const retryAfterMs = input.retryAfterMs ?? 1000;
    if (!Number.isInteger(retryAfterMs) || retryAfterMs < 0 || retryAfterMs > 24 * 60 * 60_000) {
      throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "retryAfterMs is invalid");
    }
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const ingress = this.#requireIngressClaim(repositories, claim);
      if (ingress.status === "ADOPTED") throw new ConnectorError("CONNECTOR_INGRESS_STATE_INVALID", "adopted connector ingress cannot fail");
      const status: LedgerConnectorIngressStatus = input.retryable ? "RECEIVED" : "DEAD";
      const updated = repositories.connectors.updateIngressClaim({
        ingressId: ingress.ingressId, claimToken: claim.claimToken, status,
        availableAt: input.retryable ? now + retryAfterMs : now,
        errorCode, errorSummary: summary, now,
      });
      if (!updated) throw new ConnectorError("CONNECTOR_INGRESS_CLAIM_LOST", "connector ingress claim was lost");
      if (!input.retryable) {
        repositories.connectors.insertDeadLetter(this.#deadLetter(ingress.connectorId, ingress.accountId, "INGRESS", ingress.ingressId, errorCode, summary, ingress.payloadHash, now));
      }
      return repositories.connectors.getIngress(ingress.ingressId)!;
    });
  }

  #deadLetter(connectorId: string, accountId: string, kind: "INGRESS" | "DELIVERY", subjectId: string, reasonCode: string, summary: string, payloadHash: string, now: number): LedgerConnectorDeadLetterRow {
    return {
      deadLetterId: this.#createId(), connectorId, accountId, kind, subjectId,
      reasonCode, summary: boundedSummary(summary, "connector dead letter"), payloadHash,
      status: "OPEN", createdAt: now, resolvedAt: null, resolution: null,
    };
  }

  public enqueueDelivery(connectorIdInput: string, input: ConnectorDeliveryRequest): ConnectorDeliveryEnqueueResult {
    const connectorId = bounded(connectorIdInput, "connectorId", 128, ID_PATTERN);
    const accountId = bounded(input.accountId, "accountId", 128, ID_PATTERN);
    const targetKey = bounded(input.targetKey, "targetKey", 512);
    const threadKey = input.threadKey === undefined ? "" : bounded(input.threadKey, "threadKey", 256);
    const idempotencyKey = bounded(input.idempotencyKey, "idempotencyKey", 256);
    positiveInteger(input.payloadVersion, "payloadVersion", 1_000_000);
    bounded(input.conversationId, "conversationId", 128);
    optionalBounded(input.runId, "runId", 128);
    optionalBounded(input.sourceMessageId, "sourceMessageId", 128);
    const payloadHash = hash(input.payload);
    const now = this.#now();
    const availableAt = input.availableAt ?? now;
    if (!Number.isInteger(availableAt) || availableAt < 0) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "availableAt is invalid");
    return this.options.state.transaction((repositories) => {
      const account = this.#account(repositories, connectorId, accountId);
      const conversation = repositories.conversations.getConversation(input.conversationId);
      if (!conversation) throw new ConnectorError("CONNECTOR_DELIVERY_CONFLICT", "delivery conversation not found");
      if (conversation.workspaceId !== account.workspaceId) throw new ConnectorError("CONNECTOR_WORKSPACE_ACCESS_DENIED", "delivery conversation belongs to a different workspace");
      const existing = repositories.connectors.getDeliveryByIdempotency(connectorId, accountId, idempotencyKey);
      if (existing) {
        const expected = {
          conversationId: input.conversationId, runId: input.runId ?? null,
          sourceMessageId: input.sourceMessageId ?? null, targetKey, threadKey,
          payloadVersion: input.payloadVersion, payloadHash,
        };
        const actual = {
          conversationId: existing.conversationId, runId: existing.runId,
          sourceMessageId: existing.sourceMessageId, targetKey: existing.targetKey,
          threadKey: existing.threadKey, payloadVersion: existing.payloadVersion,
          payloadHash: existing.payloadHash,
        };
        if (!same(actual, expected) || !same(existing.payload, input.payload)) {
          throw new ConnectorError("CONNECTOR_DELIVERY_CONFLICT", "delivery idempotency key was reused with different content");
        }
        return { delivery: publicDelivery(existing), replayed: true };
      }
      const delivery: ConnectorDelivery = {
        deliveryId: this.#createId(), connectorId, accountId,
        conversationId: input.conversationId, runId: input.runId ?? null,
        sourceMessageId: input.sourceMessageId ?? null, targetKey, threadKey,
        payloadVersion: input.payloadVersion, payload: input.payload, payloadHash, idempotencyKey,
        status: "PENDING", attemptCount: 0, availableAt, claimToken: null,
        claimDeadlineAt: null, lastErrorCode: null, lastErrorSummary: null,
        createdAt: now, updatedAt: now,
      };
      repositories.connectors.insertDelivery(delivery);
      return { delivery: publicDelivery(delivery), replayed: false };
    });
  }

  #recoverExpiredDeliveriesWithRepositories(repositories: StateRepositories, now: number, limit: number): { safe: number; uncertain: number } {
    let safe = 0;
    let uncertain = 0;
    for (const item of repositories.connectors.listExpiredDeliveryClaims(now, limit)) {
      const wasDispatched = item.attempt.status === "DISPATCHED";
      const errorCode = wasDispatched ? "HOST_RESTART_AFTER_DISPATCH" : "HOST_RESTART_BEFORE_DISPATCH";
      const summary = wasDispatched
        ? "delivery may have been accepted before Host restart; automatic replay is forbidden"
        : "delivery claim expired before dispatch and was safely returned to pending";
      const finished = repositories.connectors.finishDeliveryAttempt({
        deliveryId: item.delivery.deliveryId,
        claimToken: item.attempt.claimToken,
        attemptStatus: wasDispatched ? "UNCERTAIN" : "ABANDONED",
        deliveryStatus: wasDispatched ? "UNCERTAIN" : "PENDING",
        availableAt: now,
        errorCode,
        errorSummary: summary,
        now,
      });
      if (!finished) continue;
      if (wasDispatched) {
        uncertain += 1;
        repositories.connectors.insertDeadLetter(this.#deadLetter(
          item.delivery.connectorId, item.delivery.accountId, "DELIVERY", item.delivery.deliveryId,
          errorCode, summary, item.delivery.payloadHash, now,
        ));
      } else safe += 1;
    }
    return { safe, uncertain };
  }

  public recoverExpiredDeliveryClaims(limit = 100): { readonly safe: number; readonly uncertain: number } {
    positiveInteger(limit, "limit", 1000);
    const now = this.#now();
    return this.options.state.transaction((repositories) => this.#recoverExpiredDeliveriesWithRepositories(repositories, now, limit));
  }

  public claimDelivery(connectorIdInput: string, accountIdInput: string): ConnectorDeliveryClaim | null {
    const connectorId = bounded(connectorIdInput, "connectorId", 128, ID_PATTERN);
    const accountId = bounded(accountIdInput, "accountId", 128, ID_PATTERN);
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      this.#account(repositories, connectorId, accountId);
      this.#recoverExpiredDeliveriesWithRepositories(repositories, now, 100);
      const claimToken = this.#createId();
      const claimDeadlineAt = now + this.#deliveryLeaseMs;
      const claimed = repositories.connectors.claimDelivery({
        connectorId, accountId, now, claimToken, claimDeadlineAt, attemptId: this.#createId(),
      });
      return claimed ? { delivery: publicDelivery(claimed.delivery), attempt: claimed.attempt, claimToken, claimDeadlineAt } : null;
    });
  }

  public markDeliveryDispatched(claim: ConnectorDeliveryClaim): ConnectorDeliveryClaim {
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const attempt = repositories.connectors.markDeliveryDispatched({ deliveryId: claim.delivery.deliveryId, claimToken: claim.claimToken, now });
      if (!attempt) throw new ConnectorError("CONNECTOR_DELIVERY_CLAIM_LOST", "connector delivery claim was lost before dispatch");
      const delivery = repositories.connectors.getDelivery(claim.delivery.deliveryId);
      if (!delivery) throw new ConnectorError("CONNECTOR_DELIVERY_NOT_FOUND", "connector delivery not found");
      return { delivery, attempt, claimToken: claim.claimToken, claimDeadlineAt: claim.claimDeadlineAt };
    });
  }

  public completeDeliveryAccepted(claim: ConnectorDeliveryClaim, provider: ConnectorProviderReceipt): { readonly delivery: ConnectorDelivery; readonly receipt: ConnectorDeliveryReceipt; readonly replayed: boolean } {
    const providerMessageId = bounded(provider.providerMessageId, "providerMessageId", 512);
    optionalBounded(provider.providerConversationId, "providerConversationId", 512);
    optionalBounded(provider.providerThreadId, "providerThreadId", 512);
    const receiptHash = hash(provider.receipt);
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const attempt = repositories.connectors.getDeliveryAttemptByClaim(claim.claimToken);
      if (!attempt || attempt.deliveryId !== claim.delivery.deliveryId) throw new ConnectorError("CONNECTOR_DELIVERY_CLAIM_LOST", "connector delivery claim was lost");
      const existingReceipt = repositories.connectors.getReceiptByAttempt(attempt.attemptId);
      if (attempt.status === "ACCEPTED" && existingReceipt) {
        if (existingReceipt.providerMessageId !== providerMessageId
          || existingReceipt.providerConversationId !== (provider.providerConversationId ?? null)
          || existingReceipt.providerThreadId !== (provider.providerThreadId ?? null)
          || existingReceipt.receiptHash !== receiptHash
          || !same(existingReceipt.receipt, provider.receipt)) {
          throw new ConnectorError("CONNECTOR_RECEIPT_CONFLICT", "accepted connector delivery receipt conflicts with replay");
        }
        const current = repositories.connectors.getDelivery(claim.delivery.deliveryId);
        if (!current) throw new ConnectorError("CONNECTOR_DELIVERY_NOT_FOUND", "connector delivery not found");
        return { delivery: current, receipt: existingReceipt, replayed: true };
      }
      if (attempt.status !== "DISPATCHED") throw new ConnectorError("CONNECTOR_DELIVERY_STATE_INVALID", `delivery attempt is ${attempt.status}`);
      const receipt: LedgerConnectorDeliveryReceiptRow = {
        receiptId: this.#createId(), deliveryId: claim.delivery.deliveryId, attemptId: attempt.attemptId,
        providerMessageId, providerConversationId: provider.providerConversationId ?? null,
        providerThreadId: provider.providerThreadId ?? null, receipt: provider.receipt,
        receiptHash, acceptedAt: now,
      };
      repositories.connectors.insertReceipt(receipt);
      const finished = repositories.connectors.finishDeliveryAttempt({
        deliveryId: claim.delivery.deliveryId, claimToken: claim.claimToken,
        attemptStatus: "ACCEPTED", deliveryStatus: "DELIVERED", availableAt: now, now,
      });
      if (!finished) throw new ConnectorError("CONNECTOR_DELIVERY_CLAIM_LOST", "connector delivery claim was lost before receipt commit");
      return { delivery: repositories.connectors.getDelivery(claim.delivery.deliveryId)!, receipt, replayed: false };
    });
  }

  public completeDeliverySuppressed(claim: ConnectorDeliveryClaim, reasonInput: string): ConnectorDelivery {
    const reason = boundedSummary(reasonInput, "connector delivery suppressed");
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const finished = repositories.connectors.finishDeliveryAttempt({
        deliveryId: claim.delivery.deliveryId, claimToken: claim.claimToken,
        attemptStatus: "REJECTED", deliveryStatus: "SUPPRESSED", availableAt: now,
        errorCode: "SUPPRESSED", errorSummary: reason, now,
      });
      if (!finished) throw new ConnectorError("CONNECTOR_DELIVERY_CLAIM_LOST", "connector delivery claim was lost");
      return repositories.connectors.getDelivery(claim.delivery.deliveryId)!;
    });
  }

  public failDelivery(claim: ConnectorDeliveryClaim, input: {
    readonly errorCode: string;
    readonly summary: string;
    readonly certainty: ConnectorDeliveryCertainty;
    readonly retryable: boolean;
    readonly retryAfterMs?: number;
  }): ConnectorDelivery {
    const errorCode = bounded(input.errorCode, "errorCode", 128, ID_PATTERN);
    const summary = boundedSummary(input.summary, "connector delivery failed");
    const retryAfterMs = input.retryAfterMs ?? 1000;
    if (!Number.isInteger(retryAfterMs) || retryAfterMs < 0 || retryAfterMs > 24 * 60 * 60_000) {
      throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "retryAfterMs is invalid");
    }
    const now = this.#now();
    return this.options.state.transaction((repositories) => {
      const attempt = repositories.connectors.getDeliveryAttemptByClaim(claim.claimToken);
      if (!attempt || attempt.deliveryId !== claim.delivery.deliveryId) throw new ConnectorError("CONNECTOR_DELIVERY_CLAIM_LOST", "connector delivery claim was lost");
      const delivery = repositories.connectors.getDelivery(claim.delivery.deliveryId);
      if (!delivery) throw new ConnectorError("CONNECTOR_DELIVERY_NOT_FOUND", "connector delivery not found");
      const uncertain = input.certainty === "MAYBE_ACCEPTED";
      const retry = !uncertain && input.retryable && delivery.attemptCount < this.#maxDeliveryAttempts;
      const deliveryStatus: LedgerConnectorDeliveryStatus = uncertain ? "UNCERTAIN" : retry ? "PENDING" : "DEAD";
      const attemptStatus: Exclude<LedgerConnectorDeliveryAttemptRow["status"], "CLAIMED" | "DISPATCHED"> = uncertain ? "UNCERTAIN" : "REJECTED";
      const finished = repositories.connectors.finishDeliveryAttempt({
        deliveryId: delivery.deliveryId, claimToken: claim.claimToken, attemptStatus,
        deliveryStatus, availableAt: retry ? now + retryAfterMs : now,
        errorCode, errorSummary: summary, now,
      });
      if (!finished) throw new ConnectorError("CONNECTOR_DELIVERY_CLAIM_LOST", "connector delivery claim was lost");
      if (deliveryStatus === "UNCERTAIN" || deliveryStatus === "DEAD") {
        repositories.connectors.insertDeadLetter(this.#deadLetter(
          delivery.connectorId, delivery.accountId, "DELIVERY", delivery.deliveryId,
          errorCode, summary, delivery.payloadHash, now,
        ));
      }
      return repositories.connectors.getDelivery(delivery.deliveryId)!;
    });
  }

  public listIngress(input: { readonly connectorId?: string; readonly accountId?: string; readonly status?: LedgerConnectorIngressStatus; readonly limit?: number } = {}): ConnectorIngress[] {
    const limit = input.limit ?? 100;
    positiveInteger(limit, "limit", 1000);
    if (input.connectorId !== undefined) bounded(input.connectorId, "connectorId", 128, ID_PATTERN);
    if (input.accountId !== undefined) bounded(input.accountId, "accountId", 128, ID_PATTERN);
    return this.options.state.transaction((repositories) => repositories.connectors.listIngress({ ...input, limit }));
  }

  public listDeliveries(input: { readonly connectorId?: string; readonly accountId?: string; readonly status?: LedgerConnectorDeliveryStatus; readonly limit?: number } = {}): ConnectorDelivery[] {
    const limit = input.limit ?? 100;
    positiveInteger(limit, "limit", 1000);
    if (input.connectorId !== undefined) bounded(input.connectorId, "connectorId", 128, ID_PATTERN);
    if (input.accountId !== undefined) bounded(input.accountId, "accountId", 128, ID_PATTERN);
    return this.options.state.transaction((repositories) => repositories.connectors.listDeliveries({ ...input, limit }));
  }

  public listDeadLetters(input: { readonly connectorId?: string; readonly accountId?: string; readonly status?: "OPEN" | "RESOLVED"; readonly limit?: number } = {}): ConnectorDeadLetter[] {
    const limit = input.limit ?? 100;
    positiveInteger(limit, "limit", 1000);
    if (input.connectorId !== undefined) bounded(input.connectorId, "connectorId", 128, ID_PATTERN);
    if (input.accountId !== undefined) bounded(input.accountId, "accountId", 128, ID_PATTERN);
    return this.options.state.transaction((repositories) => repositories.connectors.listDeadLetters({ ...input, limit }));
  }
}
