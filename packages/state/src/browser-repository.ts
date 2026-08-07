import type { DatabaseSync } from "node:sqlite";
import { StateDatabaseError } from "./errors.js";

export type LedgerBrowserOperationStatus = "STARTED" | "SUCCEEDED" | "FAILED" | "INTERRUPTED";
export type LedgerBrowserOperationEventType = LedgerBrowserOperationStatus;
export type LedgerBrowserEvidenceKind = "console" | "page_error" | "network";

export interface LedgerBrowserOperationRow {
  readonly operationId: string;
  readonly runId: string;
  readonly automationRunId: string | null;
  readonly attemptId: string;
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly toolCallId: string | null;
  readonly toolName: string;
  readonly inputSha256: string;
  readonly sessionId: string | null;
  readonly pageId: string | null;
  readonly status: LedgerBrowserOperationStatus;
  readonly errorCode: string | null;
  readonly documentGeneration: number | null;
  readonly url: string | null;
  readonly artifactId: string | null;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly updatedAt: number;
}

export interface LedgerBrowserOperationEventRow {
  readonly operationId: string;
  readonly sequence: number;
  readonly eventType: LedgerBrowserOperationEventType;
  readonly payload: unknown;
  readonly emittedAt: number;
}

export interface LedgerBrowserEvidenceEventRow {
  readonly runId: string;
  readonly pageId: string;
  readonly sequence: number;
  readonly operationId: string;
  readonly kind: LedgerBrowserEvidenceKind;
  readonly eventAt: number;
  readonly payload: unknown;
  readonly recordedAt: number;
}

const OPERATION_SELECT = `
  SELECT operation_id AS operationId,
         run_id AS runId,
         automation_run_id AS automationRunId,
         attempt_id AS attemptId,
         workspace_id AS workspaceId,
         conversation_id AS conversationId,
         tool_call_id AS toolCallId,
         tool_name AS toolName,
         input_sha256 AS inputSha256,
         session_id AS sessionId,
         page_id AS pageId,
         status,
         error_code AS errorCode,
         document_generation AS documentGeneration,
         url,
         artifact_id AS artifactId,
         started_at AS startedAt,
         completed_at AS completedAt,
         updated_at AS updatedAt
  FROM browser_operations`;

function stringifyJson(value: unknown, label: string): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError(`${label} must be JSON-serializable`);
  if (Buffer.byteLength(encoded, "utf8") > 65_536) throw new TypeError(`${label} exceeds 65536 bytes`);
  return encoded;
}

function parseJson(raw: string, label: string): unknown {
  try { return JSON.parse(raw); }
  catch { throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `${label} is invalid JSON`); }
}

