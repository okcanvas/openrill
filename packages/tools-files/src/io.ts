import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, open, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ResolvedWorkspacePath, WorkspaceCatalog } from "@openrill/workspace";
import { WorkspaceError } from "@openrill/workspace";
import { decodeWorkspaceText, revisionForBytes } from "./text.js";

export interface CurrentTextFile {
  readonly content: string | null;
  readonly bytes: Uint8Array | null;
  readonly revision: string;
  readonly modifiedAtMs: number | null;
  readonly mode: number | null;
}

export async function readCurrentTextFile(path: ResolvedWorkspacePath, maxFileBytes: number): Promise<CurrentTextFile> {
  if (!path.exists) return { content: null, bytes: null, revision: "MISSING", modifiedAtMs: null, mode: null };
  const details = await stat(path.absolutePath);
  if (!details.isFile()) throw new WorkspaceError("WORKSPACE_FILE_TYPE_UNSUPPORTED", `workspace path is not a regular file: ${path.relativePath}`);
  if (details.size > maxFileBytes) throw new WorkspaceError("WORKSPACE_FILE_TOO_LARGE", `workspace file exceeds ${maxFileBytes} bytes: ${path.relativePath}`);
  const bytes = await readFile(path.absolutePath);
  return {
    content: decodeWorkspaceText(bytes, path.relativePath),
    bytes,
    revision: revisionForBytes(bytes),
    modifiedAtMs: details.mtimeMs,
    mode: details.mode,
  };
}

export function assertExpectedRevision(
  current: CurrentTextFile,
  expectedRevision: string,
  expectedModifiedAtMs?: number,
): void {
  if (current.revision !== expectedRevision) {
    throw new WorkspaceError("WORKSPACE_REVISION_CONFLICT", `workspace file revision conflict: expected ${expectedRevision}, current ${current.revision}`);
  }
  if (expectedModifiedAtMs !== undefined && current.modifiedAtMs !== expectedModifiedAtMs) {
    throw new WorkspaceError("WORKSPACE_REVISION_CONFLICT", `workspace file modification time conflict: expected ${expectedModifiedAtMs}, current ${current.modifiedAtMs}`);
  }
}

async function fsyncDirectoryBestEffort(pathname: string): Promise<void> {
  if (process.platform === "win32") return;
  try {
    const handle = await open(pathname, constants.O_RDONLY);
    try { await handle.sync(); } finally { await handle.close(); }
  } catch {
    // Directory fsync is not portable; the file itself was already synced.
  }
}

export async function atomicWriteWorkspaceText(input: {
  readonly catalog: WorkspaceCatalog;
  readonly path: ResolvedWorkspacePath;
  readonly content: string;
  readonly expectedRevision: string;
  readonly expectedModifiedAtMs?: number;
  readonly maxFileBytes: number;
}): Promise<{ readonly before: CurrentTextFile; readonly after: CurrentTextFile }> {
  const contentBytes = Buffer.from(input.content, "utf8");
  if (contentBytes.byteLength > input.maxFileBytes) {
    throw new WorkspaceError("WORKSPACE_FILE_TOO_LARGE", `workspace write exceeds ${input.maxFileBytes} bytes: ${input.path.relativePath}`);
  }
  const before = await readCurrentTextFile(input.path, input.maxFileBytes);
  assertExpectedRevision(before, input.expectedRevision, input.expectedModifiedAtMs);
  const parent = dirname(input.path.absolutePath);
  const parentRelativePath = dirname(input.path.relativePath).replaceAll("\\", "/");
  const parentPath = await input.catalog.resolve(
    input.path.workspaceId,
    parentRelativePath === "." ? "." : parentRelativePath,
    "WRITE",
    { allowRoot: true, mustExist: true },
  );
  const parentDetails = await stat(parentPath.absolutePath);
  if (!parentDetails.isDirectory()) {
    throw new WorkspaceError("WORKSPACE_FILE_TYPE_UNSUPPORTED", `workspace parent is not a directory: ${parentRelativePath}`);
  }
  await input.catalog.revalidateForWrite(input.path);
  const temp = join(parent, `.${basename(input.path.absolutePath)}.openrill-tmp-${process.pid}-${randomUUID()}`);
  let tempCreated = false;
  try {
    const handle = await open(temp, "wx", before.mode === null ? 0o600 : before.mode & 0o777);
    tempCreated = true;
    try {
      await handle.writeFile(contentBytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await input.catalog.revalidateForWrite(input.path);
    const latestResolved = await input.catalog.resolve(input.path.workspaceId, input.path.relativePath, "WRITE", { mustExist: false });
    const latest = await readCurrentTextFile(latestResolved, input.maxFileBytes);
    assertExpectedRevision(latest, input.expectedRevision, input.expectedModifiedAtMs);
    await rename(temp, input.path.absolutePath);
    tempCreated = false;
    if (before.mode !== null) await chmod(input.path.absolutePath, before.mode & 0o777).catch(() => undefined);
    await fsyncDirectoryBestEffort(parent);
    const refreshed = await input.catalog.resolve(input.path.workspaceId, input.path.relativePath, "READ", { mustExist: true });
    const after = await readCurrentTextFile(refreshed, input.maxFileBytes);
    return { before, after };
  } finally {
    if (tempCreated) await rm(temp, { force: true }).catch(() => undefined);
  }
}
