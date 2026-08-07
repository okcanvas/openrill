import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type LedgerRetentionEntityKind = "TASK" | "TASK_FLOW" | "CONNECTOR_DELIVERY";
export type LedgerRetentionProtectionCode =
  | "NOT_FOUND"
  | "NOT_TERMINAL"
  | "RETENTION_NOT_DUE"
  | "RUN_ACTIVE"
  | "ACTIVE_CHILD_TASK"
  | "ACTIVE_FLOW"
  | "ACTIONABLE_TASK_DELIVERY"
  | "ACTIVE_GOAL_STEP"
  | "OPEN_BLOCKER"
  | "GOAL_EXECUTION_REFERENCE"
  | "OPEN_DEAD_LETTER"
  | "DELIVERY_RECEIPT_MISSING";

export interface LedgerRetentionCandidateRow {
  readonly entityKind: LedgerRetentionEntityKind;
  readonly entityId: string;
  readonly workspaceId: string;
  readonly terminalStatus: string;
  readonly sourceRef: string | null;
  readonly terminalAt: number;
  readonly cleanupAfter: number;
}

export interface LedgerRetentionCursorRow {
  readonly cleanupAfter: number;
  readonly entityKind: LedgerRetentionEntityKind;
  readonly entityId: string;
}

export interface LedgerRetentionInspection {
  readonly candidate: LedgerRetentionCandidateRow | null;
  readonly protectedBy: readonly LedgerRetentionProtectionCode[];
}

export interface LedgerRetentionTombstoneRow extends LedgerRetentionCandidateRow {
  readonly prunedAt: number;
  readonly metadataHash: string;
}

export interface LedgerMaintenanceLeaseRow {
  readonly scopeKey: string;
  readonly ownerId: string;
  readonly leaseToken: string;
  readonly leaseExpiresAt: number;
  readonly updatedAt: number;
  readonly revision: number;
}

export interface LedgerMaintenanceSweepStateRow {
  readonly scopeKey: string;
  readonly cursor: LedgerRetentionCursorRow | null;
  readonly updatedAt: number;
  readonly revision: number;
}

const TASK_TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "LOST"]);
const FLOW_TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "LOST"]);
const RUN_TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const CONNECTOR_SAFE_TERMINAL = new Set(["DELIVERED", "SUPPRESSED"]);

function leaseRow(value: any): LedgerMaintenanceLeaseRow {
  return {
    scopeKey: value.scopeKey,
    ownerId: value.ownerId,
    leaseToken: value.leaseToken,
    leaseExpiresAt: value.leaseExpiresAt,
    updatedAt: value.updatedAt,
    revision: value.revision,
  };
}

function sweepStateRow(value: any): LedgerMaintenanceSweepStateRow {
  const hasCursor = value.cursorCleanupAfter !== null && value.cursorCleanupAfter !== undefined;
  return {
    scopeKey: value.scopeKey,
    cursor: hasCursor ? {
      cleanupAfter: value.cursorCleanupAfter,
      entityKind: value.cursorEntityKind,
      entityId: value.cursorEntityId,
    } : null,
    updatedAt: value.updatedAt,
    revision: value.revision,
  };
}

function candidateRow(value: any): LedgerRetentionCandidateRow {
  return {
    entityKind: value.entityKind,
    entityId: value.entityId,
    workspaceId: value.workspaceId,
    terminalStatus: value.terminalStatus,
    sourceRef: value.sourceRef ?? null,
    terminalAt: value.terminalAt,
    cleanupAfter: value.cleanupAfter,
  };
}

