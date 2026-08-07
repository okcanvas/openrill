export interface UiSnapshotInput {}
export interface WorkspaceListInput {}
export interface ArtifactListInput { readonly runId?: string; readonly limit?: number; }
export interface ArtifactGetInput { readonly artifactId: string; }

export interface PublicWorkspaceView {
  readonly workspaceId: string;
  readonly displayName: string;
  readonly rootRevision: string;
  readonly accessMode: "READ_ONLY" | "READ_WRITE";
  readonly trustState: "CONFIGURED_LOCAL";
  readonly updatedAt: number;
}

export interface PublicArtifactFileView {
  readonly name: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
}

export interface PublicArtifactView {
  readonly artifactId: string;
  readonly runId: string;
  readonly attemptId: string;
  readonly workspaceId: string;
  readonly kind: "READ_OUTPUT" | "SEARCH_OUTPUT" | "FILE_CHANGE" | "BROWSER_SCREENSHOT" | "BROWSER_DOWNLOAD";
  readonly relativePath: string | null;
  readonly operation: string;
  readonly beforeSha256: string | null;
  readonly afterSha256: string | null;
  readonly sizeBytes: number;
  readonly createdAt: number;
  readonly files: readonly PublicArtifactFileView[];
}
