import { createHash, randomUUID } from "node:crypto";
import type { RegisteredTool, ToolExecutionContext, ToolExecutionResult, ToolRegistry } from "@openrill/tool-runtime";
import { BrowserRuntimeError } from "./errors.js";
import type { BrowserOwner, BrowserPageAction } from "./types.js";
import { BrowserRuntime } from "./runtime.js";


export interface BrowserToolLedgerStart {
  readonly operationId: string;
  readonly context: ToolExecutionContext;
  readonly toolName: string;
  readonly inputSha256: string;
  readonly sessionId: string | null;
  readonly pageId: string | null;
  readonly startedAt: number;
}

export interface BrowserToolLedgerComplete {
  readonly operationId: string;
  readonly status: "SUCCEEDED" | "FAILED";
  readonly errorCode: string | null;
  readonly documentGeneration: number | null;
  readonly url: string | null;
  readonly artifactId: string | null;
  readonly evidenceEvents: readonly Readonly<Record<string, unknown>>[];
  readonly completedAt: number;
}

export interface BrowserToolLedger {
  begin(input: BrowserToolLedgerStart): Promise<void> | void;
  complete(input: BrowserToolLedgerComplete): Promise<void> | void;
}

export interface RegisterBrowserToolsOptions {
  readonly ledger?: BrowserToolLedger;
  readonly now?: () => number;
  readonly createOperationId?: () => string;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function ledgerUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = parsed.search ? "?redacted" : "";
    parsed.hash = "";
    return parsed.toString().slice(0, 8192);
  } catch {
    return value === "about:blank" ? value : null;
  }
}

function ledgerCompletion(resultValue: ToolExecutionResult): Omit<BrowserToolLedgerComplete, "operationId" | "completedAt"> {
  const output = recordValue(resultValue.output);
  const error = recordValue(output?.error);
  const artifact = recordValue(output?.artifact);
  const events = Array.isArray(output?.events)
    ? output.events.filter((event): event is Readonly<Record<string, unknown>> => recordValue(event) !== null) as readonly Readonly<Record<string, unknown>>[]
    : [];
  return {
    status: resultValue.isError ? "FAILED" : "SUCCEEDED",
    errorCode: typeof error?.code === "string" ? error.code : resultValue.isError ? "BROWSER_TOOL_ERROR" : null,
    documentGeneration: Number.isInteger(output?.documentGeneration) ? output!.documentGeneration as number : null,
    url: ledgerUrl(output?.url),
    artifactId: typeof artifact?.artifactId === "string" ? artifact.artifactId : null,
    evidenceEvents: events,
  };
}

function withLedger(toolDefinition: RegisteredTool, options: RegisterBrowserToolsOptions): RegisteredTool {
  if (!options.ledger) return toolDefinition;
  const now = options.now ?? Date.now;
  const createOperationId = options.createOperationId ?? randomUUID;
  return {
    ...toolDefinition,
    execute: async (input, context) => {
      const operationId = createOperationId();
      const startedAt = now();
      await options.ledger!.begin({
        operationId,
        context,
        toolName: toolDefinition.name,
        inputSha256: sha256(input),
        sessionId: typeof input.sessionId === "string" ? input.sessionId : null,
        pageId: typeof input.pageId === "string" ? input.pageId : null,
        startedAt,
      });
      try {
        const execution = await toolDefinition.execute(input, context);
        await options.ledger!.complete({ operationId, ...ledgerCompletion(execution), completedAt: now() });
        return execution;
      } catch (error) {
        await options.ledger!.complete({
          operationId,
          status: "FAILED",
          errorCode: error instanceof BrowserRuntimeError ? error.code : "BROWSER_TOOL_EXECUTION_FAILED",
          documentGeneration: null,
          url: null,
          artifactId: null,
          evidenceEvents: [],
          completedAt: now(),
        });
        throw error;
      }
    },
  };
}

