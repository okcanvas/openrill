import type { DatabaseSync } from "node:sqlite";
import { StateDatabaseError } from "./errors.js";

export type LedgerAutomationScheduleType = "AT" | "INTERVAL" | "CRON";
export type LedgerAutomationCatchUpPolicy = "SKIP" | "RUN_ONCE" | "BOUNDED";
export type LedgerAutomationRunTriggerKind = "SCHEDULED" | "MANUAL";
export type LedgerAutomationRunStatus =
  | "PENDING"
  | "CLAIMED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED"
  | "CANCELLED";

export interface LedgerAutomationJobRow {
  readonly jobId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly scheduleType: LedgerAutomationScheduleType;
  readonly schedulePayload: unknown;
  readonly timezone: string;
  readonly conversationTemplate: unknown;
  readonly catchUpPolicy: LedgerAutomationCatchUpPolicy;
  readonly catchUpLimit: number | null;
  readonly failurePolicy: unknown;
  readonly revision: number;
  readonly nextScheduledFor: number | null;
  readonly lastScheduledFor: number | null;
  readonly consecutiveFailures: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface LedgerAutomationRunRow {
  readonly automationRunId: string;
  readonly jobId: string;
  readonly scheduledFor: number;
  readonly triggerKind: LedgerAutomationRunTriggerKind;
  readonly requestKey: string | null;
  readonly claimedAt: number | null;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: number | null;
  readonly runId: string | null;
  readonly status: LedgerAutomationRunStatus;
  readonly attempt: number;
  readonly errorCode: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

function stringifyJson(value: unknown, label: string): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError(`${label} must be JSON-serializable`);
  return encoded;
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `${label} is invalid JSON`);
  }
}

const JOB_SELECT = `
  SELECT job_id AS jobId,
         name,
         enabled,
         schedule_type AS scheduleType,
         schedule_payload_json AS schedulePayloadJson,
         timezone,
         conversation_template_json AS conversationTemplateJson,
         catch_up_policy AS catchUpPolicy,
         catch_up_limit AS catchUpLimit,
         failure_policy_json AS failurePolicyJson,
         revision,
         next_scheduled_for AS nextScheduledFor,
         last_scheduled_for AS lastScheduledFor,
         consecutive_failures AS consecutiveFailures,
         created_at AS createdAt,
         updated_at AS updatedAt
  FROM automation_jobs`;

const RUN_SELECT = `
  SELECT automation_run_id AS automationRunId,
         job_id AS jobId,
         scheduled_for AS scheduledFor,
         trigger_kind AS triggerKind,
         request_key AS requestKey,
         claimed_at AS claimedAt,
         lease_owner AS leaseOwner,
         lease_expires_at AS leaseExpiresAt,
         run_id AS runId,
         status,
         attempt,
         error_code AS errorCode,
         created_at AS createdAt,
         updated_at AS updatedAt
  FROM automation_runs`;

