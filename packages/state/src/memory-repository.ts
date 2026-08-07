import type { DatabaseSync } from "node:sqlite";

export type LedgerMemoryKind = "FACT" | "PREFERENCE" | "DECISION" | "CONSTRAINT" | "NOTE";

export interface LedgerMemoryRow {
  memoryId: string;
  workspaceId: string;
  kind: LedgerMemoryKind;
  text: string;
  contentHash: string;
  sourceConversationId: string | null;
  sourceRunId: string | null;
  createdAt: number;
  updatedAt: number;
  forgottenAt: number | null;
  revision: number;
}

export interface LedgerMemorySearchRow extends LedgerMemoryRow {
  rank: number;
  excerpt: string;
}

function row(value: any): LedgerMemoryRow {
  return {
    memoryId: value.memoryId,
    workspaceId: value.workspaceId,
    kind: value.kind,
    text: value.text,
    contentHash: value.contentHash,
    sourceConversationId: value.sourceConversationId ?? null,
    sourceRunId: value.sourceRunId ?? null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    forgottenAt: value.forgottenAt ?? null,
    revision: value.revision,
  };
}

const SELECT = `
  SELECT memory_id memoryId, workspace_id workspaceId, kind, text,
         content_hash contentHash, source_conversation_id sourceConversationId,
         source_run_id sourceRunId, created_at createdAt, updated_at updatedAt,
         forgotten_at forgottenAt, revision
  FROM memory_records`;

export class StateMemoryRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public insert(value: LedgerMemoryRow): void {
    this.db.prepare(`
      INSERT INTO memory_records
        (memory_id, workspace_id, kind, text, content_hash,
         source_conversation_id, source_run_id, created_at, updated_at,
         forgotten_at, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      value.memoryId,
      value.workspaceId,
      value.kind,
      value.text,
      value.contentHash,
      value.sourceConversationId,
      value.sourceRunId,
      value.createdAt,
      value.updatedAt,
      value.forgottenAt,
      value.revision,
    );
  }

  public findActiveByHash(workspaceId: string, contentHash: string): LedgerMemoryRow | null {
    const value = this.db.prepare(`${SELECT} WHERE workspace_id = ? AND content_hash = ? AND forgotten_at IS NULL`)
      .get(workspaceId, contentHash);
    return value ? row(value) : null;
  }

  public getActive(workspaceId: string, memoryId: string): LedgerMemoryRow | null {
    const value = this.db.prepare(`${SELECT} WHERE workspace_id = ? AND memory_id = ? AND forgotten_at IS NULL`)
      .get(workspaceId, memoryId);
    return value ? row(value) : null;
  }

  public searchActive(workspaceId: string, query: string, limit: number): LedgerMemorySearchRow[] {
    const values = this.db.prepare(`
      SELECT m.memory_id memoryId, m.workspace_id workspaceId, m.kind, m.text,
             m.content_hash contentHash, m.source_conversation_id sourceConversationId,
             m.source_run_id sourceRunId, m.created_at createdAt, m.updated_at updatedAt,
             m.forgotten_at forgottenAt, m.revision,
             bm25(memory_records_fts, 0.0, 0.0, 1.0) rank,
             snippet(memory_records_fts, 2, '', '', ' … ', 24) excerpt
      FROM memory_records_fts
      JOIN memory_records m ON m.memory_id = memory_records_fts.memory_id
      WHERE memory_records_fts MATCH ?
        AND memory_records_fts.workspace_id = ?
        AND m.forgotten_at IS NULL
      ORDER BY rank ASC, m.updated_at DESC, m.memory_id
      LIMIT ?
    `).all(query, workspaceId, limit) as any[];
    return values.map((value) => ({ ...row(value), rank: value.rank, excerpt: value.excerpt }));
  }

  public listActive(workspaceId: string, limit: number): LedgerMemoryRow[] {
    return (this.db.prepare(`${SELECT} WHERE workspace_id = ? AND forgotten_at IS NULL ORDER BY updated_at DESC, memory_id LIMIT ?`)
      .all(workspaceId, limit) as any[]).map(row);
  }

  public forget(workspaceId: string, memoryId: string, forgottenAt: number): LedgerMemoryRow | null {
    const value = this.db.prepare(`
      UPDATE memory_records
      SET forgotten_at = ?, updated_at = ?, revision = revision + 1
      WHERE workspace_id = ? AND memory_id = ? AND forgotten_at IS NULL
      RETURNING memory_id memoryId, workspace_id workspaceId, kind, text,
                content_hash contentHash, source_conversation_id sourceConversationId,
                source_run_id sourceRunId, created_at createdAt, updated_at updatedAt,
                forgotten_at forgottenAt, revision
    `).get(forgottenAt, forgottenAt, workspaceId, memoryId);
    return value ? row(value) : null;
  }
}
