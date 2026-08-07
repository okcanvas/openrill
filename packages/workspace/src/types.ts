export type WorkspaceAccessMode = "READ_ONLY" | "READ_WRITE";
export type WorkspaceTrustState = "CONFIGURED_LOCAL";
export type WorkspacePathIntent = "READ" | "LIST" | "SEARCH" | "WRITE";
export type WorkspaceEntryKind = "FILE" | "DIRECTORY" | "SYMLINK" | "OTHER";

export interface WorkspaceRegistrationInput {
  readonly id: string;
  readonly path: string;
  readonly readOnly?: boolean;
  readonly displayName?: string;
}

export interface WorkspaceDescriptor {
  readonly workspaceId: string;
  readonly displayName: string;
  readonly accessMode: WorkspaceAccessMode;
  readonly trustState: WorkspaceTrustState;
  readonly rootRevision: string;
}

export interface WorkspaceInternalDescriptor extends WorkspaceDescriptor {
  readonly configuredPath: string;
  readonly canonicalRoot: string;
}

export interface WorkspaceFileReference {
  readonly workspaceId: string;
  readonly relativePath: string;
}

export interface ResolvedWorkspacePath extends WorkspaceFileReference {
  readonly absolutePath: string;
  readonly workspace: WorkspaceInternalDescriptor;
  readonly exists: boolean;
  readonly kind: WorkspaceEntryKind | "MISSING";
  readonly viaSymlink: boolean;
}
