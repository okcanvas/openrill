import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { StateDatabaseError } from "./errors.js";

export type LedgerConnectorAccountStatus = "ENABLED" | "DISABLED";
export type LedgerConnectorIngressStatus = "RECEIVED" | "CLAIMED" | "ADOPTED" | "IGNORED" | "DEAD";
export type LedgerConnectorDeliveryStatus = "PENDING" | "DELIVERING" | "DELIVERED" | "SUPPRESSED" | "UNCERTAIN" | "DEAD";
export type LedgerConnectorDeliveryAttemptStatus = "CLAIMED" | "DISPATCHED" | "ACCEPTED" | "REJECTED" | "ABANDONED" | "UNCERTAIN";
export type LedgerConnectorDeadLetterKind = "INGRESS" | "DELIVERY";
export type LedgerConnectorDeadLetterStatus = "OPEN" | "RESOLVED";

export interface LedgerConnectorAccountRow {
  readonly connectorId: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly extensionId: string;
  readonly status: LedgerConnectorAccountStatus;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface LedgerConnectorBindingRow {
  readonly bindingId: string;
  readonly connectorId: string;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly externalScopeId: string;
  readonly externalConversationId: string;
  readonly externalThreadId: string;
  readonly conversationId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface LedgerConnectorIngressRow {
  readonly ingressId: string;
  readonly connectorId: string;
  readonly accountId: string;
  readonly externalEventId: string;
  readonly laneKey: string;
  readonly payloadVersion: number;
  readonly payload: unknown;
  readonly payloadHash: string;
  readonly status: LedgerConnectorIngressStatus;
  readonly attemptCount: number;
  readonly availableAt: number;
  readonly claimToken: string | null;
  readonly claimDeadlineAt: number | null;
  readonly bindingId: string | null;
  readonly messageId: string | null;
  readonly runId: string | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorSummary: string | null;
  readonly receivedAt: number;
  readonly updatedAt: number;
}

export interface LedgerConnectorDeliveryRow {
  readonly deliveryId: string;
  readonly connectorId: string;
  readonly accountId: string;
  readonly conversationId: string;
  readonly runId: string | null;
  readonly sourceMessageId: string | null;
  readonly targetKey: string;
  readonly threadKey: string;
  readonly payloadVersion: number;
  readonly payload: unknown;
  readonly payloadHash: string;
  readonly idempotencyKey: string;
  readonly status: LedgerConnectorDeliveryStatus;
  readonly attemptCount: number;
  readonly availableAt: number;
  readonly claimToken: string | null;
  readonly claimDeadlineAt: number | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorSummary: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface LedgerConnectorDeliveryAttemptRow {
  readonly attemptId: string;
  readonly deliveryId: string;
  readonly attemptNumber: number;
  readonly claimToken: string;
  readonly requestHash: string;
  readonly status: LedgerConnectorDeliveryAttemptStatus;
  readonly errorCode: string | null;
  readonly errorSummary: string | null;
  readonly startedAt: number;
  readonly dispatchedAt: number | null;
  readonly endedAt: number | null;
}

export interface LedgerConnectorDeliveryReceiptRow {
  readonly receiptId: string;
  readonly deliveryId: string;
  readonly attemptId: string;
  readonly providerMessageId: string;
  readonly providerConversationId: string | null;
  readonly providerThreadId: string | null;
  readonly receipt: unknown;
  readonly receiptHash: string;
  readonly acceptedAt: number;
}

export interface LedgerConnectorDeadLetterRow {
  readonly deadLetterId: string;
  readonly connectorId: string;
  readonly accountId: string;
  readonly kind: LedgerConnectorDeadLetterKind;
  readonly subjectId: string;
  readonly reasonCode: string;
  readonly summary: string;
  readonly payloadHash: string;
  readonly status: LedgerConnectorDeadLetterStatus;
  readonly createdAt: number;
  readonly resolvedAt: number | null;
  readonly resolution: string | null;
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `${label} contains invalid JSON`);
  }
}

function stringifyJson(value: unknown, label: string): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError(`${label} must be JSON-serializable`);
  return json;
}

