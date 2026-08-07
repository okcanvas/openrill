import type { DatabaseSync } from "node:sqlite";
import { StateDatabaseError } from "./errors.js";

export type LedgerSkillSourceType = "BUNDLED" | "MANAGED_USER" | "WORKSPACE";

export interface LedgerSkillSourceRow {
  sourceKey: string;
  sourceType: LedgerSkillSourceType;
  workspaceId: string | null;
  rootPath: string;
  rootRevision: string;
  discoveredAt: number;
}

export interface LedgerSkillDiagnosticRow {
  diagnosticId: string;
  sourceKey: string;
  skillId: string | null;
  code: string;
  path: string;
  message: string;
  createdAt: number;
}

export interface LedgerSkillRunContextRow {
  runId: string;
  catalogHash: string;
  selectedSkillIds: readonly string[];
  resolvedAt: number;
}

export interface LedgerSkillSnapshotRow {
  snapshotId: string;
  runId: string;
  skillId: string;
  sourceKey: string;
  skillVersion: string;
  contentHash: string;
  storagePath: string;
  manifest: unknown;
  files: unknown;
  capturedAt: number;
}

function json(value: unknown, label: string): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError(`${label} must be JSON-serializable`);
  return encoded;
}

function parse(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `${label} contains invalid JSON`);
  }
}

function source(row: any): LedgerSkillSourceRow {
  return {
    sourceKey: row.sourceKey,
    sourceType: row.sourceType,
    workspaceId: row.workspaceId ?? null,
    rootPath: row.rootPath,
    rootRevision: row.rootRevision,
    discoveredAt: row.discoveredAt,
  };
}

function diagnostic(row: any): LedgerSkillDiagnosticRow {
  return {
    diagnosticId: row.diagnosticId,
    sourceKey: row.sourceKey,
    skillId: row.skillId ?? null,
    code: row.code,
    path: row.path,
    message: row.message,
    createdAt: row.createdAt,
  };
}

function snapshot(row: any): LedgerSkillSnapshotRow {
  return {
    snapshotId: row.snapshotId,
    runId: row.runId,
    skillId: row.skillId,
    sourceKey: row.sourceKey,
    skillVersion: row.skillVersion,
    contentHash: row.contentHash,
    storagePath: row.storagePath,
    manifest: parse(row.manifestJson, "skill_snapshots.manifest_json"),
    files: parse(row.resolvedFilesJson, "skill_snapshots.resolved_files_json"),
    capturedAt: row.capturedAt,
  };
}

const SNAPSHOT_SELECT = `
  SELECT snapshot_id snapshotId, run_id runId, skill_id skillId, source_key sourceKey,
         skill_version skillVersion, content_hash contentHash, storage_path storagePath,
         manifest_json manifestJson, resolved_files_json resolvedFilesJson, captured_at capturedAt
  FROM skill_snapshots`;

