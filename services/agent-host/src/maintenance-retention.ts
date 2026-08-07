import { randomUUID } from "node:crypto";
import type {
  LedgerRetentionCandidateRow,
  LedgerRetentionCursorRow,
  LedgerRetentionEntityKind,
  LedgerRetentionProtectionCode,
  LedgerRetentionTombstoneRow,
  OpenRillStateDatabase,
} from "@openrill/state";
import { TaskError, type TaskMaintenanceService } from "@openrill/tasks";
import type { TaskFlowMaintenanceService } from "@openrill/task-flows";

const WORKSPACE_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const ENTITY_KINDS = new Set<LedgerRetentionEntityKind>(["TASK", "TASK_FLOW", "CONNECTOR_DELIVERY"]);

export type MaintenanceRetentionMode = "PREVIEW" | "APPLY";
export type MaintenanceRetentionState = "COMPLETED" | "LEASE_BUSY" | "LEASE_LOST";

export interface MaintenanceRetentionCandidateView extends LedgerRetentionCandidateRow {
  readonly eligible: boolean;
  readonly protectedBy: readonly LedgerRetentionProtectionCode[];
}

export interface MaintenanceRetentionBatchResult {
  readonly mode: MaintenanceRetentionMode;
  readonly state: MaintenanceRetentionState;
  readonly workspaceId: string;
  readonly generatedAt: number;
  readonly scanned: number;
  readonly eligible: number;
  readonly protected: number;
  readonly pruned: number;
  readonly scheduled: {
    readonly tasks: number;
    readonly taskFlows: number;
    readonly connectorDeliveries: number;
  };
  readonly prunedByKind: Readonly<Record<LedgerRetentionEntityKind, number>>;
  readonly candidates: readonly MaintenanceRetentionCandidateView[];
  readonly nextCursor: string | null;
}

export interface MaintenanceRetentionCoordinatorOptions {
  readonly state: OpenRillStateDatabase;
  readonly workspaceIds: readonly string[];
  readonly ownerId: string;
  readonly taskMaintenance: TaskMaintenanceService;
  readonly taskFlowMaintenance: TaskFlowMaintenanceService;
  readonly now?: () => number;
  readonly createLeaseToken?: () => string;
  readonly leaseDurationMs?: number;
  readonly batchSize?: number;
  readonly connectorDeliveryRetentionMs?: number;
}

