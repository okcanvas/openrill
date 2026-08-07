import { randomUUID } from "node:crypto";
import type {
  LedgerAutomationJobRow,
  LedgerAutomationRunRow,
  OpenRillStateDatabase,
} from "@openrill/state";
import { AutomationError } from "./errors.js";
import { computeNextScheduledFor, normalizeSchedule, normalizeTimezone } from "./schedule.js";
import type {
  AutomationCatchUpPolicy,
  AutomationConversationTemplate,
  AutomationExecutionContext,
  AutomationExecutionResult,
  AutomationJob,
  AutomationRun,
  AutomationSchedule,
  AutomationSchedulerStatus,
  AutomationSchedulerWakeResult,
} from "./types.js";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
const DEFAULT_LEASE_DURATION_MS = 30_000;
const DEFAULT_RENEW_INTERVAL_MS = 10_000;
const DEFAULT_DUE_JOB_LIMIT = 100;
const DEFAULT_RUN_LIMIT = 100;
const MAX_TIMER_DELAY_MS = 2_147_000_000;

interface TimerHandle {
  unref?: () => unknown;
}

export interface AutomationSchedulerOptions {
  readonly state: OpenRillStateDatabase;
  readonly executor: (context: AutomationExecutionContext) => Promise<AutomationExecutionResult>;
  readonly ownerId: string;
  readonly now?: () => number;
  readonly createId?: () => string;
  readonly leaseDurationMs?: number;
  readonly renewIntervalMs?: number;
  readonly dueJobLimit?: number;
  readonly runLimit?: number;
  readonly autoArm?: boolean;
  readonly setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  readonly clearTimer?: (handle: TimerHandle) => void;
  readonly onRunUpdated?: (run: AutomationRun) => void;
}

interface MaterializeResult {
  readonly materializedRuns: number;
  readonly skippedRuns: number;
}

function integerValue(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new AutomationError("AUTOMATION_INVALID_ARGUMENT", `${label} must be an integer in ${min}..${max}`);
  }
  return value as number;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new AutomationError("AUTOMATION_INVALID_ARGUMENT", `invalid ${label}`);
  }
  return value;
}

function errorCode(value: unknown): string {
  if (typeof value !== "string" || !ERROR_CODE_PATTERN.test(value)) {
    throw new AutomationError("AUTOMATION_INVALID_ARGUMENT", "invalid automation execution errorCode");
  }
  return value;
}

function scheduleDomain(row: LedgerAutomationJobRow): AutomationSchedule {
  if (!row.schedulePayload || typeof row.schedulePayload !== "object") {
    throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", `automation job ${row.jobId} has invalid schedule payload`);
  }
  const payload = row.schedulePayload as Record<string, unknown>;
  if (row.scheduleType === "AT" && payload.kind === "at" && typeof payload.at === "string") {
    return normalizeSchedule({ kind: "at", at: payload.at });
  }
  if (
    row.scheduleType === "INTERVAL"
    && payload.kind === "interval"
    && typeof payload.everyMs === "number"
    && typeof payload.anchorMs === "number"
  ) {
    return normalizeSchedule({ kind: "interval", everyMs: payload.everyMs, anchorMs: payload.anchorMs });
  }
  if (row.scheduleType === "CRON" && payload.kind === "cron" && typeof payload.expression === "string") {
    return normalizeSchedule({ kind: "cron", expression: payload.expression });
  }
  throw new AutomationError(
    "AUTOMATION_INVALID_SCHEDULE",
    `automation job ${row.jobId} schedule payload does not match ${row.scheduleType}`,
  );
}

function catchUpDomain(row: LedgerAutomationJobRow): AutomationCatchUpPolicy {
  if (row.catchUpPolicy === "BOUNDED") {
    if (row.catchUpLimit === null) {
      throw new AutomationError("AUTOMATION_INVALID_ARGUMENT", `automation job ${row.jobId} bounded catch-up limit is missing`);
    }
    return { kind: "BOUNDED", limit: row.catchUpLimit };
  }
  return { kind: row.catchUpPolicy };
}