export class StateSkillRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public replaceSourceDiscovery(sourceRow: LedgerSkillSourceRow, diagnostics: readonly LedgerSkillDiagnosticRow[]): void {
    this.db.prepare(`
      INSERT INTO skill_sources (source_key,source_type,workspace_id,root_path,root_revision,discovered_at)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(source_key) DO UPDATE SET
        source_type=excluded.source_type,
        workspace_id=excluded.workspace_id,
        root_path=excluded.root_path,
        root_revision=excluded.root_revision,
        discovered_at=excluded.discovered_at
    `).run(sourceRow.sourceKey, sourceRow.sourceType, sourceRow.workspaceId, sourceRow.rootPath, sourceRow.rootRevision, sourceRow.discoveredAt);
    this.db.prepare(`DELETE FROM skill_validation_diagnostics WHERE source_key=?`).run(sourceRow.sourceKey);
    const insert = this.db.prepare(`
      INSERT INTO skill_validation_diagnostics
        (diagnostic_id,source_key,skill_id,code,path,message,created_at)
      VALUES (?,?,?,?,?,?,?)
    `);
    for (const row of diagnostics) {
      insert.run(row.diagnosticId, row.sourceKey, row.skillId, row.code, row.path, row.message, row.createdAt);
    }
  }

  public getSource(sourceKey: string): LedgerSkillSourceRow | null {
    const row = this.db.prepare(`
      SELECT source_key sourceKey,source_type sourceType,workspace_id workspaceId,
             root_path rootPath,root_revision rootRevision,discovered_at discoveredAt
      FROM skill_sources WHERE source_key=?
    `).get(sourceKey);
    return row ? source(row) : null;
  }

  public listSources(): LedgerSkillSourceRow[] {
    return (this.db.prepare(`
      SELECT source_key sourceKey,source_type sourceType,workspace_id workspaceId,
             root_path rootPath,root_revision rootRevision,discovered_at discoveredAt
      FROM skill_sources ORDER BY source_type,root_path,source_key
    `).all() as any[]).map(source);
  }

  public listDiagnostics(sourceKey?: string): LedgerSkillDiagnosticRow[] {
    const rows = sourceKey
      ? this.db.prepare(`SELECT diagnostic_id diagnosticId,source_key sourceKey,skill_id skillId,code,path,message,created_at createdAt FROM skill_validation_diagnostics WHERE source_key=? ORDER BY created_at,diagnostic_id`).all(sourceKey)
      : this.db.prepare(`SELECT diagnostic_id diagnosticId,source_key sourceKey,skill_id skillId,code,path,message,created_at createdAt FROM skill_validation_diagnostics ORDER BY created_at,diagnostic_id`).all();
    return (rows as any[]).map(diagnostic);
  }

  public insertRunContext(row: LedgerSkillRunContextRow): LedgerSkillRunContextRow {
    this.db.prepare(`
      INSERT INTO skill_run_contexts (run_id,catalog_hash,selected_skill_ids_json,resolved_at)
      VALUES (?,?,?,?)
      ON CONFLICT(run_id) DO NOTHING
    `).run(row.runId, row.catalogHash, json(row.selectedSkillIds, "selected Skill ids"), row.resolvedAt);
    const persisted = this.getRunContext(row.runId);
    if (!persisted) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `Skill run context insert did not persist: ${row.runId}`);
    if (persisted.catalogHash !== row.catalogHash || JSON.stringify(persisted.selectedSkillIds) !== JSON.stringify(row.selectedSkillIds)) {
      throw new StateDatabaseError("STATE_CONFLICT", `Skill run context already exists with different selection: ${row.runId}`);
    }
    return persisted;
  }

  public getRunContext(runId: string): LedgerSkillRunContextRow | null {
    const row = this.db.prepare(`SELECT run_id runId,catalog_hash catalogHash,selected_skill_ids_json selectedSkillIdsJson,resolved_at resolvedAt FROM skill_run_contexts WHERE run_id=?`).get(runId) as any;
    if (!row) return null;
    const selected = parse(row.selectedSkillIdsJson, "skill_run_contexts.selected_skill_ids_json");
    if (!Array.isArray(selected) || selected.some((item) => typeof item !== "string")) {
      throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "skill_run_contexts.selected_skill_ids_json is not a string array");
    }
    return { runId: row.runId, catalogHash: row.catalogHash, selectedSkillIds: selected as string[], resolvedAt: row.resolvedAt };
  }

  public insertSnapshot(row: LedgerSkillSnapshotRow): LedgerSkillSnapshotRow {
    this.db.prepare(`
      INSERT INTO skill_snapshots
        (snapshot_id,run_id,skill_id,source_key,skill_version,content_hash,storage_path,manifest_json,resolved_files_json,captured_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(run_id,skill_id) DO NOTHING
    `).run(
      row.snapshotId,
      row.runId,
      row.skillId,
      row.sourceKey,
      row.skillVersion,
      row.contentHash,
      row.storagePath,
      json(row.manifest, "skill snapshot manifest"),
      json(row.files, "skill snapshot files"),
      row.capturedAt,
    );
    const persisted = this.getSnapshotByRunSkill(row.runId, row.skillId);
    if (!persisted) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `Skill snapshot insert did not persist: ${row.snapshotId}`);
    if (persisted.contentHash !== row.contentHash || persisted.sourceKey !== row.sourceKey || persisted.skillVersion !== row.skillVersion) {
      throw new StateDatabaseError("STATE_CONFLICT", `Skill snapshot already exists with different content: ${row.runId}/${row.skillId}`);
    }
    return persisted;
  }

  public getSnapshotByRunSkill(runId: string, skillId: string): LedgerSkillSnapshotRow | null {
    const row = this.db.prepare(`${SNAPSHOT_SELECT} WHERE run_id=? AND skill_id=?`).get(runId, skillId);
    return row ? snapshot(row) : null;
  }

  public listRunSnapshots(runId: string): LedgerSkillSnapshotRow[] {
    return (this.db.prepare(`${SNAPSHOT_SELECT} WHERE run_id=? ORDER BY skill_id`).all(runId) as any[]).map(snapshot);
  }
}