function automationJob(row: {
  jobId: string;
  name: string;
  enabled: number;
  scheduleType: LedgerAutomationScheduleType;
  schedulePayloadJson: string;
  timezone: string;
  conversationTemplateJson: string;
  catchUpPolicy: LedgerAutomationCatchUpPolicy;
  catchUpLimit: number | null;
  failurePolicyJson: string;
  revision: number;
  nextScheduledFor: number | null;
  lastScheduledFor: number | null;
  consecutiveFailures: number;
  createdAt: number;
  updatedAt: number;
}): LedgerAutomationJobRow {
  return {
    jobId: row.jobId,
    name: row.name,
    enabled: row.enabled === 1,
    scheduleType: row.scheduleType,
    schedulePayload: parseJson(row.schedulePayloadJson, "automation_jobs.schedule_payload_json"),
    timezone: row.timezone,
    conversationTemplate: parseJson(
      row.conversationTemplateJson,
      "automation_jobs.conversation_template_json",
    ),
    catchUpPolicy: row.catchUpPolicy,
    catchUpLimit: row.catchUpLimit,
    failurePolicy: parseJson(row.failurePolicyJson, "automation_jobs.failure_policy_json"),
    revision: row.revision,
    nextScheduledFor: row.nextScheduledFor,
    lastScheduledFor: row.lastScheduledFor,
    consecutiveFailures: row.consecutiveFailures,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function automationRun(row: LedgerAutomationRunRow): LedgerAutomationRunRow {
  return { ...row };
}

export class StateAutomationRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public insertJob(row: LedgerAutomationJobRow): LedgerAutomationJobRow {
    this.database.prepare(`
      INSERT INTO automation_jobs (
        job_id, name, enabled, schedule_type, schedule_payload_json, timezone,
        conversation_template_json, catch_up_policy, catch_up_limit, failure_policy_json,
        revision, next_scheduled_for, last_scheduled_for, consecutive_failures,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.jobId,
      row.name,
      row.enabled ? 1 : 0,
      row.scheduleType,
      stringifyJson(row.schedulePayload, "automation schedule payload"),
      row.timezone,
      stringifyJson(row.conversationTemplate, "automation conversation template"),
      row.catchUpPolicy,
      row.catchUpLimit,
      stringifyJson(row.failurePolicy, "automation failure policy"),
      row.revision,
      row.nextScheduledFor,
      row.lastScheduledFor,
      row.consecutiveFailures,
      row.createdAt,
      row.updatedAt,
    );
    return row;
  }

  public getJob(jobId: string): LedgerAutomationJobRow | null {
    const row = this.database.prepare(`${JOB_SELECT} WHERE job_id = ?`).get(jobId) as
      | Parameters<typeof automationJob>[0]
      | undefined;
    return row ? automationJob(row) : null;
  }

  public listJobs(options: { readonly includeDisabled?: boolean; readonly limit?: number } = {}): readonly LedgerAutomationJobRow[] {
    const limit = options.limit ?? 100;
    const rows = this.database.prepare(`
      ${JOB_SELECT}
      ${options.includeDisabled === false ? "WHERE enabled = 1" : ""}
      ORDER BY updated_at DESC, job_id
      LIMIT ?
    `).all(limit) as unknown as readonly Parameters<typeof automationJob>[0][];
    return rows.map(automationJob);
  }

  public listDueJobs(now: number, limit: number): readonly LedgerAutomationJobRow[] {
    const rows = this.database.prepare(`
      ${JOB_SELECT}
      WHERE enabled = 1 AND next_scheduled_for IS NOT NULL AND next_scheduled_for <= ?
      ORDER BY next_scheduled_for, job_id
      LIMIT ?
    `).all(now, limit) as unknown as readonly Parameters<typeof automationJob>[0][];
    return rows.map(automationJob);
  }

  public updateJobConfig(input: {
    readonly jobId: string;
    readonly expectedRevision: number;
    readonly name: string;
    readonly enabled: boolean;
    readonly scheduleType: LedgerAutomationScheduleType;
    readonly schedulePayload: unknown;
    readonly timezone: string;
    readonly conversationTemplate: unknown;
    readonly catchUpPolicy: LedgerAutomationCatchUpPolicy;
    readonly catchUpLimit: number | null;
    readonly failurePolicy: unknown;
    readonly nextScheduledFor: number | null;
    readonly updatedAt: number;
  }): LedgerAutomationJobRow {
    const result = this.database.prepare(`
      UPDATE automation_jobs
      SET name = ?,
          enabled = ?,
          schedule_type = ?,
          schedule_payload_json = ?,
          timezone = ?,
          conversation_template_json = ?,
          catch_up_policy = ?,
          catch_up_limit = ?,
          failure_policy_json = ?,
          revision = revision + 1,
          next_scheduled_for = ?,
          updated_at = ?
      WHERE job_id = ? AND revision = ?
    `).run(
      input.name,
      input.enabled ? 1 : 0,
      input.scheduleType,
      stringifyJson(input.schedulePayload, "automation schedule payload"),
      input.timezone,
      stringifyJson(input.conversationTemplate, "automation conversation template"),
      input.catchUpPolicy,
      input.catchUpLimit,
      stringifyJson(input.failurePolicy, "automation failure policy"),
      input.nextScheduledFor,
      input.updatedAt,
      input.jobId,
      input.expectedRevision,
    );
    if (result.changes !== 1) {
      const existing = this.getJob(input.jobId);
      if (!existing) {
        throw new StateDatabaseError("STATE_CONFLICT", `automation job not found: ${input.jobId}`);
      }
      throw new StateDatabaseError(
        "STATE_CONFLICT",
        `automation job revision conflict: expected=${input.expectedRevision} actual=${existing.revision}`,
      );
    }
    return this.getJob(input.jobId)!;
  }

  public updateJobRuntime(input: {
    readonly jobId: string;
    readonly nextScheduledFor: number | null;
    readonly lastScheduledFor: number | null;
    readonly consecutiveFailures: number;
    readonly updatedAt: number;
  }): LedgerAutomationJobRow {
    const result = this.database.prepare(`
      UPDATE automation_jobs
      SET next_scheduled_for = ?,
          last_scheduled_for = ?,
          consecutive_failures = ?,
          updated_at = ?
      WHERE job_id = ?
    `).run(
      input.nextScheduledFor,
      input.lastScheduledFor,
      input.consecutiveFailures,
      input.updatedAt,
      input.jobId,
    );
    if (result.changes !== 1) {
      throw new StateDatabaseError("STATE_CONFLICT", `automation job not found: ${input.jobId}`);
    }
    return this.getJob(input.jobId)!;
  }

  public insertRun(row: LedgerAutomationRunRow): { readonly created: boolean; readonly run: LedgerAutomationRunRow } {
    const result = this.database.prepare(`
      INSERT INTO automation_runs (
        automation_run_id, job_id, scheduled_for, trigger_kind, request_key, claimed_at, lease_owner, lease_expires_at,
        run_id, status, attempt, error_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id, scheduled_for) DO NOTHING
    `).run(
      row.automationRunId,
      row.jobId,
      row.scheduledFor,
      row.triggerKind,
      row.requestKey,
      row.claimedAt,
      row.leaseOwner,
      row.leaseExpiresAt,
      row.runId,
      row.status,
      row.attempt,
      row.errorCode,
      row.createdAt,
      row.updatedAt,
    );
    const stored = this.getRunBySchedule(row.jobId, row.scheduledFor);
    if (!stored) {
      throw new StateDatabaseError(
        "STATE_SCHEMA_INCONSISTENT",
        `automation run insert did not produce a row: ${row.jobId}@${row.scheduledFor}`,
      );
    }
    return { created: result.changes === 1, run: stored };
  }


  public getRunByRequestKey(requestKey: string): LedgerAutomationRunRow | null {
    const row = this.database.prepare(`${RUN_SELECT} WHERE request_key = ?`).get(requestKey) as
      | LedgerAutomationRunRow
      | undefined;
    return row ? automationRun(row) : null;
  }

  public reserveManualRun(input: {
    readonly automationRunId: string;
    readonly jobId: string;
    readonly requestKey: string;
    readonly requestedAt: number;
  }): { readonly created: boolean; readonly run: LedgerAutomationRunRow } {
    const replay = this.getRunByRequestKey(input.requestKey);
    if (replay) {
      if (replay.jobId !== input.jobId || replay.triggerKind !== "MANUAL") {
        throw new StateDatabaseError("STATE_CONFLICT", `automation manual request conflict: ${input.requestKey}`);
      }
      return { created: false, run: replay };
    }
    if (!this.getJob(input.jobId)) {
      throw new StateDatabaseError("STATE_CONFLICT", `automation job not found: ${input.jobId}`);
    }
    let scheduledFor = input.requestedAt;
    for (let offset = 0; offset < 1000; offset += 1) {
      const row: LedgerAutomationRunRow = {
        automationRunId: input.automationRunId, jobId: input.jobId, scheduledFor,
        triggerKind: "MANUAL", requestKey: input.requestKey, claimedAt: null, leaseOwner: null,
        leaseExpiresAt: null, runId: null, status: "PENDING", attempt: 0, errorCode: null,
        createdAt: input.requestedAt, updatedAt: input.requestedAt,
      };
      try {
        const inserted = this.insertRun(row);
        if (inserted.created) return inserted;
        scheduledFor += 1;
        continue;
      } catch (error) {
        const existing = this.getRunByRequestKey(input.requestKey);
        if (existing) return { created: false, run: existing };
        if (!(error instanceof Error) || !/UNIQUE constraint failed: automation_runs\.job_id, automation_runs\.scheduled_for/i.test(error.message)) throw error;
        scheduledFor += 1;
      }
    }
    throw new StateDatabaseError("STATE_CONFLICT", `automation manual occurrence collision limit exceeded: ${input.jobId}`);
  }

  public bindRunId(input: {
    readonly automationRunId: string;
    readonly leaseOwner: string;
    readonly runId: string;
    readonly boundAt: number;
  }): LedgerAutomationRunRow | null {
    const current = this.getRun(input.automationRunId);
    if (current?.runId === input.runId) return current;
    const result = this.database.prepare(`
      UPDATE automation_runs
      SET run_id = ?, updated_at = ?
      WHERE automation_run_id = ? AND status = 'RUNNING'
        AND lease_owner = ? AND lease_expires_at >= ? AND run_id IS NULL
    `).run(input.runId, input.boundAt, input.automationRunId, input.leaseOwner, input.boundAt);
    return result.changes === 1 ? this.getRun(input.automationRunId) : null;
  }

  public getRun(automationRunId: string): LedgerAutomationRunRow | null {
    const row = this.database.prepare(`${RUN_SELECT} WHERE automation_run_id = ?`).get(automationRunId) as
      | LedgerAutomationRunRow
      | undefined;
    return row ? automationRun(row) : null;
  }

  public getRunBySchedule(jobId: string, scheduledFor: number): LedgerAutomationRunRow | null {
    const row = this.database.prepare(`${RUN_SELECT} WHERE job_id = ? AND scheduled_for = ?`)
      .get(jobId, scheduledFor) as LedgerAutomationRunRow | undefined;
    return row ? automationRun(row) : null;
  }

  public listRuns(jobId: string, limit = 100): readonly LedgerAutomationRunRow[] {
    const rows = this.database.prepare(`
      ${RUN_SELECT}
      WHERE job_id = ?
      ORDER BY scheduled_for DESC, automation_run_id
      LIMIT ?
    `).all(jobId, limit) as unknown as readonly LedgerAutomationRunRow[];
    return rows.map(automationRun);
  }

  public materializeDueJob(input: {
    readonly jobId: string;
    readonly expectedNextScheduledFor: number;
    readonly nextScheduledFor: number | null;
    readonly lastScheduledFor?: number;
    readonly runs: readonly LedgerAutomationRunRow[];
    readonly updatedAt: number;
  }): { readonly materialized: boolean; readonly job: LedgerAutomationJobRow | null; readonly runs: readonly LedgerAutomationRunRow[] } {
    const current = this.getJob(input.jobId);
    if (
      !current
      || !current.enabled
      || current.nextScheduledFor !== input.expectedNextScheduledFor
    ) {
      return { materialized: false, job: current, runs: [] };
    }
    const storedRuns = input.runs.map((run) => this.insertRun(run).run);
    const result = input.lastScheduledFor === undefined
      ? this.database.prepare(`
          UPDATE automation_jobs
          SET next_scheduled_for = ?, updated_at = ?
          WHERE job_id = ? AND enabled = 1 AND next_scheduled_for = ?
        `).run(input.nextScheduledFor, input.updatedAt, input.jobId, input.expectedNextScheduledFor)
      : this.database.prepare(`
          UPDATE automation_jobs
          SET next_scheduled_for = ?, last_scheduled_for = ?, updated_at = ?
          WHERE job_id = ? AND enabled = 1 AND next_scheduled_for = ?
        `).run(
          input.nextScheduledFor,
          input.lastScheduledFor,
          input.updatedAt,
          input.jobId,
          input.expectedNextScheduledFor,
        );
    if (result.changes !== 1) {
      throw new StateDatabaseError(
        "STATE_CONFLICT",
        `automation due cursor changed concurrently: ${input.jobId}@${input.expectedNextScheduledFor}`,
      );
    }
    return { materialized: true, job: this.getJob(input.jobId), runs: storedRuns };
  }

  public listClaimableRuns(limit: number): readonly LedgerAutomationRunRow[] {
    const rows = this.database.prepare(`
      ${RUN_SELECT}
      WHERE status = 'PENDING'
      ORDER BY scheduled_for, automation_run_id
      LIMIT ?
    `).all(limit) as unknown as readonly LedgerAutomationRunRow[];
    return rows.map(automationRun);
  }

  public claimRun(input: {
    readonly automationRunId: string;
    readonly leaseOwner: string;
    readonly claimedAt: number;
    readonly leaseExpiresAt: number;
  }): LedgerAutomationRunRow | null {
    const result = this.database.prepare(`
      UPDATE automation_runs
      SET claimed_at = ?, lease_owner = ?, lease_expires_at = ?,
          status = 'CLAIMED', attempt = attempt + 1, error_code = NULL, updated_at = ?
      WHERE automation_run_id = ? AND status = 'PENDING'
    `).run(
      input.claimedAt,
      input.leaseOwner,
      input.leaseExpiresAt,
      input.claimedAt,
      input.automationRunId,
    );
    return result.changes === 1 ? this.getRun(input.automationRunId) : null;
  }

  public markRunRunning(input: {
    readonly automationRunId: string;
    readonly leaseOwner: string;
    readonly runningAt: number;
    readonly leaseExpiresAt: number;
  }): LedgerAutomationRunRow | null {
    const result = this.database.prepare(`
      UPDATE automation_runs
      SET status = 'RUNNING', lease_expires_at = ?, updated_at = ?
      WHERE automation_run_id = ? AND status = 'CLAIMED'
        AND lease_owner = ? AND lease_expires_at >= ?
    `).run(
      input.leaseExpiresAt,
      input.runningAt,
      input.automationRunId,
      input.leaseOwner,
      input.runningAt,
    );
    return result.changes === 1 ? this.getRun(input.automationRunId) : null;
  }

  public renewRunLease(input: {
    readonly automationRunId: string;
    readonly leaseOwner: string;
    readonly renewedAt: number;
    readonly leaseExpiresAt: number;
  }): LedgerAutomationRunRow | null {
    const result = this.database.prepare(`
      UPDATE automation_runs
      SET lease_expires_at = ?, updated_at = ?
      WHERE automation_run_id = ? AND status IN ('CLAIMED', 'RUNNING')
        AND lease_owner = ? AND lease_expires_at >= ?
    `).run(
      input.leaseExpiresAt,
      input.renewedAt,
      input.automationRunId,
      input.leaseOwner,
      input.renewedAt,
    );
    return result.changes === 1 ? this.getRun(input.automationRunId) : null;
  }

  public finishRun(input: {
    readonly automationRunId: string;
    readonly leaseOwner: string;
    readonly status: "SUCCEEDED" | "FAILED" | "CANCELLED";
    readonly runId: string | null;
    readonly errorCode: string | null;
    readonly terminalAt: number;
  }): LedgerAutomationRunRow | null {
    const current = this.getRun(input.automationRunId);
    if (
      !current
      || current.status !== "RUNNING"
      || current.leaseOwner !== input.leaseOwner
      || current.leaseExpiresAt === null
      || current.leaseExpiresAt < input.terminalAt
    ) return null;
    const result = this.database.prepare(`
      UPDATE automation_runs
      SET status = ?, run_id = COALESCE(?, run_id), error_code = ?,
          claimed_at = NULL, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE automation_run_id = ? AND status = 'RUNNING' AND lease_owner = ? AND lease_expires_at >= ?
    `).run(
      input.status,
      input.runId,
      input.errorCode,
      input.terminalAt,
      input.automationRunId,
      input.leaseOwner,
      input.terminalAt,
    );
    if (result.changes !== 1) return null;
    if (input.status === "SUCCEEDED") {
      this.database.prepare(`
        UPDATE automation_jobs
        SET last_scheduled_for = CASE
              WHEN last_scheduled_for IS NULL OR last_scheduled_for < ? THEN ?
              ELSE last_scheduled_for
            END,
            consecutive_failures = 0,
            updated_at = ?
        WHERE job_id = ?
      `).run(current.scheduledFor, current.scheduledFor, input.terminalAt, current.jobId);
    } else if (input.status === "FAILED") {
      this.database.prepare(`
        UPDATE automation_jobs
        SET last_scheduled_for = CASE
              WHEN last_scheduled_for IS NULL OR last_scheduled_for < ? THEN ?
              ELSE last_scheduled_for
            END,
            consecutive_failures = consecutive_failures + 1,
            updated_at = ?
        WHERE job_id = ?
      `).run(current.scheduledFor, current.scheduledFor, input.terminalAt, current.jobId);
    }
    return this.getRun(input.automationRunId);
  }

  public recoverExpiredRuns(input: { readonly now: number }): {
    readonly requeued: readonly LedgerAutomationRunRow[];
    readonly failed: readonly LedgerAutomationRunRow[];
  } {
    const expired = this.database.prepare(`
      ${RUN_SELECT}
      WHERE status IN ('CLAIMED', 'RUNNING') AND lease_expires_at <= ?
      ORDER BY scheduled_for, automation_run_id
    `).all(input.now) as unknown as readonly LedgerAutomationRunRow[];
    const requeued: LedgerAutomationRunRow[] = [];
    const failed: LedgerAutomationRunRow[] = [];
    for (const run of expired) {
      if (run.status === "CLAIMED") {
        this.database.prepare(`
          UPDATE automation_runs
          SET status = 'PENDING', claimed_at = NULL, lease_owner = NULL,
              lease_expires_at = NULL, error_code = NULL, updated_at = ?
          WHERE automation_run_id = ? AND status = 'CLAIMED' AND lease_expires_at <= ?
        `).run(input.now, run.automationRunId, input.now);
        const recovered = this.getRun(run.automationRunId);
        if (recovered?.status === "PENDING") requeued.push(recovered);
        continue;
      }
      const linked = run.runId
        ? this.database.prepare(`
            SELECT status, recovery_state AS recoveryState
            FROM agent_runs WHERE run_id = ?
          `).get(run.runId) as { status: string; recoveryState: string } | undefined
        : undefined;
      if (linked?.recoveryState === "RESUMABLE" && (linked.status === "CREATED" || linked.status === "WAITING_APPROVAL")) {
        this.database.prepare(`
          UPDATE automation_runs
          SET status = 'PENDING', claimed_at = NULL, lease_owner = NULL,
              lease_expires_at = NULL, error_code = NULL, updated_at = ?
          WHERE automation_run_id = ? AND status = 'RUNNING' AND lease_expires_at <= ?
        `).run(input.now, run.automationRunId, input.now);
        const recovered = this.getRun(run.automationRunId);
        if (recovered?.status === "PENDING") requeued.push(recovered);
        continue;
      }
      this.database.prepare(`
        UPDATE automation_runs
        SET status = 'FAILED', claimed_at = NULL, lease_owner = NULL,
            lease_expires_at = NULL, error_code = 'AUTOMATION_INTERRUPTED_BY_RESTART', updated_at = ?
        WHERE automation_run_id = ? AND status = 'RUNNING' AND lease_expires_at <= ?
      `).run(input.now, run.automationRunId, input.now);
      const recovered = this.getRun(run.automationRunId);
      if (recovered?.status === "FAILED") {
        this.database.prepare(`
          UPDATE automation_jobs
          SET last_scheduled_for = CASE
                WHEN last_scheduled_for IS NULL OR last_scheduled_for < ? THEN ?
                ELSE last_scheduled_for
              END,
              consecutive_failures = consecutive_failures + 1,
              updated_at = ?
          WHERE job_id = ?
        `).run(run.scheduledFor, run.scheduledFor, input.now, run.jobId);
        failed.push(recovered);
      }
    }
    return { requeued, failed };
  }

  public nextWakeAt(now: number): number | null {
    const pending = this.database.prepare(`
      SELECT 1 AS present FROM automation_runs WHERE status = 'PENDING' LIMIT 1
    `).get() as { present: number } | undefined;
    if (pending) return now;
    const row = this.database.prepare(`
      SELECT MIN(next_scheduled_for) AS wakeAt
      FROM automation_jobs
      WHERE enabled = 1 AND next_scheduled_for IS NOT NULL
    `).get() as { wakeAt: number | null };
    return row.wakeAt;
  }

}