const ID = { type: "string", minLength: 1, maxLength: 256 } as const;
const REF = { type: "string", minLength: 1, maxLength: 256 } as const;
const EMPTY_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;
const OPEN_SCHEMA = {
  type: "object",
  properties: { url: { type: "string", minLength: 1, maxLength: 8192 } },
  additionalProperties: false,
} as const;
const LIST_SCHEMA = {
  type: "object",
  properties: { sessionId: ID },
  additionalProperties: false,
} as const;
const NAVIGATE_SCHEMA = {
  type: "object",
  properties: { sessionId: ID, pageId: ID, url: { type: "string", minLength: 1, maxLength: 8192 } },
  required: ["sessionId", "pageId", "url"],
  additionalProperties: false,
} as const;
const SNAPSHOT_SCHEMA = {
  type: "object",
  properties: { sessionId: ID, pageId: ID },
  required: ["sessionId", "pageId"],
  additionalProperties: false,
} as const;
const SCREENSHOT_SCHEMA = {
  type: "object",
  properties: {
    sessionId: ID,
    pageId: ID,
    format: { type: "string", enum: ["png", "jpeg"] },
  },
  required: ["sessionId", "pageId"],
  additionalProperties: false,
} as const;
const DOWNLOAD_SCHEMA = {
  type: "object",
  properties: { sessionId: ID, pageId: ID, ref: REF },
  required: ["sessionId", "pageId", "ref"],
  additionalProperties: false,
} as const;
const EVIDENCE_SCHEMA = {
  type: "object",
  properties: {
    sessionId: ID,
    pageId: ID,
    afterSequence: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
  },
  required: ["sessionId", "pageId"],
  additionalProperties: false,
} as const;
const CLOSE_SCHEMA = {
  type: "object",
  properties: { sessionId: ID, pageId: ID },
  required: ["sessionId"],
  additionalProperties: false,
} as const;
const CLICK_SCHEMA = {
  type: "object",
  properties: { sessionId: ID, pageId: ID, ref: REF },
  required: ["sessionId", "pageId", "ref"],
  additionalProperties: false,
} as const;
const TYPE_SCHEMA = {
  type: "object",
  properties: {
    sessionId: ID,
    pageId: ID,
    ref: REF,
    text: { type: "string", maxLength: 20_000 },
    submit: { type: "boolean" },
  },
  required: ["sessionId", "pageId", "ref", "text"],
  additionalProperties: false,
} as const;
const PRESS_SCHEMA = {
  type: "object",
  properties: { sessionId: ID, pageId: ID, key: { type: "string", minLength: 1, maxLength: 128 } },
  required: ["sessionId", "pageId", "key"],
  additionalProperties: false,
} as const;
const SELECT_SCHEMA = {
  type: "object",
  properties: {
    sessionId: ID,
    pageId: ID,
    ref: REF,
    values: { type: "array", minItems: 1, maxItems: 32, items: { type: "string", maxLength: 1024 } },
  },
  required: ["sessionId", "pageId", "ref", "values"],
  additionalProperties: false,
} as const;
const FILL_SCHEMA = {
  type: "object",
  properties: { sessionId: ID, pageId: ID, ref: REF, value: { type: "string", maxLength: 20_000 } },
  required: ["sessionId", "pageId", "ref", "value"],
  additionalProperties: false,
} as const;
const WAIT_SCHEMA = {
  type: "object",
  properties: {
    sessionId: ID,
    pageId: ID,
    timeMs: { type: "integer", minimum: 0, maximum: 60_000 },
    ref: REF,
    url: { type: "string", minLength: 1, maxLength: 8192 },
  },
  required: ["sessionId", "pageId"],
  additionalProperties: false,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function stringValue(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === "string" && (allowEmpty || value.length > 0) && value.length <= max;
}

function idPair(value: Record<string, unknown>): boolean {
  return stringValue(value.sessionId, 256) && stringValue(value.pageId, 256);
}

function validEmpty(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && Object.keys(value).length === 0;
}

function validOpen(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && hasOnly(value, ["url"]) && (value.url === undefined || stringValue(value.url, 8192));
}

function validList(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && hasOnly(value, ["sessionId"]) && (value.sessionId === undefined || stringValue(value.sessionId, 256));
}

function validNavigate(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && hasOnly(value, ["sessionId", "pageId", "url"]) && idPair(value) && stringValue(value.url, 8192);
}

function validSnapshot(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && hasOnly(value, ["sessionId", "pageId"]) && idPair(value);
}

function validScreenshot(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value)
    && hasOnly(value, ["sessionId", "pageId", "format"])
    && idPair(value)
    && (value.format === undefined || value.format === "png" || value.format === "jpeg");
}

