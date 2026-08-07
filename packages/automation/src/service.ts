import { randomUUID } from "node:crypto";
import type {
  LedgerAutomationCatchUpPolicy,
  LedgerAutomationJobRow,
  LedgerAutomationRunRow,
  LedgerAutomationScheduleType,
  OpenRillStateDatabase,
} from "@openrill/state";
import { StateDatabaseError } from "@openrill/state";
import { AutomationError } from "./errors.js";
import { computeNextScheduledFor, normalizeSchedule, normalizeTimezone } from "./schedule.js";
import type {
  AutomationCatchUpPolicy,
  AutomationConversationTemplate,
  AutomationFailurePolicy,
  AutomationJob,
  AutomationRun,
  AutomationSchedule,
  CreateAutomationJobInput,
  UpdateAutomationJobPatch,
} from "./types.js";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const WORKSPACE_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const MODEL_PROFILE_PATTERN = /^[A-Za-z0-9._-]+$/;

function stringValue(value: unknown, label: string, min: number, max: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    throw new AutomationError("AUTOMATION_INVALID_ARGUMENT", `invalid ${label}`);
  }
  return value;
}

function integerValue(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new AutomationError("AUTOMATION_INVALID_ARGUMENT", `${label} must be an integer in ${min}..${max}`);
  }
  return value as number;
}

function normalizeConversationTemplate(input: AutomationConversationTemplate): AutomationConversationTemplate {
  const workspaceId = stringValue(input.workspaceId, "conversationTemplate.workspaceId", 1, 64, WORKSPACE_ID_PATTERN);
  const prompt = stringValue(input.prompt, "conversationTemplate.prompt", 1, 65_536);
  const modelProfile = input.modelProfile === undefined
    ? undefined
    : stringValue(input.modelProfile, "conversationTemplate.modelProfile", 1, 64, MODEL_PROFILE_PATTERN);
  const title = input.title === undefined
    ? undefined
    : stringValue(input.title, "conversationTemplate.title", 1, 256);
  return {
    workspaceId,
    prompt,
    ...(modelProfile !== undefined ? { modelProfile } : {}),
    ...(title !== undefined ? { title } : {}),
  };
}

function normalizeCatchUpPolicy(input: AutomationCatchUpPolicy): AutomationCatchUpPolicy {
  if (input.kind === "SKIP" || input.kind === "RUN_ONCE") return { kind: input.kind };
  if (input.kind === "BOUNDED") {
    return { kind: "BOUNDED", limit: integerValue(input.limit, "catchUpPolicy.limit", 1, 100) };
  }
  throw new AutomationError("AUTOMATION_INVALID_ARGUMENT", "invalid catch-up policy");
}

function normalizeFailurePolicy(input: AutomationFailurePolicy): AutomationFailurePolicy {
  if (!input || typeof input !== "object" || typeof input.autoDisable !== "boolean") {
    throw new AutomationError("AUTOMATION_INVALID_ARGUMENT", "invalid failure policy");
  }
  return {
    backoffMs: integerValue(input.backoffMs, "failurePolicy.backoffMs", 0, 30 * 24 * 60 * 60 * 1_000),
    maxConsecutiveFailures: integerValue(
      input.maxConsecutiveFailures,
      "failurePolicy.maxConsecutiveFailures",
      1,
      100,
    ),
    autoDisable: input.autoDisable,
  };
}


function normalizeScheduleState(
  scheduleInput: AutomationSchedule,
  timezoneInput: string,
  enabled: boolean,
  now: number,
): { readonly schedule: AutomationSchedule; readonly timezone: string; readonly nextScheduledFor: number | null } {
  const schedule = normalizeSchedule(scheduleInput);
  const timezone = normalizeTimezone(timezoneInput);
  if (!enabled) return { schedule, timezone, nextScheduledFor: null };
  const nextScheduledFor = computeNextScheduledFor(schedule, timezone, now);
  if (nextScheduledFor === null) {
    throw new AutomationError("AUTOMATION_SCHEDULE_IN_PAST", "enabled one-shot automation time must be in the future");
  }
  return { schedule, timezone, nextScheduledFor };
}

function scheduleType(schedule: AutomationSchedule): LedgerAutomationScheduleType {
  if (schedule.kind === "at") return "AT";
  if (schedule.kind === "interval") return "INTERVAL";
  return "CRON";
}

function catchUpLedger(policy: AutomationCatchUpPolicy): {
  readonly policy: LedgerAutomationCatchUpPolicy;
  readonly limit: number | null;
} {
  return policy.kind === "BOUNDED"
    ? { policy: policy.kind, limit: policy.limit }
    : { policy: policy.kind, limit: null };
}

function catchUpDomain(policy: LedgerAutomationCatchUpPolicy, limit: number | null): AutomationCatchUpPolicy {
  if (policy === "BOUNDED") {
    if (limit === null) throw new Error("bounded automation catch-up policy is missing its limit");
    return { kind: policy, limit };
  }
  return { kind: policy };
}