const ACCOUNT_SELECT = `
  SELECT connector_id connectorId, account_id accountId, workspace_id workspaceId,
         extension_id extensionId, status, revision, created_at createdAt, updated_at updatedAt
  FROM connector_accounts`;

const BINDING_SELECT = `
  SELECT binding_id bindingId, connector_id connectorId, account_id accountId,
         workspace_id workspaceId, external_scope_id externalScopeId,
         external_conversation_id externalConversationId, external_thread_id externalThreadId,
         conversation_id conversationId, created_at createdAt, updated_at updatedAt
  FROM connector_conversation_bindings`;

const INGRESS_SELECT = `
  SELECT ingress_id ingressId, connector_id connectorId, account_id accountId,
         external_event_id externalEventId, lane_key laneKey, payload_version payloadVersion,
         payload_json payloadJson, payload_hash payloadHash, status, attempt_count attemptCount,
         available_at availableAt, claim_token claimToken, claim_deadline_at claimDeadlineAt,
         binding_id bindingId, message_id messageId, run_id runId,
         last_error_code lastErrorCode, last_error_summary lastErrorSummary,
         received_at receivedAt, updated_at updatedAt
  FROM connector_ingress_events`;

const DELIVERY_SELECT = `
  SELECT delivery_id deliveryId, connector_id connectorId, account_id accountId,
         conversation_id conversationId, run_id runId, source_message_id sourceMessageId,
         target_key targetKey, thread_key threadKey, payload_version payloadVersion,
         payload_json payloadJson, payload_hash payloadHash, idempotency_key idempotencyKey,
         status, attempt_count attemptCount, available_at availableAt,
         claim_token claimToken, claim_deadline_at claimDeadlineAt,
         last_error_code lastErrorCode, last_error_summary lastErrorSummary,
         created_at createdAt, updated_at updatedAt
  FROM connector_deliveries`;

const ATTEMPT_SELECT = `
  SELECT attempt_id attemptId, delivery_id deliveryId, attempt_number attemptNumber,
         claim_token claimToken, request_hash requestHash, status,
         error_code errorCode, error_summary errorSummary,
         started_at startedAt, dispatched_at dispatchedAt, ended_at endedAt
  FROM connector_delivery_attempts`;

const RECEIPT_SELECT = `
  SELECT receipt_id receiptId, delivery_id deliveryId, attempt_id attemptId,
         provider_message_id providerMessageId, provider_conversation_id providerConversationId,
         provider_thread_id providerThreadId, receipt_json receiptJson,
         receipt_hash receiptHash, accepted_at acceptedAt
  FROM connector_delivery_receipts`;

const DEAD_LETTER_SELECT = `
  SELECT dead_letter_id deadLetterId, connector_id connectorId, account_id accountId,
         kind, subject_id subjectId, reason_code reasonCode, summary, payload_hash payloadHash,
         status, created_at createdAt, resolved_at resolvedAt, resolution
  FROM connector_dead_letters`;

function ingress(row: any): LedgerConnectorIngressRow {
  return {
    ingressId: row.ingressId,
    connectorId: row.connectorId,
    accountId: row.accountId,
    externalEventId: row.externalEventId,
    laneKey: row.laneKey,
    payloadVersion: row.payloadVersion,
    payload: parseJson(row.payloadJson, "connector_ingress_events.payload_json"),
    payloadHash: row.payloadHash,
    status: row.status,
    attemptCount: row.attemptCount,
    availableAt: row.availableAt,
    claimToken: row.claimToken ?? null,
    claimDeadlineAt: row.claimDeadlineAt ?? null,
    bindingId: row.bindingId ?? null,
    messageId: row.messageId ?? null,
    runId: row.runId ?? null,
    lastErrorCode: row.lastErrorCode ?? null,
    lastErrorSummary: row.lastErrorSummary ?? null,
    receivedAt: row.receivedAt,
    updatedAt: row.updatedAt,
  };
}

