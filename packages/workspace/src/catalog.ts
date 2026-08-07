import { createHash } from "node:crypto";
import { lstat, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { WorkspaceError } from "./errors.js";
import { assertWorkspacePathPolicy, normalizeWorkspaceRelativePath } from "./path-policy.js";
import type {
  ResolvedWorkspacePath,
  WorkspaceDescriptor,
  WorkspaceEntryKind,
  WorkspaceInternalDescriptor,
  WorkspacePathIntent,
  WorkspaceRegistrationInput,
} from "./types.js";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function contains(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function kindOf(value: Awaited<ReturnType<typeof lstat>>): WorkspaceEntryKind {
  if (value.isFile()) return "FILE";
  if (value.isDirectory()) return "DIRECTORY";
  if (value.isSymbolicLink()) return "SYMLINK";
  return "OTHER";
}

async function exists(pathname: string): Promise<boolean> {
  try {
    await lstat(pathname);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

export interface WorkspaceCatalogOptions {
  readonly baseDirectory?: string;
}

export class WorkspaceCatalog {
  readonly #workspaces: ReadonlyMap<string, WorkspaceInternalDescriptor>;

  private constructor(workspaces: ReadonlyMap<string, WorkspaceInternalDescriptor>) {
    this.#workspaces = workspaces;
  }

  public static async create(
    registrations: readonly WorkspaceRegistrationInput[],
    options: WorkspaceCatalogOptions = {},
  ): Promise<WorkspaceCatalog> {
    const byId = new Map<string, WorkspaceInternalDescriptor>();
    const roots = new Map<string, string>();
    for (const registration of registrations) {
      if (!/^[a-z][a-z0-9._-]{0,63}$/.test(registration.id)) {
        throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `invalid workspace id: ${registration.id}`);
      }
      if (byId.has(registration.id)) throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `duplicate workspace id: ${registration.id}`);
      const configuredPath = resolve(options.baseDirectory ?? process.cwd(), registration.path);
      let canonicalRoot: string;
      try {
        const rootStat = await stat(configuredPath);
        if (!rootStat.isDirectory()) throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `workspace root is not a directory: ${registration.id}`);
        canonicalRoot = await realpath(configuredPath);
      } catch (error) {
        if (error instanceof WorkspaceError) throw error;
        throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `workspace root is unavailable: ${registration.id}`, { cause: error });
      }
      const duplicate = roots.get(canonicalRoot);
      if (duplicate) {
        throw new WorkspaceError("WORKSPACE_DUPLICATE_ROOT", `workspace roots resolve to the same directory: ${duplicate}, ${registration.id}`);
      }
      roots.set(canonicalRoot, registration.id);
      byId.set(registration.id, {
        workspaceId: registration.id,
        displayName: registration.displayName?.trim() || registration.id,
        configuredPath,
        canonicalRoot,
        accessMode: registration.readOnly ? "READ_ONLY" : "READ_WRITE",
        trustState: "CONFIGURED_LOCAL",
        rootRevision: sha256(canonicalRoot),
      });
    }
    return new WorkspaceCatalog(byId);
  }

  public list(): WorkspaceDescriptor[] {
    return [...this.#workspaces.values()]
      .map(({ workspaceId, displayName, accessMode, trustState, rootRevision }) => ({ workspaceId, displayName, accessMode, trustState, rootRevision }))
      .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
  }

  public internal(workspaceId: string): WorkspaceInternalDescriptor {
    const workspace = this.#workspaces.get(workspaceId);
    if (!workspace) throw new WorkspaceError("WORKSPACE_NOT_FOUND", `workspace is not registered: ${workspaceId}`);
    return workspace;
  }

  public has(workspaceId: string): boolean {
    return this.#workspaces.has(workspaceId);
  }

  public async resolve(
    workspaceId: string,
    rawRelativePath: string,
    intent: WorkspacePathIntent,
    options: { readonly allowRoot?: boolean; readonly mustExist?: boolean } = {},
  ): Promise<ResolvedWorkspacePath> {
    const workspace = this.internal(workspaceId);
    if (intent === "WRITE" && workspace.accessMode !== "READ_WRITE") {
      throw new WorkspaceError("WORKSPACE_ACCESS_DENIED", `workspace is read-only: ${workspaceId}`);
    }
    const relativePath = normalizeWorkspaceRelativePath(rawRelativePath, { ...(options.allowRoot !== undefined ? { allowRoot: options.allowRoot } : {}) });
    if (relativePath) assertWorkspacePathPolicy(relativePath);
    const absolutePath = relativePath ? join(workspace.canonicalRoot, ...relativePath.split("/")) : workspace.canonicalRoot;
    if (!contains(workspace.canonicalRoot, absolutePath)) {
      throw new WorkspaceError("WORKSPACE_PATH_ESCAPE", `workspace path escapes root: ${relativePath}`);
    }
    const present = await exists(absolutePath);
    if (!present) {
      if (options.mustExist) throw new WorkspaceError("WORKSPACE_FILE_NOT_FOUND", `workspace path does not exist: ${relativePath}`);
      await this.#assertExistingAncestorContained(workspace, absolutePath);
      return { workspaceId, relativePath, absolutePath, workspace, exists: false, kind: "MISSING", viaSymlink: false };
    }
    const linkStat = await lstat(absolutePath);
    let canonicalTarget: string;
    try {
      canonicalTarget = await realpath(absolutePath);
    } catch (error) {
      throw new WorkspaceError("WORKSPACE_FILE_NOT_FOUND", `workspace path cannot be resolved: ${relativePath}`, { cause: error });
    }
    if (!contains(workspace.canonicalRoot, canonicalTarget)) {
      throw new WorkspaceError("WORKSPACE_SYMLINK_ESCAPE", `workspace path resolves outside root: ${relativePath}`);
    }
    return {
      workspaceId,
      relativePath,
      absolutePath,
      workspace,
      exists: true,
      kind: kindOf(linkStat),
      viaSymlink: linkStat.isSymbolicLink() || canonicalTarget !== absolutePath,
    };
  }

  public async revalidateForWrite(resolvedPath: ResolvedWorkspacePath): Promise<void> {
    if (resolvedPath.workspace.accessMode !== "READ_WRITE") {
      throw new WorkspaceError("WORKSPACE_ACCESS_DENIED", `workspace is read-only: ${resolvedPath.workspaceId}`);
    }
    await this.#assertExistingAncestorContained(resolvedPath.workspace, resolvedPath.absolutePath);
    if (await exists(resolvedPath.absolutePath)) {
      const target = await realpath(resolvedPath.absolutePath);
      if (!contains(resolvedPath.workspace.canonicalRoot, target)) {
        throw new WorkspaceError("WORKSPACE_SYMLINK_ESCAPE", `workspace path resolves outside root: ${resolvedPath.relativePath}`);
      }
    }
  }

  async #assertExistingAncestorContained(workspace: WorkspaceInternalDescriptor, absolutePath: string): Promise<void> {
    let current = absolutePath;
    while (!(await exists(current))) {
      const parent = resolve(current, "..");
      if (parent === current || !contains(workspace.canonicalRoot, parent)) {
        throw new WorkspaceError("WORKSPACE_PATH_ESCAPE", "workspace write ancestor escapes root");
      }
      current = parent;
    }
    const canonicalAncestor = await realpath(current);
    if (!contains(workspace.canonicalRoot, canonicalAncestor)) {
      throw new WorkspaceError("WORKSPACE_SYMLINK_ESCAPE", "workspace write ancestor resolves outside root");
    }
  }
}

export async function createWorkspaceCatalog(
  registrations: readonly WorkspaceRegistrationInput[],
  options: WorkspaceCatalogOptions = {},
): Promise<WorkspaceCatalog> {
  return WorkspaceCatalog.create(registrations, options);
}
