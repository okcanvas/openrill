import type { ToolExecutionContext } from "@openrill/tool-runtime";
import type { WorkspaceFileReference } from "@openrill/workspace";

export interface WorkspaceFileToolLimits {
  readonly maxFileBytes: number;
  readonly maxReadBytes: number;
  readonly maxReadLines: number;
  readonly maxListEntries: number;
  readonly maxSearchFiles: number;
  readonly maxSearchMatches: number;
  readonly maxSearchBytes: number;
  readonly maxPatchReplacements: number;
  readonly maxArtifactBytes: number;
}

export interface WorkspaceArtifactReference {
  readonly artifactId: string;
  readonly kind: "READ_OUTPUT" | "SEARCH_OUTPUT" | "FILE_CHANGE" | "BROWSER_SCREENSHOT" | "BROWSER_DOWNLOAD";
}

export interface WorkspaceArtifactMetadata {
  readonly artifactId: string;
  readonly runId: string;
  readonly attemptId: string;
  readonly workspaceId: string;
  readonly kind: WorkspaceArtifactReference["kind"];
  readonly relativePath: string | null;
  readonly operation: string;
  readonly beforeSha256: string | null;
  readonly afterSha256: string | null;
  readonly storagePath: string;
  readonly sizeBytes: number;
  readonly createdAt: number;
}

export interface WorkspaceArtifactMetadataSink {
  recordArtifact(metadata: WorkspaceArtifactMetadata): void;
}

export interface WorkspaceArtifactStore {
  recordRead(input: {
    readonly context: ToolExecutionContext;
    readonly ref: WorkspaceFileReference;
    readonly content: string;
    readonly revision: string;
  }): Promise<WorkspaceArtifactReference>;
  recordSearch(input: {
    readonly context: ToolExecutionContext;
    readonly workspaceId: string;
    readonly query: string;
    readonly output: unknown;
  }): Promise<WorkspaceArtifactReference>;
  recordChange(input: {
    readonly context: ToolExecutionContext;
    readonly ref: WorkspaceFileReference;
    readonly operation: "WRITE" | "PATCH";
    readonly before: string | null;
    readonly after: string;
    readonly beforeRevision: string;
    readonly afterRevision: string;
    readonly diff: string;
  }): Promise<WorkspaceArtifactReference>;
  recordScreenshot(input: {
    readonly owner: { readonly runId: string; readonly attemptId: string; readonly workspaceId: string };
    readonly pageId: string;
    readonly documentGeneration: number;
    readonly url: string;
    readonly title: string;
    readonly format: "png" | "jpeg";
    readonly bytes: Uint8Array;
  }): Promise<{ readonly artifactId: string; readonly kind: "BROWSER_SCREENSHOT"; readonly fileName: string; readonly mediaType: string; readonly sizeBytes: number; readonly sha256: string }>;
  recordDownload(input: {
    readonly owner: { readonly runId: string; readonly attemptId: string; readonly workspaceId: string };
    readonly pageId: string;
    readonly documentGeneration: number;
    readonly url: string;
    readonly suggestedFilename: string;
    readonly bytes: Uint8Array;
  }): Promise<{ readonly artifactId: string; readonly kind: "BROWSER_DOWNLOAD"; readonly fileName: string; readonly mediaType: string; readonly sizeBytes: number; readonly sha256: string }>;
}