function validDownload(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value)
    && hasOnly(value, ["sessionId", "pageId", "ref"])
    && idPair(value)
    && stringValue(value.ref, 256);
}

function validEvidence(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value)
    && hasOnly(value, ["sessionId", "pageId", "afterSequence", "limit"])
    && idPair(value)
    && (value.afterSequence === undefined || (Number.isInteger(value.afterSequence) && (value.afterSequence as number) >= 0))
    && (value.limit === undefined || (Number.isInteger(value.limit) && (value.limit as number) >= 1 && (value.limit as number) <= 100));
}

function validClose(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value)
    && hasOnly(value, ["sessionId", "pageId"])
    && stringValue(value.sessionId, 256)
    && (value.pageId === undefined || stringValue(value.pageId, 256));
}

function validRefAction(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && hasOnly(value, ["sessionId", "pageId", "ref"]) && idPair(value) && stringValue(value.ref, 256);
}

function validType(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value)
    && hasOnly(value, ["sessionId", "pageId", "ref", "text", "submit"])
    && idPair(value)
    && stringValue(value.ref, 256)
    && stringValue(value.text, 20_000, true)
    && (value.submit === undefined || typeof value.submit === "boolean");
}

function validPress(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && hasOnly(value, ["sessionId", "pageId", "key"]) && idPair(value) && stringValue(value.key, 128);
}

function validSelect(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value)
    && hasOnly(value, ["sessionId", "pageId", "ref", "values"])
    && idPair(value)
    && stringValue(value.ref, 256)
    && Array.isArray(value.values)
    && value.values.length >= 1
    && value.values.length <= 32
    && value.values.every((item) => stringValue(item, 1024, true));
}

function validFill(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value)
    && hasOnly(value, ["sessionId", "pageId", "ref", "value"])
    && idPair(value)
    && stringValue(value.ref, 256)
    && stringValue(value.value, 20_000, true);
}

function validWait(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!isRecord(value) || !hasOnly(value, ["sessionId", "pageId", "timeMs", "ref", "url"]) || !idPair(value)) return false;
  const conditions = [value.timeMs !== undefined, value.ref !== undefined, value.url !== undefined].filter(Boolean).length;
  if (conditions !== 1) return false;
  if (value.timeMs !== undefined && (!Number.isInteger(value.timeMs) || (value.timeMs as number) < 0 || (value.timeMs as number) > 60_000)) return false;
  if (value.ref !== undefined && !stringValue(value.ref, 256)) return false;
  if (value.url !== undefined && !stringValue(value.url, 8192)) return false;
  return true;
}

function owner(context: ToolExecutionContext): BrowserOwner {
  if (!context.conversationId) throw new BrowserRuntimeError("BROWSER_SESSION_NOT_FOUND", "browser tools require a conversation-owned Run");
  return {
    workspaceId: context.workspaceId,
    conversationId: context.conversationId,
    runId: context.runId,
    attemptId: context.attemptId,
  };
}

async function result(work: () => Promise<unknown> | unknown): Promise<ToolExecutionResult> {
  try {
    return { output: await work(), isError: false };
  } catch (error) {
    if (error instanceof BrowserRuntimeError) {
      return {
        output: { error: { code: error.code, message: error.message, ...(error.details ?? {}) } },
        isError: true,
      };
    }
    throw error;
  }
}

