import { createHash } from "node:crypto";
import type { BrowserToolLedger, BrowserToolLedgerComplete, BrowserToolLedgerStart } from "@openrill/browser-runtime";
import type { OpenRillStateDatabase, LedgerBrowserEvidenceKind } from "@openrill/state";

function evidenceKind(value: unknown): LedgerBrowserEvidenceKind | null {
  return value === "console" || value === "page_error" || value === "network" ? value : null;
}

function integer(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function digest(value: unknown): { readonly sha256: string; readonly length: number } | null {
  if (typeof value !== "string") return null;
  return { sha256: createHash("sha256").update(value, "utf8").digest("hex"), length: value.length };
}

function durableUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    parsed.search = parsed.search ? "?redacted" : "";
    return parsed.toString().slice(0, 8_192);
  } catch {
    return value === "about:blank" ? value : null;
  }
}

function durableEvidencePayload(event: Readonly<Record<string, unknown>>, kind: LedgerBrowserEvidenceKind) {
  const common = { sequence: integer(event.sequence), at: integer(event.at), kind };
  if (kind === "console") {
    return { ...common, level: boundedString(event.level, 32), text: digest(event.text) };
  }
  if (kind === "page_error") {
    return { ...common, message: digest(event.message), stack: digest(event.stack) };
  }
  return {
    ...common,
    method: boundedString(event.method, 32),
    url: durableUrl(event.url),
    resourceType: boundedString(event.resourceType, 64),
    ok: event.ok === true,
    failureText: digest(event.failureText),
  };
}

export class StateBrowserToolLedger implements BrowserToolLedger {
  public constructor(private readonly state: OpenRillStateDatabase) {}

  public begin(input: BrowserToolLedgerStart): void {
    if (!input.context.conversationId) throw new Error("Browser ledger requires a conversation-owned Run");
    this.state.transaction((repositories) => {
      repositories.browser.beginOperation({
        operationId: input.operationId,
        runId: input.context.runId,
        automationRunId: repositories.browser.findAutomationRunId(input.context.runId),
        attemptId: input.context.attemptId,
        workspaceId: input.context.workspaceId,
        conversationId: input.context.conversationId!,
        toolCallId: input.context.toolCallId ?? null,
        toolName: input.toolName,
        inputSha256: input.inputSha256,
        sessionId: input.sessionId,
        pageId: input.pageId,
        status: "STARTED",
        errorCode: null,
        documentGeneration: null,
        url: null,
        artifactId: null,
        startedAt: input.startedAt,
        completedAt: null,
        updatedAt: input.startedAt,
      }, {
        toolName: input.toolName,
        inputSha256: input.inputSha256,
        sessionId: input.sessionId,
        pageId: input.pageId,
      });
    });
  }

  public complete(input: BrowserToolLedgerComplete): void {
    this.state.transaction((repositories) => {
      const completed = repositories.browser.completeOperation({
        operationId: input.operationId,
        status: input.status,
        errorCode: input.errorCode,
        documentGeneration: input.documentGeneration,
        url: input.url,
        artifactId: input.artifactId,
        completedAt: input.completedAt,
        payload: {
          status: input.status,
          errorCode: input.errorCode,
          documentGeneration: input.documentGeneration,
          url: input.url,
          artifactId: input.artifactId,
          evidenceCount: input.evidenceEvents.length,
        },
      });
      if (input.status !== "SUCCEEDED" || input.evidenceEvents.length === 0) return;
      repositories.browser.insertEvidenceEvents(input.evidenceEvents.flatMap((event) => {
        const kind = evidenceKind(event.kind);
        const sequence = integer(event.sequence);
        const eventAt = integer(event.at);
        if (!kind || sequence === null || eventAt === null || !completed.pageId) return [];
        return [{
          runId: completed.runId,
          pageId: completed.pageId,
          sequence,
          operationId: completed.operationId,
          kind,
          eventAt,
          payload: durableEvidencePayload(event, kind),
          recordedAt: input.completedAt,
        }];
      }));
    });
  }
}