export class StateBrowserRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public findAutomationRunId(runId: string): string | null {
    const row = this.database.prepare(`
      SELECT automation_run_id AS automationRunId
      FROM automation_runs WHERE run_id = ? LIMIT 1
    `).get(runId) as { automationRunId: string } | undefined;
    return row?.automationRunId ?? null;
  }

  public beginOperation(row: LedgerBrowserOperationRow, payload: unknown): LedgerBrowserOperationRow {
    const existing = row.toolCallId ? this.getOperationByToolCall(row.runId, row.toolCallId) : null;
    if (existing) {
      if (existing.toolName !== row.toolName || existing.inputSha256 !== row.inputSha256) {
        throw new StateDatabaseError("STATE_CONFLICT", `browser tool call identity conflict: ${row.toolCallId}`);
      }
      return existing;
    }
    this.database.prepare(`
      INSERT INTO browser_operations (
        operation_id, run_id, automation_run_id, attempt_id, workspace_id, conversation_id,
        tool_call_id, tool_name, input_sha256, session_id, page_id, status, error_code,
        document_generation, url, artifact_id, started_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'STARTED', NULL, NULL, NULL, NULL, ?, NULL, ?)
    `).run(
      row.operationId, row.runId, row.automationRunId, row.attemptId, row.workspaceId, row.conversationId,
      row.toolCallId, row.toolName, row.inputSha256, row.sessionId, row.pageId, row.startedAt, row.updatedAt,
    );
    this.database.prepare(`
      INSERT INTO browser_operation_events (operation_id, sequence, event_type, payload_json, emitted_at)
      VALUES (?, 1, 'STARTED', ?, ?)
    `).run(row.operationId, stringifyJson(payload, "browser operation start payload"), row.startedAt);
    return this.getOperation(row.operationId)!;
  }

  public completeOperation(input: {
    readonly operationId: string;
    readonly status: "SUCCEEDED" | "FAILED";
    readonly errorCode: string | null;
    readonly documentGeneration: number | null;
    readonly url: string | null;
    readonly artifactId: string | null;
    readonly completedAt: number;
    readonly payload: unknown;
  }): LedgerBrowserOperationRow {
    const result = this.database.prepare(`
      UPDATE browser_operations
      SET status = ?, error_code = ?, document_generation = ?, url = ?, artifact_id = ?,
          completed_at = ?, updated_at = ?
      WHERE operation_id = ? AND status = 'STARTED'
    `).run(
      input.status, input.errorCode, input.documentGeneration, input.url, input.artifactId,
      input.completedAt, input.completedAt, input.operationId,
    );
    if (result.changes !== 1) {
      const existing = this.getOperation(input.operationId);
      if (!existing) throw new StateDatabaseError("STATE_CONFLICT", `browser operation not found: ${input.operationId}`);
      return existing;
    }
    this.database.prepare(`
      INSERT INTO browser_operation_events (operation_id, sequence, event_type, payload_json, emitted_at)
      VALUES (?, 2, ?, ?, ?)
    `).run(input.operationId, input.status, stringifyJson(input.payload, "browser operation terminal payload"), input.completedAt);
    return this.getOperation(input.operationId)!;
  }

  public recoverInterruptedOperations(input: { readonly recoveredAt: number }): readonly LedgerBrowserOperationRow[] {
    const active = this.database.prepare(`${OPERATION_SELECT} WHERE status = 'STARTED' ORDER BY started_at, operation_id`)
      .all() as unknown as readonly LedgerBrowserOperationRow[];
    const recovered: LedgerBrowserOperationRow[] = [];
    for (const operation of active) {
      const result = this.database.prepare(`
        UPDATE browser_operations
        SET status = 'INTERRUPTED', error_code = 'BROWSER_INTERRUPTED_BY_RESTART',
            completed_at = ?, updated_at = ?
        WHERE operation_id = ? AND status = 'STARTED'
      `).run(input.recoveredAt, input.recoveredAt, operation.operationId);
      if (result.changes !== 1) continue;
      this.database.prepare(`
        INSERT INTO browser_operation_events (operation_id, sequence, event_type, payload_json, emitted_at)
        VALUES (?, 2, 'INTERRUPTED', ?, ?)
      `).run(
        operation.operationId,
        stringifyJson({ errorCode: "BROWSER_INTERRUPTED_BY_RESTART" }, "browser recovery payload"),
        input.recoveredAt,
      );
      recovered.push(this.getOperation(operation.operationId)!);
    }
    return recovered;
  }

  public insertEvidenceEvents(rows: readonly LedgerBrowserEvidenceEventRow[]): number {
    let inserted = 0;
    const statement = this.database.prepare(`
      INSERT OR IGNORE INTO browser_evidence_events (
        run_id, page_id, sequence, operation_id, kind, event_at, payload_json, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows) {
      const result = statement.run(
        row.runId, row.pageId, row.sequence, row.operationId, row.kind, row.eventAt,
        stringifyJson(row.payload, "browser evidence payload"), row.recordedAt,
      );
      inserted += Number(result.changes);
    }
    return inserted;
  }

  public getOperation(operationId: string): LedgerBrowserOperationRow | null {
    return (this.database.prepare(`${OPERATION_SELECT} WHERE operation_id = ?`).get(operationId) as LedgerBrowserOperationRow | undefined) ?? null;
  }

  public getOperationByToolCall(runId: string, toolCallId: string): LedgerBrowserOperationRow | null {
    return (this.database.prepare(`${OPERATION_SELECT} WHERE run_id = ? AND tool_call_id = ?`).get(runId, toolCallId) as LedgerBrowserOperationRow | undefined) ?? null;
  }

  public listOperations(runId: string): readonly LedgerBrowserOperationRow[] {
    return this.database.prepare(`${OPERATION_SELECT} WHERE run_id = ? ORDER BY started_at, operation_id`)
      .all(runId) as unknown as readonly LedgerBrowserOperationRow[];
  }

  public listOperationEvents(operationId: string): readonly LedgerBrowserOperationEventRow[] {
    const rows = this.database.prepare(`
      SELECT operation_id AS operationId, sequence, event_type AS eventType,
             payload_json AS payloadJson, emitted_at AS emittedAt
      FROM browser_operation_events WHERE operation_id = ? ORDER BY sequence
    `).all(operationId) as unknown as readonly { operationId: string; sequence: number; eventType: LedgerBrowserOperationEventType; payloadJson: string; emittedAt: number }[];
    return rows.map((row) => ({
      operationId: row.operationId, sequence: row.sequence, eventType: row.eventType,
      payload: parseJson(row.payloadJson, "browser_operation_events.payload_json"), emittedAt: row.emittedAt,
    }));
  }

  public listEvidence(runId: string): readonly LedgerBrowserEvidenceEventRow[] {
    const rows = this.database.prepare(`
      SELECT run_id AS runId, page_id AS pageId, sequence, operation_id AS operationId,
             kind, event_at AS eventAt, payload_json AS payloadJson, recorded_at AS recordedAt
      FROM browser_evidence_events WHERE run_id = ? ORDER BY page_id, sequence
    `).all(runId) as unknown as readonly { runId: string; pageId: string; sequence: number; operationId: string; kind: LedgerBrowserEvidenceKind; eventAt: number; payloadJson: string; recordedAt: number }[];
    return rows.map((row) => ({
      runId: row.runId, pageId: row.pageId, sequence: row.sequence, operationId: row.operationId,
      kind: row.kind, eventAt: row.eventAt, payload: parseJson(row.payloadJson, "browser_evidence_events.payload_json"), recordedAt: row.recordedAt,
    }));
  }
}