function tool(
  name: string,
  description: string,
  inputSchema: Readonly<Record<string, unknown>>,
  validateInput: RegisteredTool["validateInput"],
  execute: RegisteredTool["execute"],
): RegisteredTool {
  return { name, description, inputSchema, validateInput, execute };
}

async function elementAction(
  runtime: BrowserRuntime,
  context: ToolExecutionContext,
  input: Readonly<Record<string, unknown>>,
  create: (elementId: string) => BrowserPageAction,
): Promise<unknown> {
  const currentOwner = owner(context);
  const sessionId = input.sessionId as string;
  const pageId = input.pageId as string;
  const elementId = await runtime.resolveOwnedElementRef(currentOwner, sessionId, pageId, input.ref as string, context.signal);
  return runtime.actOwned(currentOwner, sessionId, pageId, create(elementId), context.signal);
}

export function registerBrowserTools(registry: ToolRegistry, runtime: BrowserRuntime, options: RegisterBrowserToolsOptions = {}): void {
  const register = (definition: RegisteredTool): void => registry.register(withLedger(definition, options));
  register(tool(
    "browser.status",
    "Report Browser Runtime status for the current Run attempt.",
    EMPTY_SCHEMA,
    validEmpty,
    (_input, context) => result(() => {
      const currentOwner = owner(context);
      const runtimeSnapshot = runtime.snapshot();
      const sessions = runtime.sessionsForOwner(currentOwner);
      return {
        state: runtimeSnapshot.state,
        generation: runtimeSnapshot.generation,
        sessionCount: sessions.length,
        pageCount: sessions.reduce((sum, session) => sum + session.pageCount, 0),
      };
    }),
  ));
  register(tool(
    "browser.open",
    "Open a page in the current Run attempt's isolated Browser session.",
    OPEN_SCHEMA,
    validOpen,
    (input, context) => result(() => runtime.openOwnedPage(owner(context), typeof input.url === "string" ? input.url : "about:blank", context.signal)),
  ));
  register(tool(
    "browser.list",
    "List Browser sessions and pages owned by the current Run attempt.",
    LIST_SCHEMA,
    validList,
    (input, context) => result(() => {
      const currentOwner = owner(context);
      if (typeof input.sessionId === "string") {
        return { sessions: [{ sessionId: input.sessionId, pages: runtime.listOwnedPages(input.sessionId, currentOwner) }] };
      }
      return {
        sessions: runtime.sessionsForOwner(currentOwner).map((session) => ({
          sessionId: session.sessionId,
          state: session.state,
          generation: session.generation,
          createdAt: session.createdAt,
          lastUsedAt: session.lastUsedAt,
          pages: runtime.listOwnedPages(session.sessionId, currentOwner),
        })),
      };
    }),
  ));
  register(tool(
    "browser.navigate",
    "Navigate an owned Browser page after requested and final URL policy checks.",
    NAVIGATE_SCHEMA,
    validNavigate,
    (input, context) => result(() => runtime.navigateOwned(owner(context), input.sessionId as string, input.pageId as string, input.url as string, context.signal)),
  ));
  register(tool(
    "browser.snapshot",
    "Capture bounded text and accessibility observations with document-scoped element refs.",
    SNAPSHOT_SCHEMA,
    validSnapshot,
    (input, context) => result(() => runtime.snapshotOwned(owner(context), input.sessionId as string, input.pageId as string, context.signal)),
  ));
  register(tool(
    "browser.close",
    "Close an owned Browser page or its isolated session.",
    CLOSE_SCHEMA,
    validClose,
    (input, context) => result(async () => {
      const currentOwner = owner(context);
      const sessionId = input.sessionId as string;
      if (typeof input.pageId === "string") {
        await runtime.closeOwnedPage(currentOwner, sessionId, input.pageId);
        return { sessionId, pageId: input.pageId, closed: true };
      }
      await runtime.closeOwnedSession(currentOwner, sessionId);
      return { sessionId, closed: true };
    }),
  ));
  register(tool(
    "browser.click",
    "Click a current document-scoped element ref.",
    CLICK_SCHEMA,
    validRefAction,
    (input, context) => result(() => elementAction(runtime, context, input, (elementId) => ({ kind: "click", elementId }))),
  ));
  register(tool(
    "browser.type",
    "Type text into a current element ref and optionally press Enter.",
    TYPE_SCHEMA,
    validType,
    (input, context) => result(() => elementAction(runtime, context, input, (elementId) => ({
      kind: "type",
      elementId,
      text: input.text as string,
      submit: input.submit === true,
    }))),
  ));
  register(tool(
    "browser.press",
    "Press one keyboard key or chord on an owned Browser page.",
    PRESS_SCHEMA,
    validPress,
    (input, context) => result(() => runtime.actOwned(owner(context), input.sessionId as string, input.pageId as string, { kind: "press", key: input.key as string }, context.signal)),
  ));
  register(tool(
    "browser.select",
    "Select one or more option values on a current element ref.",
    SELECT_SCHEMA,
    validSelect,
    (input, context) => result(() => elementAction(runtime, context, input, (elementId) => ({ kind: "select", elementId, values: input.values as string[] }))),
  ));
  register(tool(
    "browser.fill",
    "Replace the value of a current element ref.",
    FILL_SCHEMA,
    validFill,
    (input, context) => result(() => elementAction(runtime, context, input, (elementId) => ({ kind: "fill", elementId, value: input.value as string }))),
  ));
  register(tool(
    "browser.wait",
    "Wait for exactly one bounded condition: duration, current ref visibility, or exact URL.",
    WAIT_SCHEMA,
    validWait,
    (input, context) => result(async () => {
      const currentOwner = owner(context);
      const sessionId = input.sessionId as string;
      const pageId = input.pageId as string;
      let action: BrowserPageAction;
      if (typeof input.ref === "string") {
        const elementId = await runtime.resolveOwnedElementRef(currentOwner, sessionId, pageId, input.ref, context.signal);
        action = { kind: "wait-element", elementId };
      } else if (typeof input.url === "string") {
        action = { kind: "wait-url", url: input.url };
      } else {
        action = { kind: "wait-time", timeMs: input.timeMs as number };
      }
      return runtime.actOwned(currentOwner, sessionId, pageId, action, context.signal);
    }),
  ));  register(tool(
    "browser.screenshot",
    "Capture the current viewport as a bounded workspace Artifact.",
    SCREENSHOT_SCHEMA,
    validScreenshot,
    (input, context) => result(() => runtime.screenshotOwned(
      owner(context),
      input.sessionId as string,
      input.pageId as string,
      input.format === "jpeg" ? "jpeg" : "png",
      context.signal,
    )),
  ));
  register(tool(
    "browser.download",
    "Click a current element ref and persist exactly one bounded download as a workspace Artifact.",
    DOWNLOAD_SCHEMA,
    validDownload,
    (input, context) => result(async () => {
      const currentOwner = owner(context);
      const sessionId = input.sessionId as string;
      const pageId = input.pageId as string;
      const elementId = await runtime.resolveOwnedElementRef(currentOwner, sessionId, pageId, input.ref as string, context.signal);
      return runtime.downloadOwned(currentOwner, sessionId, pageId, elementId, context.signal);
    }),
  ));
  register(tool(
    "browser.evidence",
    "Read bounded console, page-error, and network outcome evidence for an owned Browser page.",
    EVIDENCE_SCHEMA,
    validEvidence,
    (input, context) => result(() => runtime.evidenceOwned(
      owner(context),
      input.sessionId as string,
      input.pageId as string,
      typeof input.afterSequence === "number" ? input.afterSequence : 0,
      typeof input.limit === "number" ? input.limit : undefined,
    )),
  ));

}
