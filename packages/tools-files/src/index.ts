/** OpenRill bounded workspace file Tool catalogue. */
export const PACKAGE_NAME = "@openrill/tools-files" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "TOOLS_FILES" as const;

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}

export { createWorkspaceArtifactStore } from "./artifacts.js";
export { atomicWriteWorkspaceText, assertExpectedRevision, readCurrentTextFile, type CurrentTextFile } from "./io.js";
export { withWorkspaceFileMutation } from "./mutation-queue.js";
export { buildCompactDiff, countOccurrences, decodeWorkspaceText, revisionForBytes, revisionForText } from "./text.js";
export { DEFAULT_WORKSPACE_FILE_TOOL_LIMITS, createWorkspaceFileTools, registerWorkspaceFileTools } from "./tools.js";
export type {
  WorkspaceArtifactMetadata,
  WorkspaceArtifactMetadataSink,
  WorkspaceArtifactReference,
  WorkspaceArtifactStore,
  WorkspaceFileToolLimits,
} from "./types.js";
