import { AutomationError } from "./errors.js";
import type { AutomationSchedule } from "./types.js";

const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 365 * 24 * 60 * 60 * 1_000;
const CRON_SEARCH_LIMIT_MINUTES = 5 * 366 * 24 * 60;
const TIMEZONE_CACHE_LIMIT = 128;
const CRON_CACHE_LIMIT = 256;

interface CronField {
  readonly values: ReadonlySet<number>;
  readonly wildcard: boolean;
}

interface ParsedCron {
  readonly expression: string;
  readonly minute: CronField;
  readonly hour: CronField;
  readonly dayOfMonth: CronField;
  readonly month: CronField;
  readonly dayOfWeek: CronField;
}

interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly dayOfWeek: number;
}

const timezoneCache = new Map<string, Intl.DateTimeFormat>();
const cronCache = new Map<string, ParsedCron>();
const WEEKDAY = new Map([
  ["Sun", 0],
  ["Mon", 1],
  ["Tue", 2],
  ["Wed", 3],
  ["Thu", 4],
  ["Fri", 5],
  ["Sat", 6],
]);

function boundedCacheSet<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): V {
  if (cache.has(key)) cache.delete(key);
  while (cache.size >= limit) {
    const oldest = cache.keys().next().value as K | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

function finiteInteger(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new AutomationError("AUTOMATION_INVALID_ARGUMENT", `${label} must be an integer in ${min}..${max}`);
  }
  return value as number;
}

function parseAbsoluteTimestamp(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) {
    throw new AutomationError(
      "AUTOMATION_INVALID_SCHEDULE",
      "at schedule must be an RFC3339 timestamp with Z or an explicit offset",
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const millisecond = Number((match[7] ?? "").padEnd(3, "0") || "0");
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", "at schedule timestamp fields are invalid");
  }
  const localUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const check = new Date(localUtc);
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
    || check.getUTCHours() !== hour
    || check.getUTCMinutes() !== minute
    || check.getUTCSeconds() !== second
  ) {
    throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", "at schedule date is invalid");
  }
  let offsetMs = 0;
  if (match[8] !== "Z") {
    const offsetHour = Number(match[10]);
    const offsetMinute = Number(match[11]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", "at schedule offset is invalid");
    }
    const direction = match[9] === "+" ? 1 : -1;
    offsetMs = direction * (offsetHour * 60 + offsetMinute) * 60_000;
  }
  const result = localUtc - offsetMs;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", "at schedule timestamp is outside the supported range");
  }
  return result;
}

export function normalizeTimezone(timezone: string): string {
  const value = timezone.trim();
  if (!value || value.length > 128) {
    throw new AutomationError("AUTOMATION_INVALID_TIMEZONE", "timezone must be a non-empty IANA identifier");
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone: value,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    formatter.format(0);
    return formatter.resolvedOptions().timeZone;
  } catch (error) {
    throw new AutomationError("AUTOMATION_INVALID_TIMEZONE", `invalid IANA timezone: ${value}`, error);
  }
}

function timezoneFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = timezoneCache.get(timezone);
  if (cached) {
    timezoneCache.delete(timezone);
    timezoneCache.set(timezone, cached);
    return cached;
  }
  return boundedCacheSet(
    timezoneCache,
    timezone,
    new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }),
    TIMEZONE_CACHE_LIMIT,
  );
}

function zonedParts(epochMs: number, timezone: string): ZonedParts {
  const parts = timezoneFormatter(timezone).formatToParts(new Date(epochMs));
  const record = new Map(parts.map((part) => [part.type, part.value]));
  const weekday = WEEKDAY.get(record.get("weekday") ?? "");
  const result = {
    year: Number(record.get("year")),
    month: Number(record.get("month")),
    day: Number(record.get("day")),
    hour: Number(record.get("hour")),
    minute: Number(record.get("minute")),
    dayOfWeek: weekday,
  };
  if (
    !Number.isInteger(result.year)
    || !Number.isInteger(result.month)
    || !Number.isInteger(result.day)
    || !Number.isInteger(result.hour)
    || !Number.isInteger(result.minute)
    || result.dayOfWeek === undefined
  ) {
    throw new AutomationError("AUTOMATION_INVALID_TIMEZONE", `timezone conversion failed: ${timezone}`);
  }
  return result as ZonedParts;
}

function normalizeDow(value: number): number {
  return value === 7 ? 0 : value;
}

function parseCronNumber(raw: string, min: number, max: number, label: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", `cron ${label} contains a non-numeric value`);
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", `cron ${label} value ${raw} is outside ${min}..${max}`);
  }
  return value;
}

function parseCronField(
  raw: string,
  min: number,
  max: number,
  label: string,
  dayOfWeek = false,
): CronField {
  const wildcard = raw === "*";
  const values = new Set<number>();
  for (const item of raw.split(",")) {
    if (!item) throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", `cron ${label} contains an empty list item`);
    const [base, stepRaw, extra] = item.split("/");
    if (extra !== undefined || base === undefined) {
      throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", `cron ${label} step syntax is invalid`);
    }
    const step = stepRaw === undefined ? 1 : parseCronNumber(stepRaw, 1, max - min + 1, `${label} step`);
    let start: number;
    let end: number;
    if (base === "*") {
      start = min;
      end = max;
    } else if (base.includes("-")) {
      const [startRaw, endRaw, rangeExtra] = base.split("-");
      if (rangeExtra !== undefined || startRaw === undefined || endRaw === undefined) {
        throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", `cron ${label} range syntax is invalid`);
      }
      start = parseCronNumber(startRaw, min, max, label);
      end = parseCronNumber(endRaw, min, max, label);
      if (start > end) {
        throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", `cron ${label} range must be ascending`);
      }
    } else {
      if (stepRaw !== undefined) {
        throw new AutomationError(
          "AUTOMATION_INVALID_SCHEDULE",
          `cron ${label} steps require '*' or an explicit range`,
        );
      }
      const value = parseCronNumber(base, min, max, label);
      values.add(dayOfWeek ? normalizeDow(value) : value);
      continue;
    }
    for (let value = start; value <= end; value += step) {
      values.add(dayOfWeek ? normalizeDow(value) : value);
    }
  }
  if (values.size === 0) {
    throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", `cron ${label} has no values`);
  }
  return { values, wildcard };
}