function positiveInteger(value: number, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${label} must be ${min}..${max}`);
  return value;
}

function encodeCursor(workspaceId: string, row: LedgerRetentionCursorRow): string {
  return Buffer.from(JSON.stringify({ v: 1, w: workspaceId, c: row.cleanupAfter, k: row.entityKind, i: row.entityId }), "utf8").toString("base64url");
}

function decodeCursor(workspaceId: string, value: string | undefined): LedgerRetentionCursorRow | null {
  if (value === undefined) return null;
  if (value.length < 1 || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new TaskError("TASK_INVALID_ARGUMENT", "invalid maintenance retention cursor");
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { throw new TaskError("TASK_INVALID_ARGUMENT", "invalid maintenance retention cursor"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TaskError("TASK_INVALID_ARGUMENT", "invalid maintenance retention cursor");
  const row = parsed as Record<string, unknown>;
  if (row.v !== 1 || row.w !== workspaceId || !Number.isSafeInteger(row.c) || Number(row.c) < 0
    || typeof row.k !== "string" || !ENTITY_KINDS.has(row.k as LedgerRetentionEntityKind)
    || typeof row.i !== "string" || row.i.length < 1 || row.i.length > 512) {
    throw new TaskError("TASK_INVALID_ARGUMENT", "invalid maintenance retention cursor");
  }
  return { cleanupAfter: Number(row.c), entityKind: row.k as LedgerRetentionEntityKind, entityId: row.i };
}

export class MaintenanceRetentionCoordinator {
  readonly #allowed: Set<string>;
  readonly #now: () => number;
  readonly #createLeaseToken: () => string;
  readonly #leaseDurationMs: number;
  readonly #batchSize: number;
  readonly #connectorDeliveryRetentionMs: number;

  public constructor(private readonly options: MaintenanceRetentionCoordinatorOptions) {
    this.#allowed = new Set(options.workspaceIds);
    this.#now = options.now ?? Date.now;
    this.#createLeaseToken = options.createLeaseToken ?? randomUUID;
    this.#leaseDurationMs = positiveInteger(options.leaseDurationMs ?? 120_000, "leaseDurationMs", 5_000, 3_600_000);
    this.#batchSize = positiveInteger(options.batchSize ?? 100, "batchSize", 1, 1_000);
    this.#connectorDeliveryRetentionMs = positiveInteger(options.connectorDeliveryRetentionMs ?? 30 * 24 * 60 * 60_000, "connectorDeliveryRetentionMs", 60_000, 31_536_000_000);
  }

  #workspace(value: string): string {
    if (!WORKSPACE_PATTERN.test(value)) throw new TaskError("TASK_INVALID_ARGUMENT", "invalid maintenance workspaceId");
    if (!this.#allowed.has(value)) throw new TaskError("TASK_ACCESS_DENIED", `workspace access denied: ${value}`);
    return value;
  }

  #limit(value: number | undefined): number {
    return positiveInteger(value ?? this.#batchSize, "limit", 1, 1_000);
  }

  #schedule(workspaceId: string, now: number): MaintenanceRetentionBatchResult["scheduled"] {
    const tasks = this.options.taskMaintenance.scheduleRetention({ workspaceId, limit: 1_000 });
    const taskFlows = this.options.taskFlowMaintenance.scheduleRetention({ workspaceId, limit: 1_000 });
    const connectorDeliveries = this.options.state.transaction((repositories) => repositories.retention.scheduleConnectorDeliveryRetention({
      workspaceId, now, retentionMs: this.#connectorDeliveryRetentionMs, limit: 1_000,
    }));
    return { tasks, taskFlows, connectorDeliveries };
  }

  public preview(input: { workspaceId: string; limit?: number; cursor?: string }): MaintenanceRetentionBatchResult {
    const workspaceId = this.#workspace(input.workspaceId);
    const now = this.#now();
    const limit = this.#limit(input.limit);
    const after = decodeCursor(workspaceId, input.cursor);
    const candidates = this.options.state.transaction((repositories) => repositories.retention.listCandidates({ workspaceId, now, limit, after }));
    const views = this.options.state.transaction((repositories) => candidates.map((candidate) => {
      const inspection = repositories.retention.inspect(candidate, now);
      return { ...candidate, eligible: inspection.protectedBy.length === 0, protectedBy: inspection.protectedBy };
    }));
    const last = candidates.at(-1);
    return {
      mode: "PREVIEW", state: "COMPLETED", workspaceId, generatedAt: now,
      scanned: views.length, eligible: views.filter((item) => item.eligible).length,
      protected: views.filter((item) => !item.eligible).length, pruned: 0,
      scheduled: { tasks: 0, taskFlows: 0, connectorDeliveries: 0 },
      prunedByKind: { TASK: 0, TASK_FLOW: 0, CONNECTOR_DELIVERY: 0 },
      candidates: views,
      nextCursor: candidates.length === limit && last ? encodeCursor(workspaceId, last) : null,
    };
  }

  public prune(input: { workspaceId: string; limit?: number; cursor?: string }): MaintenanceRetentionBatchResult {
    const workspaceId = this.#workspace(input.workspaceId);
    const limit = this.#limit(input.limit);
    const after = decodeCursor(workspaceId, input.cursor);
    const startedAt = this.#now();
    const scopeKey = `retention:${workspaceId}`;
    const leaseToken = this.#createLeaseToken();
    const lease = this.options.state.transaction((repositories) => repositories.retention.claimLease({
      scopeKey, ownerId: this.options.ownerId, leaseToken, now: startedAt, leaseExpiresAt: startedAt + this.#leaseDurationMs,
    }));
    if (!lease) {
      return {
        mode: "APPLY", state: "LEASE_BUSY", workspaceId, generatedAt: startedAt,
        scanned: 0, eligible: 0, protected: 0, pruned: 0,
        scheduled: { tasks: 0, taskFlows: 0, connectorDeliveries: 0 },
        prunedByKind: { TASK: 0, TASK_FLOW: 0, CONNECTOR_DELIVERY: 0 },
        candidates: [], nextCursor: input.cursor ?? null,
      };
    }

    try {
      const scheduled = this.#schedule(workspaceId, startedAt);
      const candidates = this.options.state.transaction((repositories) => repositories.retention.listCandidates({ workspaceId, now: startedAt, limit, after }));
      const views: MaintenanceRetentionCandidateView[] = [];
      const prunedByKind: Record<LedgerRetentionEntityKind, number> = { TASK: 0, TASK_FLOW: 0, CONNECTOR_DELIVERY: 0 };
      let eligible = 0;
      let protectedCount = 0;
      let pruned = 0;
      let state: MaintenanceRetentionState = "COMPLETED";
      let lastProcessed: LedgerRetentionCandidateRow | null = null;
      let leaseExpiresAt = lease.leaseExpiresAt;
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index]!;
        const operationNow = this.#now();
        if (index > 0 && (index % 25 === 0 || operationNow + 1_000 >= leaseExpiresAt)) {
          const renewed = this.options.state.transaction((repositories) => repositories.retention.renewLease({
            scopeKey, ownerId: this.options.ownerId, leaseToken, now: operationNow, leaseExpiresAt: operationNow + this.#leaseDurationMs,
          }));
          if (!renewed) { state = "LEASE_LOST"; break; }
          leaseExpiresAt = renewed.leaseExpiresAt;
        }
        const outcome = this.options.state.transaction((repositories) => {
          if (!repositories.retention.ownsLease({ scopeKey, ownerId: this.options.ownerId, leaseToken, now: operationNow })) {
            return { leaseOwned: false as const, result: null };
          }
          return { leaseOwned: true as const, result: repositories.retention.prune(candidate, operationNow) };
        });
        if (!outcome.leaseOwned || !outcome.result) { state = "LEASE_LOST"; break; }
        const result = outcome.result;
        const isEligible = result.protectedBy.length === 0;
        if (isEligible) eligible += 1; else protectedCount += 1;
        if (result.deleted) { pruned += 1; prunedByKind[candidate.entityKind] += 1; }
        views.push({ ...candidate, eligible: isEligible, protectedBy: result.protectedBy });
        lastProcessed = candidate;
      }
      const nextCursor = state === "LEASE_LOST"
        ? (lastProcessed ? encodeCursor(workspaceId, lastProcessed) : input.cursor ?? null)
        : (candidates.length === limit && lastProcessed ? encodeCursor(workspaceId, lastProcessed) : null);
      return {
        mode: "APPLY", state, workspaceId, generatedAt: startedAt,
        scanned: views.length, eligible, protected: protectedCount, pruned, scheduled,
        prunedByKind, candidates: views, nextCursor,
      };
    } finally {
      this.options.state.transaction((repositories) => { repositories.retention.releaseLease({ scopeKey, ownerId: this.options.ownerId, leaseToken }); });
    }
  }

  public listTombstones(input: { workspaceId: string; entityKind?: LedgerRetentionEntityKind; limit?: number }): readonly LedgerRetentionTombstoneRow[] {
    const workspaceId = this.#workspace(input.workspaceId);
    if (input.entityKind !== undefined && !ENTITY_KINDS.has(input.entityKind)) throw new TaskError("TASK_INVALID_ARGUMENT", "invalid maintenance retention entityKind");
    const limit = this.#limit(input.limit);
    return this.options.state.transaction((repositories) => repositories.retention.listTombstones({ workspaceId, ...(input.entityKind ? { entityKind: input.entityKind } : {}), limit }));
  }

  public sweepAll(): readonly MaintenanceRetentionBatchResult[] {
    return [...this.#allowed].sort().map((workspaceId) => {
      const sweepScopeKey = `retention-sweep:${workspaceId}`;
      const sweepState = this.options.state.transaction((repositories) => repositories.retention.getSweepState(sweepScopeKey));
      const cursor = sweepState?.cursor ? encodeCursor(workspaceId, sweepState.cursor) : undefined;
      const result = this.prune({ workspaceId, limit: this.#batchSize, ...(cursor ? { cursor } : {}) });
      if (result.state === "LEASE_BUSY") return result;
      const next = result.nextCursor ? decodeCursor(workspaceId, result.nextCursor) : null;
      this.options.state.transaction((repositories) => {
        repositories.retention.advanceSweepState({
          scopeKey: sweepScopeKey,
          expectedRevision: sweepState?.revision ?? null,
          cursor: next,
          now: this.#now(),
        });
      });
      return result;
    });
  }
}
