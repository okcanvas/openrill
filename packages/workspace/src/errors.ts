export type WorkspaceErrorCode =
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_ROOT_INVALID"
  | "WORKSPACE_DUPLICATE_ROOT"
  | "WORKSPACE_ACCESS_DENIED"
  | "WORKSPACE_PATH_INVALID"
  | "WORKSPACE_PATH_ESCAPE"
  | "WORKSPACE_SYMLINK_ESCAPE"
  | "WORKSPACE_PATH_DENIED"
  | "WORKSPACE_SECRET_PATH_DENIED"
  | "WORKSPACE_FILE_NOT_FOUND"
  | "WORKSPACE_FILE_TYPE_UNSUPPORTED"
  | "WORKSPACE_BINARY_FILE_DENIED"
  | "WORKSPACE_FILE_TOO_LARGE"
  | "WORKSPACE_REVISION_CONFLICT"
  | "WORKSPACE_PATCH_CONFLICT";

export class WorkspaceError extends Error {
  public constructor(
    public readonly code: WorkspaceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WorkspaceError";
  }
}