function jobDomain(row: LedgerAutomationJobRow): AutomationJob {
  return {
    jobId: row.jobId,
    revision: row.revision,
    config: {
      name: row.name,
      enabled: row.enabled,
      schedule: scheduleDomain(row),
      timezone: normalizeTimezone(row.timezone),
      conversationTemplate: row.conversationTemplate as AutomationConversationTemplate,
      catchUpPolicy: catchUpDomain(row),
      failurePolicy: row.failurePolicy as AutomationJob["config"]["failurePolicy"],
    },
    runtime: {
      nextScheduledFor: row.nextScheduledFor,
      lastScheduledFor: row.lastScheduledFor,
      consecutiveFailures: row.consecutiveFailures,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function runDomain(row: LedgerAutomationRunRow): AutomationRun {
  return { ...row };
}

function createRunRow(input: {
  readonly automationRunId: string;
  readonly jobId: string;
  readonly scheduledFor: number;
  readonly status: "PENDING" | "SKIPPED";
  readonly errorCode: string | null;
  readonly now: number;
}): LedgerAutomationRunRow {
  return {
    automationRunId: input.automationRunId,
    jobId: input.jobId,
    scheduledFor: input.scheduledFor,
    triggerKind: "SCHEDULED",
    requestKey: null,
    claimedAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    runId: null,
    status: input.status,
    attempt: 0,
    errorCode: input.errorCode,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function nextAfterNow(row: LedgerAutomationJobRow, now: number): number | null {
  return computeNextScheduledFor(scheduleDomain(row), row.timezone, now);
}

function nextAfterOccurrence(row: LedgerAutomationJobRow, scheduledFor: number): number | null {
  return computeNextScheduledFor(scheduleDomain(row), row.timezone, scheduledFor);
}

function startupPlan(row: LedgerAutomationJobRow, now: number): {
  readonly pending: readonly number[];
  readonly skipped: readonly number[];
  readonly nextScheduledFor: number | null;
  readonly lastScheduledFor: number | undefined;
} {
  const first = row.nextScheduledFor;
  if (first === null || first > now) {
    return { pending: [], skipped: [], nextScheduledFor: first, lastScheduledFor: undefined };
  }
  const policy = catchUpDomain(row);
  if (policy.kind === "SKIP") {
    return {
      pending: [],
      skipped: [first],
      nextScheduledFor: nextAfterNow(row, now),
      lastScheduledFor: first,
    };
  }
  if (policy.kind === "RUN_ONCE") {
    return {
      pending: [first],
      skipped: [],
      nextScheduledFor: nextAfterNow(row, now),
      lastScheduledFor: undefined,
    };
  }
  const pending: number[] = [];
  let cursor: number | null = first;
  while (cursor !== null && cursor <= now && pending.length < policy.limit) {
    pending.push(cursor);
    cursor = nextAfterOccurrence(row, cursor);
  }
  if (cursor !== null && cursor <= now) {
    cursor = nextAfterNow(row, now);
  }
  return {
    pending,
    skipped: [],
    nextScheduledFor: cursor,
    lastScheduledFor: undefined,
  };
}

function regularPlan(row: LedgerAutomationJobRow): {
  readonly pending: readonly number[];
  readonly skipped: readonly number[];
  readonly nextScheduledFor: number | null;
  readonly lastScheduledFor: number | undefined;
} {
  const first = row.nextScheduledFor;
  if (first === null) {
    return { pending: [], skipped: [], nextScheduledFor: null, lastScheduledFor: undefined };
  }
  return {
    pending: [first],
    skipped: [],
    nextScheduledFor: nextAfterOccurrence(row, first),
    lastScheduledFor: undefined,
  };
}

export class AutomationScheduler {
  readonly #now: () => number;
  readonly #createId: () => string;
  readonly #leaseDurationMs: number;
  readonly #renewIntervalMs: number;
  readonly #dueJobLimit: number;
  readonly #runLimit: number;
  readonly #autoArm: boolean;
  readonly #setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  readonly #clearTimer: (handle: TimerHandle) => void;
  #started = false;
  #closing = false;
  #closed = false;
  #timer: TimerHandle | null = null;
  #wakePromise: Promise<AutomationSchedulerWakeResult> | null = null;
  #closePromise: Promise<void> | null = null;
  #activeRuns = 0;
  readonly #executionControllers = new Set<AbortController>();
  #lastWakeAt: number | null = null;
  #recoveredClaims = 0;
  #interruptedRuns = 0;

  public constructor(private readonly options: AutomationSchedulerOptions) {
    identifier(options.ownerId, "ownerId");
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? randomUUID;
    this.#leaseDurationMs = integerValue(
      options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS,
      "leaseDurationMs",
      1_000,
      60 * 60 * 1_000,
    );
    this.#renewIntervalMs = integerValue(
      options.renewIntervalMs ?? DEFAULT_RENEW_INTERVAL_MS,
      "renewIntervalMs",
      100,
      this.#leaseDurationMs - 1,
    );
    this.#dueJobLimit = integerValue(options.dueJobLimit ?? DEFAULT_DUE_JOB_LIMIT, "dueJobLimit", 1, 1000);
    this.#runLimit = integerValue(options.runLimit ?? DEFAULT_RUN_LIMIT, "runLimit", 1, 1000);
    this.#autoArm = options.autoArm ?? true;
    this.#setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  public status(): AutomationSchedulerStatus {
    return {
      state: this.#closed ? "CLOSED" : this.#closing ? "CLOSING" : this.#started ? "STARTED" : "STOPPED",
      ownerId: this.options.ownerId,
      timerArmed: this.#timer !== null,
      activeRuns: this.#activeRuns,
      lastWakeAt: this.#lastWakeAt,
      recoveredClaims: this.#recoveredClaims,
      interruptedRuns: this.#interruptedRuns,
    };
  }

  public async start(): Promise<void> {
    if (this.#closed || this.#closing) {
      throw new AutomationError("AUTOMATION_SCHEDULER_CLOSED", "automation scheduler is closing or closed");
    }
    if (this.#started) return;
    this.#started = true;
    const now = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
    const recovered = this.options.state.transaction((repositories) => repositories.automations.recoverExpiredRuns({ now }));
    this.#recoveredClaims += recovered.requeued.length;
    this.#interruptedRuns += recovered.failed.length;
    for (const run of [...recovered.requeued, ...recovered.failed]) this.options.onRunUpdated?.(runDomain(run));
    await this.#materializeDue(now, true);
    this.#armTimer();
  }

  public wake(): Promise<AutomationSchedulerWakeResult> {
    if (this.#closing || this.#closed) {
      return Promise.reject(new AutomationError("AUTOMATION_SCHEDULER_CLOSED", "automation scheduler is closing or closed"));
    }
    if (!this.#started) {
      return Promise.reject(new AutomationError("AUTOMATION_SCHEDULER_NOT_STARTED", "automation scheduler is not started"));
    }
    if (this.#wakePromise) return this.#wakePromise;
    this.#clearArmedTimer();
    this.#wakePromise = this.#runWake().finally(() => {
      this.#wakePromise = null;
      if (!this.#closing && !this.#closed) this.#armTimer();
    });
    return this.#wakePromise;
  }

  public close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#closing = true;
    this.#clearArmedTimer();
    for (const controller of this.#executionControllers) controller.abort();
    this.#closePromise = (async () => {
      await this.#wakePromise;
      this.#started = false;
      this.#closed = true;
      this.#closing = false;
    })();
    return this.#closePromise;
  }

  async #runWake(): Promise<AutomationSchedulerWakeResult> {
    const now = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
    this.#lastWakeAt = now;
    const materialized = await this.#materializeDue(now, false);
    let claimedRuns = 0;
    let succeededRuns = 0;
    let failedRuns = 0;
    while (!this.#closing && claimedRuns < this.#runLimit) {
      const claimedAt = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
      const claimed = this.options.state.transaction((repositories) => {
        const candidate = repositories.automations.listClaimableRuns(1)[0];
        if (!candidate) return null;
        return repositories.automations.claimRun({
          automationRunId: candidate.automationRunId,
          leaseOwner: this.options.ownerId,
          claimedAt,
          leaseExpiresAt: claimedAt + this.#leaseDurationMs,
        });
      });
      if (!claimed) break;
      claimedRuns += 1;
      const outcome = await this.#executeClaimed(claimed);
      if (outcome === "SUCCEEDED") succeededRuns += 1;
      else failedRuns += 1;
    }
    return {
      materializedRuns: materialized.materializedRuns,
      skippedRuns: materialized.skippedRuns,
      claimedRuns,
      succeededRuns,
      failedRuns,
    };
  }

  async #materializeDue(now: number, startup: boolean): Promise<MaterializeResult> {
    let materializedRuns = 0;
    let skippedRuns = 0;
    const due = this.options.state.transaction((repositories) => repositories.automations.listDueJobs(now, this.#dueJobLimit));
    for (const snapshot of due) {
      if (this.#closing) break;
      const plan = startup ? startupPlan(snapshot, now) : regularPlan(snapshot);
      const rows = [
        ...plan.pending.map((scheduledFor) => createRunRow({
          automationRunId: identifier(this.#createId(), "automationRunId"),
          jobId: snapshot.jobId,
          scheduledFor,
          status: "PENDING",
          errorCode: null,
          now,
        })),
        ...plan.skipped.map((scheduledFor) => createRunRow({
          automationRunId: identifier(this.#createId(), "automationRunId"),
          jobId: snapshot.jobId,
          scheduledFor,
          status: "SKIPPED",
          errorCode: "AUTOMATION_CATCH_UP_SKIPPED",
          now,
        })),
      ];
      const result = this.options.state.transaction((repositories) => repositories.automations.materializeDueJob({
        jobId: snapshot.jobId,
        expectedNextScheduledFor: snapshot.nextScheduledFor!,
        nextScheduledFor: plan.nextScheduledFor,
        ...(plan.lastScheduledFor !== undefined ? { lastScheduledFor: plan.lastScheduledFor } : {}),
        runs: rows,
        updatedAt: now,
      }));
      if (!result.materialized) continue;
      materializedRuns += result.runs.filter((run) => run.status === "PENDING").length;
      skippedRuns += result.runs.filter((run) => run.status === "SKIPPED").length;
    }
    return { materializedRuns, skippedRuns };
  }

  async #executeClaimed(claimed: LedgerAutomationRunRow): Promise<"SUCCEEDED" | "FAILED"> {
    const runningAt = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
    const running = this.options.state.transaction((repositories) => repositories.automations.markRunRunning({
      automationRunId: claimed.automationRunId,
      leaseOwner: this.options.ownerId,
      runningAt,
      leaseExpiresAt: runningAt + this.#leaseDurationMs,
    }));
    if (!running) {
      throw new AutomationError("AUTOMATION_LEASE_LOST", `automation run lease lost before execution: ${claimed.automationRunId}`);
    }
    this.options.onRunUpdated?.(runDomain(running));
    const jobRow = this.options.state.transaction((repositories) => repositories.automations.getJob(running.jobId));
    if (!jobRow) {
      throw new AutomationError("AUTOMATION_JOB_NOT_FOUND", `automation job not found: ${running.jobId}`);
    }
    this.#activeRuns += 1;
    let renewTimer: TimerHandle | null = null;
    let leaseLost = false;
    const renew = () => {
      if (leaseLost) return;
      const renewedAt = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
      const renewed = this.options.state.transaction((repositories) => repositories.automations.renewRunLease({
        automationRunId: running.automationRunId,
        leaseOwner: this.options.ownerId,
        renewedAt,
        leaseExpiresAt: renewedAt + this.#leaseDurationMs,
      }));
      if (!renewed) {
        leaseLost = true;
        return;
      }
      renewTimer = this.#setTimer(renew, this.#renewIntervalMs);
      renewTimer.unref?.();
    };
    renewTimer = this.#setTimer(renew, this.#renewIntervalMs);
    renewTimer.unref?.();
    const executionController = new AbortController();
    this.#executionControllers.add(executionController);
    let result: AutomationExecutionResult;
    try {
      result = await this.options.executor({
        job: jobDomain(jobRow),
        run: runDomain(running),
        signal: executionController.signal,
        bindRunId: (runId: string) => {
          const boundAt = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
          const bound = this.options.state.transaction((repositories) => repositories.automations.bindRunId({
            automationRunId: running.automationRunId, leaseOwner: this.options.ownerId, runId, boundAt,
          }));
          if (!bound) throw new AutomationError("AUTOMATION_LEASE_LOST", `automation run lease lost before Run binding: ${running.automationRunId}`);
          const domain = runDomain(bound);
          this.options.onRunUpdated?.(domain);
          return domain;
        },
      });
    } catch (error) {
      result = {
        status: "FAILED",
        errorCode: error instanceof AutomationError ? error.code : "AUTOMATION_EXECUTOR_ERROR",
      };
    } finally {
      this.#executionControllers.delete(executionController);
      if (renewTimer) this.#clearTimer(renewTimer);
      this.#activeRuns -= 1;
    }
    if (leaseLost) {
      throw new AutomationError("AUTOMATION_LEASE_LOST", `automation run lease lost during execution: ${running.automationRunId}`);
    }
    const terminalAt = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
    if (result.status === "SUCCEEDED") {
      const completed = this.options.state.transaction((repositories) => repositories.automations.finishRun({
        automationRunId: running.automationRunId,
        leaseOwner: this.options.ownerId,
        status: "SUCCEEDED",
        runId: result.runId ?? null,
        errorCode: null,
        terminalAt,
      }));
      if (!completed) {
        throw new AutomationError("AUTOMATION_LEASE_LOST", `automation run lease lost before success commit: ${running.automationRunId}`);
      }
      this.options.onRunUpdated?.(runDomain(completed));
      return "SUCCEEDED";
    }
    const completed = this.options.state.transaction((repositories) => repositories.automations.finishRun({
      automationRunId: running.automationRunId,
      leaseOwner: this.options.ownerId,
      status: "FAILED",
      runId: result.runId ?? null,
      errorCode: errorCode(result.errorCode),
      terminalAt,
    }));
    if (!completed) {
      throw new AutomationError("AUTOMATION_LEASE_LOST", `automation run lease lost before failure commit: ${running.automationRunId}`);
    }
    this.options.onRunUpdated?.(runDomain(completed));
    return "FAILED";
  }

  #clearArmedTimer(): void {
    if (!this.#timer) return;
    this.#clearTimer(this.#timer);
    this.#timer = null;
  }

  #armTimer(): void {
    if (!this.#autoArm || !this.#started || this.#closing || this.#closed || this.#timer) return;
    const now = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
    const wakeAt = this.options.state.transaction((repositories) => repositories.automations.nextWakeAt(now));
    if (wakeAt === null) return;
    const delayMs = Math.max(0, Math.min(MAX_TIMER_DELAY_MS, wakeAt - now));
    this.#timer = this.#setTimer(() => {
      this.#timer = null;
      void this.wake().catch(() => undefined);
    }, delayMs);
    this.#timer.unref?.();
  }
}
