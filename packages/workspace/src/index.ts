/** OpenRill configured workspace identity and path-confinement boundary. */
export const PACKAGE_NAME = "@openrill/workspace" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "WORKSPACE" as const;

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}

export { WorkspaceCatalog, createWorkspaceCatalog, type WorkspaceCatalogOptions } from "./catalog.js";
export { WorkspaceError, type WorkspaceErrorCode } from "./errors.js";
export { assertWorkspacePathPolicy, isWorkspacePathVisible, normalizeWorkspaceRelativePath } from "./path-policy.js";
export type {
  ResolvedWorkspacePath,
  WorkspaceAccessMode,
  WorkspaceDescriptor,
  WorkspaceEntryKind,
  WorkspaceFileReference,
  WorkspaceInternalDescriptor,
  WorkspacePathIntent,
  WorkspaceRegistrationInput,
  WorkspaceTrustState,
} from "./types.js";