function tombstoneHash(candidate: LedgerRetentionCandidateRow, prunedAt: number): string {
  return createHash("sha256").update(JSON.stringify({
    entityKind: candidate.entityKind,
    entityId: candidate.entityId,
    workspaceId: candidate.workspaceId,
    terminalStatus: candidate.terminalStatus,
    sourceRef: candidate.sourceRef,
    terminalAt: candidate.terminalAt,
    cleanupAfter: candidate.cleanupAfter,
    prunedAt,
  }), "utf8").digest("hex");
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

export class StateRetentionRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public claimLease(input: { scopeKey: string; ownerId: string; leaseToken: string; now: number; leaseExpiresAt: number }): LedgerMaintenanceLeaseRow | null {
    this.db.prepare(`
      INSERT INTO maintenance_leases
        (scope_key, owner_id, lease_token, lease_expires_at, updated_at, revision)
      VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(scope_key) DO UPDATE SET
        owner_id = excluded.owner_id,
        lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at,
        updated_at = excluded.updated_at,
        revision = maintenance_leases.revision + 1
      WHERE maintenance_leases.lease_expires_at <= excluded.updated_at
    `).run(input.scopeKey, input.ownerId, input.leaseToken, input.leaseExpiresAt, input.now);
    const row = this.db.prepare(`
      SELECT scope_key scopeKey, owner_id ownerId, lease_token leaseToken,
             lease_expires_at leaseExpiresAt, updated_at updatedAt, revision
      FROM maintenance_leases WHERE scope_key = ?
    `).get(input.scopeKey) as any;
    if (!row || row.leaseToken !== input.leaseToken || row.ownerId !== input.ownerId) return null;
    return leaseRow(row);
  }

  public renewLease(input: { scopeKey: string; ownerId: string; leaseToken: string; now: number; leaseExpiresAt: number }): LedgerMaintenanceLeaseRow | null {
    const row = this.db.prepare(`
      UPDATE maintenance_leases
      SET lease_expires_at = ?, updated_at = ?, revision = revision + 1
      WHERE scope_key = ? AND owner_id = ? AND lease_token = ? AND lease_expires_at > ?
      RETURNING scope_key scopeKey, owner_id ownerId, lease_token leaseToken,
                lease_expires_at leaseExpiresAt, updated_at updatedAt, revision
    `).get(input.leaseExpiresAt, input.now, input.scopeKey, input.ownerId, input.leaseToken, input.now);
    return row ? leaseRow(row) : null;
  }

  public releaseLease(input: { scopeKey: string; ownerId: string; leaseToken: string }): boolean {
    return this.db.prepare(`DELETE FROM maintenance_leases WHERE scope_key = ? AND owner_id = ? AND lease_token = ?`)
      .run(input.scopeKey, input.ownerId, input.leaseToken).changes === 1;
  }

  public ownsLease(input: { scopeKey: string; ownerId: string; leaseToken: string; now: number }): boolean {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM maintenance_leases
      WHERE scope_key = ? AND owner_id = ? AND lease_token = ? AND lease_expires_at > ?
      LIMIT 1
    `).get(input.scopeKey, input.ownerId, input.leaseToken, input.now));
  }

  public getSweepState(scopeKey: string): LedgerMaintenanceSweepStateRow | null {
    const row = this.db.prepare(`
      SELECT scope_key scopeKey, cursor_cleanup_after cursorCleanupAfter,
             cursor_entity_kind cursorEntityKind, cursor_entity_id cursorEntityId,
             updated_at updatedAt, revision
      FROM maintenance_sweep_state
      WHERE scope_key = ?
    `).get(scopeKey) as any;
    return row ? sweepStateRow(row) : null;
  }

  public advanceSweepState(input: {
    scopeKey: string;
    expectedRevision: number | null;
    cursor: LedgerRetentionCursorRow | null;
    now: number;
  }): boolean {
    if (input.expectedRevision === null) {
      const result = this.db.prepare(`
        INSERT INTO maintenance_sweep_state
          (scope_key, cursor_cleanup_after, cursor_entity_kind, cursor_entity_id, updated_at, revision)
        VALUES (?, ?, ?, ?, ?, 1)
        ON CONFLICT(scope_key) DO NOTHING
      `).run(
        input.scopeKey, input.cursor?.cleanupAfter ?? null, input.cursor?.entityKind ?? null,
        input.cursor?.entityId ?? null, input.now,
      );
      return Number(result.changes) === 1;
    }
    const result = this.db.prepare(`
      UPDATE maintenance_sweep_state
      SET cursor_cleanup_after = ?, cursor_entity_kind = ?, cursor_entity_id = ?,
          updated_at = ?, revision = revision + 1
      WHERE scope_key = ? AND revision = ?
    `).run(
      input.cursor?.cleanupAfter ?? null, input.cursor?.entityKind ?? null, input.cursor?.entityId ?? null,
      input.now, input.scopeKey, input.expectedRevision,
    );
    return Number(result.changes) === 1;
  }

  public scheduleConnectorDeliveryRetention(input: { workspaceId: string; now: number; retentionMs: number; limit: number }): number {
    const rows = this.db.prepare(`
      SELECT d.delivery_id deliveryId, d.updated_at updatedAt
      FROM connector_deliveries d
      JOIN connector_accounts a ON a.connector_id = d.connector_id AND a.account_id = d.account_id
      WHERE a.workspace_id = ?
        AND d.cleanup_after IS NULL
        AND d.status IN ('DELIVERED','SUPPRESSED')
      ORDER BY d.updated_at, d.delivery_id
      LIMIT ?
    `).all(input.workspaceId, input.limit) as Array<{ deliveryId: string; updatedAt: number }>;
    let scheduled = 0;
    const statement = this.db.prepare(`
      UPDATE connector_deliveries
      SET cleanup_after = ?
      WHERE delivery_id = ? AND cleanup_after IS NULL AND status IN ('DELIVERED','SUPPRESSED')
    `);
    for (const row of rows) {
      scheduled += Number(statement.run(row.updatedAt + input.retentionMs, row.deliveryId).changes);
    }
    return scheduled;
  }

  public listCandidates(input: { workspaceId: string; now: number; limit: number; after?: LedgerRetentionCursorRow | null }): LedgerRetentionCandidateRow[] {
    const after = input.after ?? null;
    const rows = this.db.prepare(`
      WITH candidates AS (
        SELECT 'TASK' entityKind, task_id entityId, workspace_id workspaceId,
               status terminalStatus, run_id sourceRef, ended_at terminalAt, cleanup_after cleanupAfter
        FROM background_tasks
        WHERE workspace_id = ? AND cleanup_after IS NOT NULL AND cleanup_after <= ?
        UNION ALL
        SELECT 'TASK_FLOW' entityKind, flow_id entityId, workspace_id workspaceId,
               status terminalStatus, owner_key sourceRef, ended_at terminalAt, cleanup_after cleanupAfter
        FROM task_flows
        WHERE workspace_id = ? AND cleanup_after IS NOT NULL AND cleanup_after <= ?
        UNION ALL
        SELECT 'CONNECTOR_DELIVERY' entityKind, d.delivery_id entityId, a.workspace_id workspaceId,
               d.status terminalStatus, COALESCE(d.run_id, d.conversation_id) sourceRef,
               d.updated_at terminalAt, d.cleanup_after cleanupAfter
        FROM connector_deliveries d
        JOIN connector_accounts a ON a.connector_id = d.connector_id AND a.account_id = d.account_id
        WHERE a.workspace_id = ? AND d.cleanup_after IS NOT NULL AND d.cleanup_after <= ?
      )
      SELECT entityKind, entityId, workspaceId, terminalStatus, sourceRef, terminalAt, cleanupAfter
      FROM candidates
      WHERE (? IS NULL)
         OR cleanupAfter > ?
         OR (cleanupAfter = ? AND entityKind > ?)
         OR (cleanupAfter = ? AND entityKind = ? AND entityId > ?)
      ORDER BY cleanupAfter, entityKind, entityId
      LIMIT ?
    `).all(
      input.workspaceId, input.now,
      input.workspaceId, input.now,
      input.workspaceId, input.now,
      after ? 1 : null,
      after?.cleanupAfter ?? -1,
      after?.cleanupAfter ?? -1, after?.entityKind ?? "",
      after?.cleanupAfter ?? -1, after?.entityKind ?? "", after?.entityId ?? "",
      input.limit,
    ) as any[];
    return rows.filter((row) => Number.isSafeInteger(row.terminalAt)).map(candidateRow);
  }

  public inspect(candidate: LedgerRetentionCandidateRow, now: number): LedgerRetentionInspection {
    if (candidate.entityKind === "TASK") return this.#inspectTask(candidate, now);
    if (candidate.entityKind === "TASK_FLOW") return this.#inspectFlow(candidate, now);
    return this.#inspectConnectorDelivery(candidate, now);
  }

  #inspectTask(candidate: LedgerRetentionCandidateRow, now: number): LedgerRetentionInspection {
    const row = this.db.prepare(`
      SELECT t.task_id taskId, t.workspace_id workspaceId, t.run_id runId, t.status,
             t.ended_at endedAt, t.cleanup_after cleanupAfter, r.status runStatus
      FROM background_tasks t
      LEFT JOIN agent_runs r ON r.run_id = t.run_id
      WHERE t.task_id = ?
    `).get(candidate.entityId) as any;
    if (!row) return { candidate: null, protectedBy: ["NOT_FOUND"] };
    const current = candidateRow({ entityKind: "TASK", entityId: row.taskId, workspaceId: row.workspaceId,
      terminalStatus: row.status, sourceRef: row.runId, terminalAt: row.endedAt ?? 0, cleanupAfter: row.cleanupAfter ?? Number.MAX_SAFE_INTEGER });
    const protectedBy: LedgerRetentionProtectionCode[] = [];
    if (!TASK_TERMINAL.has(row.status) || row.endedAt === null) protectedBy.push("NOT_TERMINAL");
    if (row.cleanupAfter === null || row.cleanupAfter > now) protectedBy.push("RETENTION_NOT_DUE");
    if (!RUN_TERMINAL.has(row.runStatus)) protectedBy.push("RUN_ACTIVE");
    if (this.db.prepare(`SELECT 1 FROM background_tasks WHERE parent_task_id = ? AND status IN ('QUEUED','RUNNING') LIMIT 1`).get(row.taskId)) protectedBy.push("ACTIVE_CHILD_TASK");
    if (this.db.prepare(`SELECT 1 FROM task_flow_tasks l JOIN task_flows f ON f.flow_id = l.flow_id WHERE l.task_id = ? AND f.status IN ('QUEUED','RUNNING','WAITING','BLOCKED') LIMIT 1`).get(row.taskId)) protectedBy.push("ACTIVE_FLOW");
    if (this.db.prepare(`SELECT 1 FROM task_completion_deliveries WHERE task_id = ? AND delivery_status IN ('PENDING','SESSION_QUEUED','FAILED') LIMIT 1`).get(row.taskId)) protectedBy.push("ACTIONABLE_TASK_DELIVERY");
    if (this.db.prepare(`SELECT 1 FROM agent_goal_step_executions WHERE current_task_id = ? AND status IN ('PENDING','READY','RUNNING','WAITING','BLOCKED') LIMIT 1`).get(row.taskId)) protectedBy.push("ACTIVE_GOAL_STEP");
    if (this.db.prepare(`SELECT 1 FROM agent_goal_step_blockers WHERE task_id = ? AND status = 'OPEN' LIMIT 1`).get(row.taskId)) protectedBy.push("OPEN_BLOCKER");
    return { candidate: current, protectedBy: uniqueSorted(protectedBy) };
  }

  #inspectFlow(candidate: LedgerRetentionCandidateRow, now: number): LedgerRetentionInspection {
    const row = this.db.prepare(`
      SELECT flow_id flowId, workspace_id workspaceId, owner_key ownerKey, status,
             ended_at endedAt, cleanup_after cleanupAfter
      FROM task_flows WHERE flow_id = ?
    `).get(candidate.entityId) as any;
    if (!row) return { candidate: null, protectedBy: ["NOT_FOUND"] };
    const current = candidateRow({ entityKind: "TASK_FLOW", entityId: row.flowId, workspaceId: row.workspaceId,
      terminalStatus: row.status, sourceRef: row.ownerKey, terminalAt: row.endedAt ?? 0, cleanupAfter: row.cleanupAfter ?? Number.MAX_SAFE_INTEGER });
    const protectedBy: LedgerRetentionProtectionCode[] = [];
    if (!FLOW_TERMINAL.has(row.status) || row.endedAt === null) protectedBy.push("NOT_TERMINAL");
    if (row.cleanupAfter === null || row.cleanupAfter > now) protectedBy.push("RETENTION_NOT_DUE");
    if (this.db.prepare(`SELECT 1 FROM task_flow_tasks l JOIN background_tasks t ON t.task_id = l.task_id WHERE l.flow_id = ? AND t.status IN ('QUEUED','RUNNING') LIMIT 1`).get(row.flowId)) protectedBy.push("ACTIVE_CHILD_TASK");
    if (this.db.prepare(`SELECT 1 FROM task_completion_deliveries WHERE flow_id = ? AND delivery_status IN ('PENDING','SESSION_QUEUED','FAILED') LIMIT 1`).get(row.flowId)) protectedBy.push("ACTIONABLE_TASK_DELIVERY");
    if (this.db.prepare(`SELECT 1 FROM agent_goal_executions WHERE flow_id = ? LIMIT 1`).get(row.flowId)) protectedBy.push("GOAL_EXECUTION_REFERENCE");
    return { candidate: current, protectedBy: uniqueSorted(protectedBy) };
  }

  #inspectConnectorDelivery(candidate: LedgerRetentionCandidateRow, now: number): LedgerRetentionInspection {
    const row = this.db.prepare(`
      SELECT d.delivery_id deliveryId, a.workspace_id workspaceId, d.status,
             COALESCE(d.run_id, d.conversation_id) sourceRef, d.updated_at terminalAt,
             d.cleanup_after cleanupAfter
      FROM connector_deliveries d
      JOIN connector_accounts a ON a.connector_id = d.connector_id AND a.account_id = d.account_id
      WHERE d.delivery_id = ?
    `).get(candidate.entityId) as any;
    if (!row) return { candidate: null, protectedBy: ["NOT_FOUND"] };
    const current = candidateRow({ entityKind: "CONNECTOR_DELIVERY", entityId: row.deliveryId,
      workspaceId: row.workspaceId, terminalStatus: row.status, sourceRef: row.sourceRef,
      terminalAt: row.terminalAt, cleanupAfter: row.cleanupAfter ?? Number.MAX_SAFE_INTEGER });
    const protectedBy: LedgerRetentionProtectionCode[] = [];
    if (!CONNECTOR_SAFE_TERMINAL.has(row.status)) protectedBy.push("NOT_TERMINAL");
    if (row.cleanupAfter === null || row.cleanupAfter > now) protectedBy.push("RETENTION_NOT_DUE");
    if (this.db.prepare(`SELECT 1 FROM connector_dead_letters WHERE kind = 'DELIVERY' AND subject_id = ? AND status = 'OPEN' LIMIT 1`).get(row.deliveryId)) protectedBy.push("OPEN_DEAD_LETTER");
    if (row.status === "DELIVERED" && !this.db.prepare(`SELECT 1 FROM connector_delivery_receipts WHERE delivery_id = ? LIMIT 1`).get(row.deliveryId)) protectedBy.push("DELIVERY_RECEIPT_MISSING");
    return { candidate: current, protectedBy: uniqueSorted(protectedBy) };
  }

  public prune(candidate: LedgerRetentionCandidateRow, now: number): { deleted: boolean; tombstone: LedgerRetentionTombstoneRow | null; protectedBy: readonly LedgerRetentionProtectionCode[] } {
    const inspection = this.inspect(candidate, now);
    if (!inspection.candidate) return { deleted: false, tombstone: null, protectedBy: inspection.protectedBy };
    if (inspection.protectedBy.length > 0) return { deleted: false, tombstone: null, protectedBy: inspection.protectedBy };
    const current = inspection.candidate;
    const tombstone: LedgerRetentionTombstoneRow = { ...current, prunedAt: now, metadataHash: tombstoneHash(current, now) };
    this.db.prepare(`
      INSERT INTO maintenance_retention_tombstones
        (entity_kind, entity_id, workspace_id, terminal_status, source_ref,
         terminal_at, cleanup_after, pruned_at, metadata_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tombstone.entityKind, tombstone.entityId, tombstone.workspaceId, tombstone.terminalStatus,
      tombstone.sourceRef, tombstone.terminalAt, tombstone.cleanupAfter, tombstone.prunedAt, tombstone.metadataHash);
    const table = current.entityKind === "TASK" ? "background_tasks"
      : current.entityKind === "TASK_FLOW" ? "task_flows" : "connector_deliveries";
    const idColumn = current.entityKind === "TASK" ? "task_id"
      : current.entityKind === "TASK_FLOW" ? "flow_id" : "delivery_id";
    const deleted = this.db.prepare(`DELETE FROM ${table} WHERE ${idColumn} = ?`).run(current.entityId).changes === 1;
    if (!deleted) {
      this.db.prepare(`DELETE FROM maintenance_retention_tombstones WHERE entity_kind = ? AND entity_id = ?`).run(current.entityKind, current.entityId);
      return { deleted: false, tombstone: null, protectedBy: ["NOT_FOUND"] };
    }
    return { deleted: true, tombstone, protectedBy: [] };
  }

  public listTombstones(input: { workspaceId: string; entityKind?: LedgerRetentionEntityKind; limit: number }): LedgerRetentionTombstoneRow[] {
    const rows = input.entityKind
      ? this.db.prepare(`
          SELECT entity_kind entityKind, entity_id entityId, workspace_id workspaceId,
                 terminal_status terminalStatus, source_ref sourceRef, terminal_at terminalAt,
                 cleanup_after cleanupAfter, pruned_at prunedAt, metadata_hash metadataHash
          FROM maintenance_retention_tombstones
          WHERE workspace_id = ? AND entity_kind = ?
          ORDER BY pruned_at DESC, entity_id DESC LIMIT ?
        `).all(input.workspaceId, input.entityKind, input.limit)
      : this.db.prepare(`
          SELECT entity_kind entityKind, entity_id entityId, workspace_id workspaceId,
                 terminal_status terminalStatus, source_ref sourceRef, terminal_at terminalAt,
                 cleanup_after cleanupAfter, pruned_at prunedAt, metadata_hash metadataHash
          FROM maintenance_retention_tombstones
          WHERE workspace_id = ?
          ORDER BY pruned_at DESC, entity_kind, entity_id DESC LIMIT ?
        `).all(input.workspaceId, input.limit);
    return rows as unknown as LedgerRetentionTombstoneRow[];
  }
}