function delivery(row: any): LedgerConnectorDeliveryRow {
  return {
    deliveryId: row.deliveryId,
    connectorId: row.connectorId,
    accountId: row.accountId,
    conversationId: row.conversationId,
    runId: row.runId ?? null,
    sourceMessageId: row.sourceMessageId ?? null,
    targetKey: row.targetKey,
    threadKey: row.threadKey,
    payloadVersion: row.payloadVersion,
    payload: parseJson(row.payloadJson, "connector_deliveries.payload_json"),
    payloadHash: row.payloadHash,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    attemptCount: row.attemptCount,
    availableAt: row.availableAt,
    claimToken: row.claimToken ?? null,
    claimDeadlineAt: row.claimDeadlineAt ?? null,
    lastErrorCode: row.lastErrorCode ?? null,
    lastErrorSummary: row.lastErrorSummary ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function receipt(row: any): LedgerConnectorDeliveryReceiptRow {
  return {
    receiptId: row.receiptId,
    deliveryId: row.deliveryId,
    attemptId: row.attemptId,
    providerMessageId: row.providerMessageId,
    providerConversationId: row.providerConversationId ?? null,
    providerThreadId: row.providerThreadId ?? null,
    receipt: parseJson(row.receiptJson, "connector_delivery_receipts.receipt_json"),
    receiptHash: row.receiptHash,
    acceptedAt: row.acceptedAt,
  };
}

export class StateConnectorRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public upsertAccount(row: LedgerConnectorAccountRow): LedgerConnectorAccountRow {
    this.db.prepare(`
      INSERT INTO connector_accounts
        (connector_id, account_id, workspace_id, extension_id, status, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(connector_id, account_id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        extension_id = excluded.extension_id,
        status = excluded.status,
        revision = connector_accounts.revision + 1,
        updated_at = excluded.updated_at
    `).run(row.connectorId, row.accountId, row.workspaceId, row.extensionId, row.status, row.revision, row.createdAt, row.updatedAt);
    return this.getAccount(row.connectorId, row.accountId)!;
  }

  public getAccount(connectorId: string, accountId: string): LedgerConnectorAccountRow | null {
    return (this.db.prepare(`${ACCOUNT_SELECT} WHERE connector_id = ? AND account_id = ?`).get(connectorId, accountId) as LedgerConnectorAccountRow | undefined) ?? null;
  }

  public listAccounts(connectorId?: string): LedgerConnectorAccountRow[] {
    const rows = connectorId
      ? this.db.prepare(`${ACCOUNT_SELECT} WHERE connector_id = ? ORDER BY account_id`).all(connectorId)
      : this.db.prepare(`${ACCOUNT_SELECT} ORDER BY connector_id, account_id`).all();
    return rows as unknown as LedgerConnectorAccountRow[];
  }

  public insertBinding(row: LedgerConnectorBindingRow): void {
    this.db.prepare(`
      INSERT INTO connector_conversation_bindings
        (binding_id, connector_id, account_id, workspace_id, external_scope_id,
         external_conversation_id, external_thread_id, conversation_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.bindingId, row.connectorId, row.accountId, row.workspaceId, row.externalScopeId,
      row.externalConversationId, row.externalThreadId, row.conversationId, row.createdAt, row.updatedAt);
  }

  public getBindingByRoute(input: {
    readonly connectorId: string;
    readonly accountId: string;
    readonly externalScopeId: string;
    readonly externalConversationId: string;
    readonly externalThreadId: string;
  }): LedgerConnectorBindingRow | null {
    return (this.db.prepare(`${BINDING_SELECT}
      WHERE connector_id = ? AND account_id = ? AND external_scope_id = ?
        AND external_conversation_id = ? AND external_thread_id = ?
    `).get(input.connectorId, input.accountId, input.externalScopeId, input.externalConversationId, input.externalThreadId) as LedgerConnectorBindingRow | undefined) ?? null;
  }

  public getBinding(bindingId: string): LedgerConnectorBindingRow | null {
    return (this.db.prepare(`${BINDING_SELECT} WHERE binding_id = ?`).get(bindingId) as LedgerConnectorBindingRow | undefined) ?? null;
  }

  public insertIngress(row: LedgerConnectorIngressRow): void {
    this.db.prepare(`
      INSERT INTO connector_ingress_events
        (ingress_id, connector_id, account_id, external_event_id, lane_key, payload_version,
         payload_json, payload_hash, status, attempt_count, available_at, claim_token,
         claim_deadline_at, binding_id, message_id, run_id, last_error_code,
         last_error_summary, received_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.ingressId, row.connectorId, row.accountId, row.externalEventId, row.laneKey,
      row.payloadVersion, stringifyJson(row.payload, "ingress payload"), row.payloadHash, row.status,
      row.attemptCount, row.availableAt, row.claimToken, row.claimDeadlineAt, row.bindingId,
      row.messageId, row.runId, row.lastErrorCode, row.lastErrorSummary, row.receivedAt, row.updatedAt);
  }

  public getIngressByExternalEvent(connectorId: string, accountId: string, externalEventId: string): LedgerConnectorIngressRow | null {
    const row = this.db.prepare(`${INGRESS_SELECT} WHERE connector_id = ? AND account_id = ? AND external_event_id = ?`)
      .get(connectorId, accountId, externalEventId);
    return row ? ingress(row) : null;
  }

  public getIngress(ingressId: string): LedgerConnectorIngressRow | null {
    const row = this.db.prepare(`${INGRESS_SELECT} WHERE ingress_id = ?`).get(ingressId);
    return row ? ingress(row) : null;
  }

  public getIngressByRunId(runId: string): LedgerConnectorIngressRow | null {
    const row = this.db.prepare(`${INGRESS_SELECT} WHERE run_id = ? ORDER BY received_at DESC, ingress_id DESC LIMIT 1`).get(runId);
    return row ? ingress(row) : null;
  }

  public listIngress(input: { readonly connectorId?: string; readonly accountId?: string; readonly status?: LedgerConnectorIngressStatus; readonly limit: number }): LedgerConnectorIngressRow[] {
    const clauses: string[] = [];
    const args: SQLInputValue[] = [];
    if (input.connectorId) { clauses.push("connector_id = ?"); args.push(input.connectorId); }
    if (input.accountId) { clauses.push("account_id = ?"); args.push(input.accountId); }
    if (input.status) { clauses.push("status = ?"); args.push(input.status); }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return (this.db.prepare(`${INGRESS_SELECT}${where} ORDER BY received_at DESC, ingress_id DESC LIMIT ?`).all(...args, input.limit) as any[]).map(ingress);
  }

  public claimIngress(input: {
    readonly connectorId: string;
    readonly accountId: string;
    readonly laneKey?: string;
    readonly now: number;
    readonly claimToken: string;
    readonly claimDeadlineAt: number;
  }): LedgerConnectorIngressRow | null {
    const lane = input.laneKey ? " AND lane_key = ?" : "";
    const args: SQLInputValue[] = [input.connectorId, input.accountId, input.now];
    if (input.laneKey) args.push(input.laneKey);
    const candidate = this.db.prepare(`
      SELECT ingress_id ingressId
      FROM connector_ingress_events
      WHERE connector_id = ? AND account_id = ? AND status = 'RECEIVED' AND available_at <= ?${lane}
      ORDER BY received_at, ingress_id
      LIMIT 1
    `).get(...args) as { ingressId: string } | undefined;
    if (!candidate) return null;
    const updated = this.db.prepare(`
      UPDATE connector_ingress_events
      SET status = 'CLAIMED', attempt_count = attempt_count + 1,
          claim_token = ?, claim_deadline_at = ?, updated_at = ?,
          last_error_code = NULL, last_error_summary = NULL
      WHERE ingress_id = ? AND status = 'RECEIVED'
    `).run(input.claimToken, input.claimDeadlineAt, input.now, candidate.ingressId);
    if (updated.changes !== 1) return null;
    return this.getIngress(candidate.ingressId);
  }

  public updateIngressClaim(input: {
    readonly ingressId: string;
    readonly claimToken: string;
    readonly status: Exclude<LedgerConnectorIngressStatus, "CLAIMED">;
    readonly availableAt: number;
    readonly bindingId?: string | null;
    readonly messageId?: string | null;
    readonly runId?: string | null;
    readonly errorCode?: string | null;
    readonly errorSummary?: string | null;
    readonly now: number;
  }): boolean {
    const result = this.db.prepare(`
      UPDATE connector_ingress_events
      SET status = ?, available_at = ?, claim_token = NULL, claim_deadline_at = NULL,
          binding_id = COALESCE(?, binding_id), message_id = COALESCE(?, message_id),
          run_id = COALESCE(?, run_id), last_error_code = ?, last_error_summary = ?, updated_at = ?
      WHERE ingress_id = ? AND status = 'CLAIMED' AND claim_token = ?
    `).run(input.status, input.availableAt, input.bindingId ?? null, input.messageId ?? null,
      input.runId ?? null, input.errorCode ?? null, input.errorSummary ?? null,
      input.now, input.ingressId, input.claimToken);
    return result.changes === 1;
  }

  public listExpiredIngressClaims(now: number, limit: number): LedgerConnectorIngressRow[] {
    return (this.db.prepare(`${INGRESS_SELECT}
      WHERE status = 'CLAIMED' AND claim_deadline_at <= ?
      ORDER BY claim_deadline_at, ingress_id LIMIT ?
    `).all(now, limit) as any[]).map(ingress);
  }

  public insertDelivery(row: LedgerConnectorDeliveryRow): void {
    this.db.prepare(`
      INSERT INTO connector_deliveries
        (delivery_id, connector_id, account_id, conversation_id, run_id, source_message_id,
         target_key, thread_key, payload_version, payload_json, payload_hash, idempotency_key,
         status, attempt_count, available_at, claim_token, claim_deadline_at,
         last_error_code, last_error_summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.deliveryId, row.connectorId, row.accountId, row.conversationId, row.runId,
      row.sourceMessageId, row.targetKey, row.threadKey, row.payloadVersion,
      stringifyJson(row.payload, "delivery payload"), row.payloadHash, row.idempotencyKey,
      row.status, row.attemptCount, row.availableAt, row.claimToken, row.claimDeadlineAt,
      row.lastErrorCode, row.lastErrorSummary, row.createdAt, row.updatedAt);
  }

  public getDeliveryByIdempotency(connectorId: string, accountId: string, idempotencyKey: string): LedgerConnectorDeliveryRow | null {
    const row = this.db.prepare(`${DELIVERY_SELECT} WHERE connector_id = ? AND account_id = ? AND idempotency_key = ?`)
      .get(connectorId, accountId, idempotencyKey);
    return row ? delivery(row) : null;
  }

  public getDelivery(deliveryId: string): LedgerConnectorDeliveryRow | null {
    const row = this.db.prepare(`${DELIVERY_SELECT} WHERE delivery_id = ?`).get(deliveryId);
    return row ? delivery(row) : null;
  }

  public listDeliveries(input: { readonly connectorId?: string; readonly accountId?: string; readonly status?: LedgerConnectorDeliveryStatus; readonly limit: number }): LedgerConnectorDeliveryRow[] {
    const clauses: string[] = [];
    const args: SQLInputValue[] = [];
    if (input.connectorId) { clauses.push("connector_id = ?"); args.push(input.connectorId); }
    if (input.accountId) { clauses.push("account_id = ?"); args.push(input.accountId); }
    if (input.status) { clauses.push("status = ?"); args.push(input.status); }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return (this.db.prepare(`${DELIVERY_SELECT}${where} ORDER BY created_at DESC, delivery_id DESC LIMIT ?`).all(...args, input.limit) as any[]).map(delivery);
  }

  public claimDelivery(input: {
    readonly connectorId: string;
    readonly accountId: string;
    readonly now: number;
    readonly claimToken: string;
    readonly claimDeadlineAt: number;
    readonly attemptId: string;
  }): { readonly delivery: LedgerConnectorDeliveryRow; readonly attempt: LedgerConnectorDeliveryAttemptRow } | null {
    const candidate = this.db.prepare(`
      SELECT delivery_id deliveryId, payload_hash payloadHash, attempt_count attemptCount
      FROM connector_deliveries
      WHERE connector_id = ? AND account_id = ? AND status = 'PENDING' AND available_at <= ?
      ORDER BY created_at, delivery_id LIMIT 1
    `).get(input.connectorId, input.accountId, input.now) as { deliveryId: string; payloadHash: string; attemptCount: number } | undefined;
    if (!candidate) return null;
    const attemptNumber = candidate.attemptCount + 1;
    const updated = this.db.prepare(`
      UPDATE connector_deliveries
      SET status = 'DELIVERING', attempt_count = ?, claim_token = ?, claim_deadline_at = ?,
          updated_at = ?, last_error_code = NULL, last_error_summary = NULL
      WHERE delivery_id = ? AND status = 'PENDING'
    `).run(attemptNumber, input.claimToken, input.claimDeadlineAt, input.now, candidate.deliveryId);
    if (updated.changes !== 1) return null;
    this.db.prepare(`
      INSERT INTO connector_delivery_attempts
        (attempt_id, delivery_id, attempt_number, claim_token, request_hash, status,
         error_code, error_summary, started_at, dispatched_at, ended_at)
      VALUES (?, ?, ?, ?, ?, 'CLAIMED', NULL, NULL, ?, NULL, NULL)
    `).run(input.attemptId, candidate.deliveryId, attemptNumber, input.claimToken, candidate.payloadHash, input.now);
    return { delivery: this.getDelivery(candidate.deliveryId)!, attempt: this.getDeliveryAttempt(input.attemptId)! };
  }

  public getDeliveryAttempt(attemptId: string): LedgerConnectorDeliveryAttemptRow | null {
    return (this.db.prepare(`${ATTEMPT_SELECT} WHERE attempt_id = ?`).get(attemptId) as LedgerConnectorDeliveryAttemptRow | undefined) ?? null;
  }

  public getDeliveryAttemptByClaim(claimToken: string): LedgerConnectorDeliveryAttemptRow | null {
    return (this.db.prepare(`${ATTEMPT_SELECT} WHERE claim_token = ?`).get(claimToken) as LedgerConnectorDeliveryAttemptRow | undefined) ?? null;
  }

  public markDeliveryDispatched(input: { readonly deliveryId: string; readonly claimToken: string; readonly now: number }): LedgerConnectorDeliveryAttemptRow | null {
    const result = this.db.prepare(`
      UPDATE connector_delivery_attempts
      SET status = 'DISPATCHED', dispatched_at = ?
      WHERE delivery_id = ? AND claim_token = ? AND status = 'CLAIMED'
    `).run(input.now, input.deliveryId, input.claimToken);
    if (result.changes !== 1) return null;
    return this.getDeliveryAttemptByClaim(input.claimToken);
  }

  public finishDeliveryAttempt(input: {
    readonly deliveryId: string;
    readonly claimToken: string;
    readonly attemptStatus: Exclude<LedgerConnectorDeliveryAttemptStatus, "CLAIMED" | "DISPATCHED">;
    readonly deliveryStatus: Exclude<LedgerConnectorDeliveryStatus, "DELIVERING">;
    readonly availableAt: number;
    readonly errorCode?: string | null;
    readonly errorSummary?: string | null;
    readonly now: number;
  }): boolean {
    const attempt = this.getDeliveryAttemptByClaim(input.claimToken);
    if (!attempt || attempt.deliveryId !== input.deliveryId || (attempt.status !== "CLAIMED" && attempt.status !== "DISPATCHED")) return false;
    const attemptUpdate = this.db.prepare(`
      UPDATE connector_delivery_attempts
      SET status = ?, error_code = ?, error_summary = ?, ended_at = ?
      WHERE attempt_id = ? AND status IN ('CLAIMED', 'DISPATCHED')
    `).run(input.attemptStatus, input.errorCode ?? null, input.errorSummary ?? null, input.now, attempt.attemptId);
    if (attemptUpdate.changes !== 1) return false;
    const deliveryUpdate = this.db.prepare(`
      UPDATE connector_deliveries
      SET status = ?, available_at = ?, claim_token = NULL, claim_deadline_at = NULL,
          last_error_code = ?, last_error_summary = ?, updated_at = ?
      WHERE delivery_id = ? AND status = 'DELIVERING' AND claim_token = ?
    `).run(input.deliveryStatus, input.availableAt, input.errorCode ?? null,
      input.errorSummary ?? null, input.now, input.deliveryId, input.claimToken);
    if (deliveryUpdate.changes !== 1) {
      throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "connector delivery claim disappeared while finishing attempt");
    }
    return true;
  }

  public insertReceipt(row: LedgerConnectorDeliveryReceiptRow): void {
    this.db.prepare(`
      INSERT INTO connector_delivery_receipts
        (receipt_id, delivery_id, attempt_id, provider_message_id, provider_conversation_id,
         provider_thread_id, receipt_json, receipt_hash, accepted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.receiptId, row.deliveryId, row.attemptId, row.providerMessageId,
      row.providerConversationId, row.providerThreadId, stringifyJson(row.receipt, "connector receipt"),
      row.receiptHash, row.acceptedAt);
  }

  public getReceiptByAttempt(attemptId: string): LedgerConnectorDeliveryReceiptRow | null {
    const row = this.db.prepare(`${RECEIPT_SELECT} WHERE attempt_id = ?`).get(attemptId);
    return row ? receipt(row) : null;
  }

  public getReceiptByDelivery(deliveryId: string): LedgerConnectorDeliveryReceiptRow | null {
    const row = this.db.prepare(`${RECEIPT_SELECT} WHERE delivery_id = ? ORDER BY accepted_at DESC, receipt_id DESC LIMIT 1`).get(deliveryId);
    return row ? receipt(row) : null;
  }

  public insertDeadLetter(row: LedgerConnectorDeadLetterRow): void {
    this.db.prepare(`
      INSERT INTO connector_dead_letters
        (dead_letter_id, connector_id, account_id, kind, subject_id, reason_code,
         summary, payload_hash, status, created_at, resolved_at, resolution)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kind, subject_id) DO UPDATE SET
        reason_code = excluded.reason_code,
        summary = excluded.summary,
        payload_hash = excluded.payload_hash,
        status = 'OPEN',
        resolved_at = NULL,
        resolution = NULL
    `).run(row.deadLetterId, row.connectorId, row.accountId, row.kind, row.subjectId,
      row.reasonCode, row.summary, row.payloadHash, row.status, row.createdAt,
      row.resolvedAt, row.resolution);
  }

  public listDeadLetters(input: { readonly connectorId?: string; readonly accountId?: string; readonly status?: LedgerConnectorDeadLetterStatus; readonly limit: number }): LedgerConnectorDeadLetterRow[] {
    const clauses: string[] = [];
    const args: SQLInputValue[] = [];
    if (input.connectorId) { clauses.push("connector_id = ?"); args.push(input.connectorId); }
    if (input.accountId) { clauses.push("account_id = ?"); args.push(input.accountId); }
    if (input.status) { clauses.push("status = ?"); args.push(input.status); }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`${DEAD_LETTER_SELECT}${where} ORDER BY created_at DESC, dead_letter_id DESC LIMIT ?`)
      .all(...args, input.limit) as unknown as LedgerConnectorDeadLetterRow[];
  }

  public listExpiredDeliveryClaims(now: number, limit: number): Array<{ delivery: LedgerConnectorDeliveryRow; attempt: LedgerConnectorDeliveryAttemptRow }> {
    const rows = this.db.prepare(`
      SELECT d.delivery_id deliveryId, a.attempt_id attemptId
      FROM connector_deliveries d
      JOIN connector_delivery_attempts a ON a.delivery_id = d.delivery_id AND a.claim_token = d.claim_token
      WHERE d.status = 'DELIVERING' AND d.claim_deadline_at <= ? AND a.status IN ('CLAIMED', 'DISPATCHED')
      ORDER BY d.claim_deadline_at, d.delivery_id LIMIT ?
    `).all(now, limit) as Array<{ deliveryId: string; attemptId: string }>;
    return rows.map((row) => ({ delivery: this.getDelivery(row.deliveryId)!, attempt: this.getDeliveryAttempt(row.attemptId)! }));
  }
}
