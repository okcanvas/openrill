export type MemoryKind = "FACT" | "PREFERENCE" | "DECISION" | "CONSTRAINT" | "NOTE";

export interface MemoryRecord {
  readonly memoryId: string;
  readonly workspaceId: string;
  readonly kind: MemoryKind;
  readonly text: string;
  readonly contentHash: string;
  readonly provenance: {
    readonly conversationId: string | null;
    readonly runId: string | null;
  };
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly revision: number;
}

export interface MemorySearchHit extends MemoryRecord {
  readonly excerpt: string;
  readonly rank: number;
}

export interface MemorySearchResult {
  readonly query: string;
  readonly mode: "SQLITE_FTS5_LEXICAL";
  readonly results: readonly MemorySearchHit[];
  readonly maxResults: number;
  readonly truncated: boolean;
}

export interface MemoryRememberResult {
  readonly record: MemoryRecord;
  readonly replayed: boolean;
}

export interface MemoryForgetResult {
  readonly memoryId: string;
  readonly forgottenAt: number;
  readonly revision: number;
}

export interface MemoryLimits {
  readonly maxTextChars: number;
  readonly maxQueryChars: number;
  readonly maxResults: number;
  readonly maxExcerptChars: number;
  readonly maxGetChars: number;
}
