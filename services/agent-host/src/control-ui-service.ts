import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type {
  ArtifactGetInput,
  ArtifactListInput,
  PublicArtifactFileView,
  PublicArtifactView,
  PublicWorkspaceView,
} from "@openrill/protocol";
import type { LedgerWorkspaceArtifactRow, LedgerWorkspaceRegistrationRow, OpenRillStateDatabase } from "@openrill/state";

const SAFE_ARTIFACT_FILE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
export const MAX_UI_ARTIFACT_FILE_BYTES = 8 * 1024 * 1024;

function mediaType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".patch")) return "text/x-diff; charset=utf-8";
  if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function publicWorkspace(row: LedgerWorkspaceRegistrationRow): PublicWorkspaceView {
  return {
    workspaceId: row.workspaceId,
    displayName: row.displayName,
    rootRevision: row.rootRevision,
    accessMode: row.accessMode,
    trustState: row.trustState,
    updatedAt: row.updatedAt,
  };
}

function assertConfined(parent: string, child: string): void {
  const rel = relative(parent, child);
  if (rel === "" || rel === ".") return;
  if (rel === ".." || rel.startsWith(`..${sep}`) || resolve(child) === resolve(parent)) {
    throw new Error("artifact path escapes its immutable directory");
  }
}

async function listArtifactFiles(row: LedgerWorkspaceArtifactRow): Promise<PublicArtifactFileView[]> {
  const root = await realpath(row.storagePath);
  const result: PublicArtifactFileView[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === "metadata.json" || !SAFE_ARTIFACT_FILE.test(entry.name)) continue;
    const absolute = await realpath(join(root, entry.name));
    assertConfined(root, absolute);
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.size > MAX_UI_ARTIFACT_FILE_BYTES) continue;
    result.push({ name: entry.name, sizeBytes: stat.size, mediaType: mediaType(entry.name) });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

async function publicArtifact(row: LedgerWorkspaceArtifactRow): Promise<PublicArtifactView> {
  return {
    artifactId: row.artifactId,
    runId: row.runId,
    attemptId: row.attemptId,
    workspaceId: row.workspaceId,
    kind: row.kind,
    relativePath: row.relativePath,
    operation: row.operation,
    beforeSha256: row.beforeSha256,
    afterSha256: row.afterSha256,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    files: await listArtifactFiles(row),
  };
}

export class ControlUiServiceError extends Error {
  public constructor(public readonly code: "ARTIFACT_NOT_FOUND", message: string) { super(message); this.name = "ControlUiServiceError"; }
}

export interface ControlUiArtifactContent {
  readonly artifactId: string;
  readonly fileName: string;
  readonly mediaType: string;
  readonly bytes: Buffer;
}

export class ControlUiService {
  public constructor(private readonly state: OpenRillStateDatabase) {}

  public listWorkspaces(): { readonly items: readonly PublicWorkspaceView[] } {
    const rows = this.state.transaction((repositories) => repositories.workspaces.listWorkspaces());
    return { items: rows.map(publicWorkspace) };
  }

  public async listArtifacts(input: ArtifactListInput): Promise<{ readonly items: readonly PublicArtifactView[] }> {
    const rows = this.state.transaction((repositories) => input.runId
      ? repositories.workspaces.listArtifacts(input.runId).slice(-Math.min(input.limit ?? 100, 100)).reverse()
      : repositories.workspaces.listRecentArtifacts(Math.min(input.limit ?? 100, 100)));
    return { items: await Promise.all(rows.map(publicArtifact)) };
  }

  public async getArtifact(input: ArtifactGetInput): Promise<PublicArtifactView> {
    const row = this.state.transaction((repositories) => repositories.workspaces.getArtifact(input.artifactId));
    if (!row) throw new ControlUiServiceError("ARTIFACT_NOT_FOUND", "artifact not found");
    return await publicArtifact(row);
  }

  public async readArtifactContent(artifactId: string, fileName: string): Promise<ControlUiArtifactContent | null> {
    if (!SAFE_ARTIFACT_FILE.test(fileName) || fileName === "metadata.json" || basename(fileName) !== fileName) return null;
    const row = this.state.transaction((repositories) => repositories.workspaces.getArtifact(artifactId));
    if (!row) return null;
    const root = await realpath(row.storagePath);
    const absoluteCandidate = join(root, fileName);
    let absolute: string;
    try { absolute = await realpath(absoluteCandidate); } catch { return null; }
    assertConfined(root, absolute);
    if (dirname(absolute) !== root) return null;
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.size > MAX_UI_ARTIFACT_FILE_BYTES) return null;
    return { artifactId, fileName, mediaType: mediaType(fileName), bytes: await readFile(absolute) };
  }
}
