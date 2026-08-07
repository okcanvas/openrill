import { createHash, randomUUID } from "node:crypto";
import type { OpenRillStateDatabase, LedgerMemoryRow, LedgerMemorySearchRow } from "@openrill/state";
import { MemoryError } from "./errors.js";
import type {
  MemoryForgetResult,
  MemoryKind,
  MemoryLimits,
  MemoryRecord,
  MemoryRememberResult,
  MemorySearchHit,
  MemorySearchResult,
} from "./types.js";

export const DEFAULT_MEMORY_LIMITS: MemoryLimits = {
  maxTextChars: 8_000,
  maxQueryChars: 512,
  maxResults: 10,
  maxExcerptChars: 1_200,
  maxGetChars: 8_000,
};

export const MEMORY_SYSTEM_INSTRUCTIONS = `## Durable Memory\nWhen the user explicitly asks you to remember a durable fact, preference, decision, or constraint, use memory.remember. Before answering questions about prior work, decisions, dates, preferences, or remembered constraints, use memory.search and then memory.get for the exact record when needed. Treat memory results as workspace-scoped evidence, preserve provenance, never invent a memory, and use memory.forget only when the user explicitly asks to remove a specific remembered item.`;

const KINDS = new Set<MemoryKind>(["FACT", "PREFERENCE", "DECISION", "CONSTRAINT", "NOTE"]);
const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/iu,
  /\bsk-[A-Za-z0-9_-]{16,}\b/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/iu,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s]{8,}/iu,
];

function normalizeText(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function toRecord(value: LedgerMemoryRow): MemoryRecord {
  return {
    memoryId: value.memoryId,
    workspaceId: value.workspaceId,
    kind: value.kind,
    text: value.text,
    contentHash: value.contentHash,
    provenance: {
      conversationId: value.sourceConversationId,
      runId: value.sourceRunId,
    },
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    revision: value.revision,
  };
}

function toSearchHit(value: LedgerMemorySearchRow, maxExcerptChars: number): MemorySearchHit {
  const excerpt = value.excerpt.length > maxExcerptChars
    ? `${value.excerpt.slice(0, maxExcerptChars)}…`
    : value.excerpt;
  return { ...toRecord(value), excerpt, rank: value.rank };
}

function tokenizeQuery(value: string): string[] {
  return Array.from(value.matchAll(/[\p{L}\p{N}_-]+/gu), (match) => match[0]!)
    .filter((token) => token.length > 0)
    .slice(0, 16);
}

function ftsQuery(value: string): string {
  const tokens = tokenizeQuery(value);
  if (tokens.length === 0) {
    throw new MemoryError("MEMORY_QUERY_INVALID", "memory search query has no searchable terms");
  }
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" OR ");
}

function assertWorkspaceId(value: string): string {
  if (!value || value.length > 128) throw new MemoryError("MEMORY_QUERY_INVALID", "memory workspace identity is invalid");
  return value;
}

export class MemoryService {
  readonly #limits: MemoryLimits;
  readonly #now: () => number;
  readonly #createId: () => string;

  public constructor(private readonly state: OpenRillStateDatabase, options: {
    readonly limits?: Partial<MemoryLimits>;
    readonly now?: () => number;
    readonly createId?: () => string;
  } = {}) {
    this.#limits = { ...DEFAULT_MEMORY_LIMITS, ...options.limits };
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? randomUUID;
  }