function scheduleDomain(type: LedgerAutomationScheduleType, payload: unknown): AutomationSchedule {
  if (!payload || typeof payload !== "object") throw new Error("automation schedule payload is invalid");
  const record = payload as Record<string, unknown>;
  if (type === "AT" && record.kind === "at" && typeof record.at === "string") {
    return { kind: "at", at: record.at };
  }
  if (
    type === "INTERVAL"
    && record.kind === "interval"
    && typeof record.everyMs === "number"
    && typeof record.anchorMs === "number"
  ) {
    return { kind: "interval", everyMs: record.everyMs, anchorMs: record.anchorMs };
  }
  if (type === "CRON" && record.kind === "cron" && typeof record.expression === "string") {
    return { kind: "cron", expression: record.expression };
  }
  throw new Error(`automation schedule payload does not match ${type}`);
}

function jobDomain(row: LedgerAutomationJobRow): AutomationJob {
  return {
    jobId: row.jobId,
    revision: row.revision,
    config: {
      name: row.name,
      enabled: row.enabled,
      schedule: scheduleDomain(row.scheduleType, row.schedulePayload),
      timezone: row.timezone,
      conversationTemplate: row.conversationTemplate as AutomationConversationTemplate,
      catchUpPolicy: catchUpDomain(row.catchUpPolicy, row.catchUpLimit),
      failurePolicy: row.failurePolicy as AutomationFailurePolicy,
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

export interface AutomationDefinitionServiceOptions {
  readonly state: OpenRillStateDatabase;
  readonly now?: () => number;
  readonly createId?: () => string;
}

export class AutomationDefinitionService {
  readonly #now: () => number;
  readonly #createId: () => string;

  public constructor(private readonly options: AutomationDefinitionServiceOptions) {
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? randomUUID;
  }

  public create(input: CreateAutomationJobInput): AutomationJob {
    const now = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
    const name = stringValue(input.name.trim(), "name", 1, 128);
    if (typeof input.enabled !== "boolean") {
      throw new AutomationError("AUTOMATION_INVALID_ARGUMENT", "enabled must be boolean");
    }
    const scheduleResult = normalizeScheduleState(input.schedule, input.timezone, input.enabled, now);
    const conversationTemplate = normalizeConversationTemplate(input.conversationTemplate);
    const catchUpPolicy = normalizeCatchUpPolicy(input.catchUpPolicy);
    const catchUp = catchUpLedger(catchUpPolicy);
    const failurePolicy = normalizeFailurePolicy(input.failurePolicy);
    const jobId = stringValue(this.#createId(), "jobId", 1, 128, ID_PATTERN);
    const row: LedgerAutomationJobRow = {
      jobId,
      name,
      enabled: input.enabled,
      scheduleType: scheduleType(scheduleResult.schedule),
      schedulePayload: scheduleResult.schedule,
      timezone: scheduleResult.timezone,
      conversationTemplate,
      catchUpPolicy: catchUp.policy,
      catchUpLimit: catchUp.limit,
      failurePolicy,
      revision: 1,
      nextScheduledFor: scheduleResult.nextScheduledFor,
      lastScheduledFor: null,
      consecutiveFailures: 0,
      createdAt: now,
      updatedAt: now,
    };
    return jobDomain(this.options.state.transaction((repositories) => repositories.automations.insertJob(row)));
  }

  public get(jobId: string): AutomationJob {
    stringValue(jobId, "jobId", 1, 128, ID_PATTERN);
    const row = this.options.state.transaction((repositories) => repositories.automations.getJob(jobId));
    if (!row) throw new AutomationError("AUTOMATION_JOB_NOT_FOUND", `automation job not found: ${jobId}`);
    return jobDomain(row);
  }

  public list(options: { readonly includeDisabled?: boolean; readonly limit?: number } = {}): readonly AutomationJob[] {
    const limit = integerValue(options.limit ?? 100, "limit", 1, 1000);
    return this.options.state.transaction((repositories) => repositories.automations.listJobs({
      includeDisabled: options.includeDisabled ?? true,
      limit,
    })).map(jobDomain);
  }

  public update(jobId: string, expectedRevision: number, patch: UpdateAutomationJobPatch): AutomationJob {
    stringValue(jobId, "jobId", 1, 128, ID_PATTERN);
    integerValue(expectedRevision, "expectedRevision", 1, Number.MAX_SAFE_INTEGER);
    const current = this.get(jobId);
    const now = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
    const name = patch.name === undefined ? current.config.name : stringValue(patch.name.trim(), "name", 1, 128);
    if (patch.enabled !== undefined && typeof patch.enabled !== "boolean") {
      throw new AutomationError("AUTOMATION_INVALID_ARGUMENT", "enabled must be boolean");
    }
    const enabled = patch.enabled ?? current.config.enabled;
    const scheduleInput = patch.schedule ?? current.config.schedule;
    const timezoneInput = patch.timezone ?? current.config.timezone;
    const scheduleResult = normalizeScheduleState(scheduleInput, timezoneInput, enabled, now);
    const conversationTemplate = patch.conversationTemplate === undefined
      ? current.config.conversationTemplate
      : normalizeConversationTemplate(patch.conversationTemplate);
    const catchUpPolicy = patch.catchUpPolicy === undefined
      ? current.config.catchUpPolicy
      : normalizeCatchUpPolicy(patch.catchUpPolicy);
    const catchUp = catchUpLedger(catchUpPolicy);
    const failurePolicy = patch.failurePolicy === undefined
      ? current.config.failurePolicy
      : normalizeFailurePolicy(patch.failurePolicy);
    try {
      const row = this.options.state.transaction((repositories) => repositories.automations.updateJobConfig({
        jobId,
        expectedRevision,
        name,
        enabled,
        scheduleType: scheduleType(scheduleResult.schedule),
        schedulePayload: scheduleResult.schedule,
        timezone: scheduleResult.timezone,
        conversationTemplate,
        catchUpPolicy: catchUp.policy,
        catchUpLimit: catchUp.limit,
        failurePolicy,
        nextScheduledFor: scheduleResult.nextScheduledFor,
        updatedAt: now,
      }));
      return jobDomain(row);
    } catch (error) {
      if (error instanceof StateDatabaseError && error.code === "STATE_CONFLICT") {
        throw new AutomationError("AUTOMATION_REVISION_CONFLICT", error.message, error);
      }
      throw error;
    }
  }

  public updateRuntime(input: {
    readonly jobId: string;
    readonly nextScheduledFor: number | null;
    readonly lastScheduledFor: number | null;
    readonly consecutiveFailures: number;
  }): AutomationJob {
    stringValue(input.jobId, "jobId", 1, 128, ID_PATTERN);
    const nextScheduledFor = input.nextScheduledFor === null
      ? null
      : integerValue(input.nextScheduledFor, "nextScheduledFor", 0, Number.MAX_SAFE_INTEGER);
    const lastScheduledFor = input.lastScheduledFor === null
      ? null
      : integerValue(input.lastScheduledFor, "lastScheduledFor", 0, Number.MAX_SAFE_INTEGER);
    const consecutiveFailures = integerValue(input.consecutiveFailures, "consecutiveFailures", 0, 1_000_000);
    const updatedAt = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
    try {
      return jobDomain(this.options.state.transaction((repositories) => repositories.automations.updateJobRuntime({
        jobId: input.jobId,
        nextScheduledFor,
        lastScheduledFor,
        consecutiveFailures,
        updatedAt,
      })));
    } catch (error) {
      if (error instanceof StateDatabaseError && error.code === "STATE_CONFLICT") {
        throw new AutomationError("AUTOMATION_JOB_NOT_FOUND", error.message, error);
      }
      throw error;
    }
  }

  public reserveRun(jobId: string, scheduledFor: number): { readonly created: boolean; readonly run: AutomationRun } {
    stringValue(jobId, "jobId", 1, 128, ID_PATTERN);
    integerValue(scheduledFor, "scheduledFor", 0, Number.MAX_SAFE_INTEGER);
    const now = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
    const row: LedgerAutomationRunRow = {
      automationRunId: stringValue(this.#createId(), "automationRunId", 1, 128, ID_PATTERN),
      jobId,
      scheduledFor,
      triggerKind: "SCHEDULED",
      requestKey: null,
      claimedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      runId: null,
      status: "PENDING",
      attempt: 0,
      errorCode: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const result = this.options.state.transaction((repositories) => repositories.automations.insertRun(row));
      return { created: result.created, run: runDomain(result.run) };
    } catch (error) {
      if (error instanceof Error && /FOREIGN KEY constraint failed/i.test(error.message)) {
        throw new AutomationError("AUTOMATION_JOB_NOT_FOUND", `automation job not found: ${jobId}`, error);
      }
      throw error;
    }
  }


  public runNow(jobId: string, requestKey: string): { readonly created: boolean; readonly run: AutomationRun } {
    stringValue(jobId, "jobId", 1, 128, ID_PATTERN);
    stringValue(requestKey, "requestKey", 1, 128, ID_PATTERN);
    const requestedAt = integerValue(this.#now(), "now", 0, Number.MAX_SAFE_INTEGER);
    try {
      const result = this.options.state.transaction((repositories) => repositories.automations.reserveManualRun({
        automationRunId: stringValue(this.#createId(), "automationRunId", 1, 128, ID_PATTERN),
        jobId, requestKey, requestedAt,
      }));
      return { created: result.created, run: runDomain(result.run) };
    } catch (error) {
      if (error instanceof StateDatabaseError && error.code === "STATE_CONFLICT") {
        if (/job not found/i.test(error.message)) throw new AutomationError("AUTOMATION_JOB_NOT_FOUND", error.message, error);
        throw new AutomationError("AUTOMATION_REQUEST_CONFLICT", error.message, error);
      }
      throw error;
    }
  }

  public listRuns(jobId: string, limit = 100): readonly AutomationRun[] {
    stringValue(jobId, "jobId", 1, 128, ID_PATTERN);
    integerValue(limit, "limit", 1, 1000);
    return this.options.state.transaction((repositories) => repositories.automations.listRuns(jobId, limit)).map(runDomain);
  }
}
