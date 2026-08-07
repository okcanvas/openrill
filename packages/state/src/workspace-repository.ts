import type { DatabaseSync } from "node:sqlite";

export type LedgerWorkspaceAccessMode = "READ_ONLY" | "READ_WRITE";
export type LedgerWorkspaceTrustState = "CONFIGURED_LOCAL";
export type LedgerWorkspaceArtifactKind = "READ_OUTPUT" | "SEARCH_OUTPUT" | "FILE_CHANGE" | "BROWSER_SCREENSHOT" | "BROWSER_DOWNLOAD";

export interface LedgerWorkspaceRegistrationRow {
  readonly workspaceId: string;
  readonly displayName: string;
  readonly canonicalRoot: string;
  readonly rootRevision: string;
  readonly accessMode: LedgerWorkspaceAccessMode;
  readonly trustState: LedgerWorkspaceTrustState;
  readonly updatedAt: number;
}

export interface LedgerWorkspaceArtifactRow {
  readonly artifactId: string;
  readonly runId: string;
  readonly attemptId: string;
  readonly workspaceId: string;
  readonly kind: LedgerWorkspaceArtifactKind;
  readonly relativePath: string | null;
  readonly operation: string;
  readonly beforeSha256: string | null;
  readonly afterSha256: string | null;
  readonly storagePath: string;
  readonly sizeBytes: number;
  readonly createdAt: number;
}

export class StateWorkspaceRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public upsertWorkspace(input: LedgerWorkspaceRegistrationRow): void {
    this.database.prepare(`
      INSERT INTO workspace_registrations
        (workspace_id, display_name, canonical_root, root_revision, access_mode, trust_state, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        display_name = excluded.display_name,
        canonical_root = excluded.canonical_root,
        root_revision = excluded.root_revision,
        access_mode = excluded.access_mode,
        trust_state = excluded.trust_state,
        updated_at = excluded.updated_at
    `).run(
      input.workspaceId,
      input.displayName,
      input.canonicalRoot,
      input.rootRevision,
      input.accessMode,
      input.trustState,
      input.updatedAt,
    );
  }

  public getWorkspace(workspaceId: string): LedgerWorkspaceRegistrationRow | null {
    const row = this.database.prepare(`
      SELECT workspace_id AS workspaceId, display_name AS displayName,
             canonical_root AS canonicalRoot, root_revision AS rootRevision,
             access_mode AS accessMode, trust_state AS trustState, updated_at AS updatedAt
      FROM workspace_registrations WHERE workspace_id = ?
    `).get(workspaceId) as LedgerWorkspaceRegistrationRow | undefined;
    return row ?? null;
  }

  public listWorkspaces(): LedgerWorkspaceRegistrationRow[] {
    return this.database.prepare(`
      SELECT workspace_id AS workspaceId, display_name AS displayName,
             canonical_root AS canonicalRoot, root_revision AS rootRevision,
             access_mode AS accessMode, trust_state AS trustState, updated_at AS updatedAt
      FROM workspace_registrations ORDER BY workspace_id
    `).all() as unknown as LedgerWorkspaceRegistrationRow[];
  }

  public insertArtifact(input: LedgerWorkspaceArtifactRow): void {
    this.database.prepare(`
      INSERT INTO workspace_artifacts
        (artifact_id, run_id, attempt_id, workspace_id, kind, relative_path,
         operation, before_sha256, after_sha256, storage_path, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.artifactId,
      input.runId,
      input.attemptId,
      input.workspaceId,
      input.kind,
      input.relativePath,
      input.operation,
      input.beforeSha256,
      input.afterSha256,
      input.storagePath,
      input.sizeBytes,
      input.createdAt,
    );
  }

  public getArtifact(artifactId: string): LedgerWorkspaceArtifactRow | null {
    const row = this.database.prepare(`
      SELECT artifact_id AS artifactId, run_id AS runId, attempt_id AS attemptId,
             workspace_id AS workspaceId, kind, relative_path AS relativePath,
             operation, before_sha256 AS beforeSha256, after_sha256 AS afterSha256,
             storage_path AS storagePath, size_bytes AS sizeBytes, created_at AS createdAt
      FROM workspace_artifacts WHERE artifact_id = ?
    `).get(artifactId) as LedgerWorkspaceArtifactRow | undefined;
    return row ?? null;
  }

  public listRecentArtifacts(limit = 100): LedgerWorkspaceArtifactRow[] {
    return this.database.prepare(`
      SELECT artifact_id AS artifactId, run_id AS runId, attempt_id AS attemptId,
             workspace_id AS workspaceId, kind, relative_path AS relativePath,
             operation, before_sha256 AS beforeSha256, after_sha256 AS afterSha256,
             storage_path AS storagePath, size_bytes AS sizeBytes, created_at AS createdAt
      FROM workspace_artifacts ORDER BY created_at DESC, artifact_id DESC LIMIT ?
    `).all(limit) as unknown as LedgerWorkspaceArtifactRow[];
  }

  public listArtifacts(runId: string): LedgerWorkspaceArtifactRow[] {
    return this.database.prepare(`
      SELECT artifact_id AS artifactId, run_id AS runId, attempt_id AS attemptId,
             workspace_id AS workspaceId, kind, relative_path AS relativePath,
             operation, before_sha256 AS beforeSha256, after_sha256 AS afterSha256,
             storage_path AS storagePath, size_bytes AS sizeBytes, created_at AS createdAt
      FROM workspace_artifacts WHERE run_id = ? ORDER BY created_at, artifact_id
    `).all(runId) as unknown as LedgerWorkspaceArtifactRow[];
  }
}