export function parseCronExpression(expression: string): ParsedCron {
  const normalized = expression.trim().split(/\s+/).join(" ");
  const cached = cronCache.get(normalized);
  if (cached) {
    cronCache.delete(normalized);
    cronCache.set(normalized, cached);
    return cached;
  }
  const fields = normalized.split(" ");
  if (fields.length !== 5) {
    throw new AutomationError(
      "AUTOMATION_INVALID_SCHEDULE",
      "cron expression must contain exactly five fields: minute hour day-of-month month day-of-week",
    );
  }
  const parsed: ParsedCron = {
    expression: normalized,
    minute: parseCronField(fields[0]!, 0, 59, "minute"),
    hour: parseCronField(fields[1]!, 0, 23, "hour"),
    dayOfMonth: parseCronField(fields[2]!, 1, 31, "day-of-month"),
    month: parseCronField(fields[3]!, 1, 12, "month"),
    dayOfWeek: parseCronField(fields[4]!, 0, 7, "day-of-week", true),
  };
  return boundedCacheSet(cronCache, normalized, parsed, CRON_CACHE_LIMIT);
}

function cronMatches(parsed: ParsedCron, parts: ZonedParts): boolean {
  if (!parsed.minute.values.has(parts.minute)) return false;
  if (!parsed.hour.values.has(parts.hour)) return false;
  if (!parsed.month.values.has(parts.month)) return false;
  const dayOfMonthMatch = parsed.dayOfMonth.values.has(parts.day);
  const dayOfWeekMatch = parsed.dayOfWeek.values.has(parts.dayOfWeek);
  if (parsed.dayOfMonth.wildcard && parsed.dayOfWeek.wildcard) return true;
  if (parsed.dayOfMonth.wildcard) return dayOfWeekMatch;
  if (parsed.dayOfWeek.wildcard) return dayOfMonthMatch;
  return dayOfMonthMatch || dayOfWeekMatch;
}

export function normalizeSchedule(schedule: AutomationSchedule): AutomationSchedule {
  if (!schedule || typeof schedule !== "object") {
    throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", "automation schedule is required");
  }
  if (schedule.kind === "at") {
    const epochMs = parseAbsoluteTimestamp(schedule.at);
    return { kind: "at", at: new Date(epochMs).toISOString() };
  }
  if (schedule.kind === "interval") {
    return {
      kind: "interval",
      everyMs: finiteInteger(schedule.everyMs, "interval everyMs", MIN_INTERVAL_MS, MAX_INTERVAL_MS),
      anchorMs: finiteInteger(schedule.anchorMs, "interval anchorMs", 0, Number.MAX_SAFE_INTEGER),
    };
  }
  if (schedule.kind === "cron") {
    return { kind: "cron", expression: parseCronExpression(schedule.expression).expression };
  }
  throw new AutomationError("AUTOMATION_INVALID_SCHEDULE", "unsupported automation schedule kind");
}

export function computeNextScheduledFor(
  scheduleInput: AutomationSchedule,
  timezoneInput: string,
  afterMs: number,
): number | null {
  const after = finiteInteger(afterMs, "afterMs", 0, Number.MAX_SAFE_INTEGER);
  const schedule = normalizeSchedule(scheduleInput);
  const timezone = normalizeTimezone(timezoneInput);
  if (schedule.kind === "at") {
    const at = parseAbsoluteTimestamp(schedule.at);
    return at > after ? at : null;
  }
  if (schedule.kind === "interval") {
    if (after < schedule.anchorMs) return schedule.anchorMs;
    const elapsed = after - schedule.anchorMs;
    const steps = Math.floor(elapsed / schedule.everyMs) + 1;
    const result = schedule.anchorMs + steps * schedule.everyMs;
    if (!Number.isSafeInteger(result)) {
      throw new AutomationError("AUTOMATION_SCHEDULE_NO_FUTURE", "interval next occurrence exceeds the supported range");
    }
    return result;
  }
  const cron = parseCronExpression(schedule.expression);
  let candidate = Math.floor(after / 60_000) * 60_000 + 60_000;
  for (let index = 0; index < CRON_SEARCH_LIMIT_MINUTES; index += 1, candidate += 60_000) {
    if (cronMatches(cron, zonedParts(candidate, timezone))) return candidate;
  }
  throw new AutomationError(
    "AUTOMATION_SCHEDULE_NO_FUTURE",
    `cron schedule has no occurrence within ${CRON_SEARCH_LIMIT_MINUTES} minutes`,
  );
}

export function assertFutureSchedule(
  schedule: AutomationSchedule,
  timezone: string,
  nowMs: number,
): { readonly schedule: AutomationSchedule; readonly timezone: string; readonly nextScheduledFor: number } {
  const normalizedSchedule = normalizeSchedule(schedule);
  const normalizedTimezone = normalizeTimezone(timezone);
  const nextScheduledFor = computeNextScheduledFor(normalizedSchedule, normalizedTimezone, nowMs);
  if (nextScheduledFor === null) {
    throw new AutomationError("AUTOMATION_SCHEDULE_IN_PAST", "one-shot automation time must be in the future");
  }
  return { schedule: normalizedSchedule, timezone: normalizedTimezone, nextScheduledFor };
}