  public remember(input: {
    readonly workspaceId: string;
    readonly text: string;
    readonly kind?: MemoryKind;
    readonly sourceConversationId?: string | null;
    readonly sourceRunId?: string | null;
  }): MemoryRememberResult {
    const workspaceId = assertWorkspaceId(input.workspaceId);
    const text = normalizeText(input.text);
    if (text.length === 0 || text.length > this.#limits.maxTextChars) {
      throw new MemoryError("MEMORY_TEXT_INVALID", `memory text must contain 1-${this.#limits.maxTextChars} characters`);
    }
    if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) {
      throw new MemoryError("MEMORY_SENSITIVE_CONTENT_REJECTED", "memory text appears to contain a credential or private key");
    }
    const kind = input.kind ?? "NOTE";
    if (!KINDS.has(kind)) throw new MemoryError("MEMORY_TEXT_INVALID", `unsupported memory kind: ${kind}`);
    const contentHash = hashText(text.normalize("NFKC").toLocaleLowerCase("en-US"));
    return this.state.transaction((repositories) => {
      const existing = repositories.memory.findActiveByHash(workspaceId, contentHash);
      if (existing) return { record: toRecord(existing), replayed: true };
      const timestamp = this.#now();
      const value: LedgerMemoryRow = {
        memoryId: this.#createId(),
        workspaceId,
        kind,
        text,
        contentHash,
        sourceConversationId: input.sourceConversationId ?? null,
        sourceRunId: input.sourceRunId ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
        forgottenAt: null,
        revision: 1,
      };
      repositories.memory.insert(value);
      return { record: toRecord(value), replayed: false };
    });
  }

  public search(input: {
    readonly workspaceId: string;
    readonly query: string;
    readonly maxResults?: number;
  }): MemorySearchResult {
    const workspaceId = assertWorkspaceId(input.workspaceId);
    const query = normalizeText(input.query);
    if (query.length === 0 || query.length > this.#limits.maxQueryChars) {
      throw new MemoryError("MEMORY_QUERY_INVALID", `memory query must contain 1-${this.#limits.maxQueryChars} characters`);
    }
    const maxResults = input.maxResults ?? 6;
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > this.#limits.maxResults) {
      throw new MemoryError("MEMORY_QUERY_INVALID", `maxResults must be between 1 and ${this.#limits.maxResults}`);
    }
    const rows = this.state.transaction((repositories) => repositories.memory.searchActive(
      workspaceId,
      ftsQuery(query),
      maxResults + 1,
    ));
    return {
      query,
      mode: "SQLITE_FTS5_LEXICAL",
      results: rows.slice(0, maxResults).map((value) => toSearchHit(value, this.#limits.maxExcerptChars)),
      maxResults,
      truncated: rows.length > maxResults,
    };
  }

  public get(input: { readonly workspaceId: string; readonly memoryId: string }): MemoryRecord {
    const workspaceId = assertWorkspaceId(input.workspaceId);
    if (!input.memoryId || input.memoryId.length > 128) throw new MemoryError("MEMORY_NOT_FOUND", "memory identity is invalid");
    const value = this.state.transaction((repositories) => repositories.memory.getActive(workspaceId, input.memoryId));
    if (!value) throw new MemoryError("MEMORY_NOT_FOUND", `memory not found: ${input.memoryId}`);
    const record = toRecord(value);
    if (record.text.length > this.#limits.maxGetChars) {
      return { ...record, text: `${record.text.slice(0, this.#limits.maxGetChars)}…` };
    }
    return record;
  }

  public forget(input: { readonly workspaceId: string; readonly memoryId: string }): MemoryForgetResult {
    const workspaceId = assertWorkspaceId(input.workspaceId);
    if (!input.memoryId || input.memoryId.length > 128) throw new MemoryError("MEMORY_NOT_FOUND", "memory identity is invalid");
    const timestamp = this.#now();
    const value = this.state.transaction((repositories) => repositories.memory.forget(workspaceId, input.memoryId, timestamp));
    if (!value) throw new MemoryError("MEMORY_NOT_FOUND", `memory not found: ${input.memoryId}`);
    return { memoryId: value.memoryId, forgottenAt: value.forgottenAt!, revision: value.revision };
  }

  public list(input: { readonly workspaceId: string; readonly limit?: number }): readonly MemoryRecord[] {
    const workspaceId = assertWorkspaceId(input.workspaceId);
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new MemoryError("MEMORY_QUERY_INVALID", "memory list limit must be between 1 and 500");
    return this.state.transaction((repositories) => repositories.memory.listActive(workspaceId, limit).map(toRecord));
  }
}
