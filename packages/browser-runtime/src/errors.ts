import type { BrowserDialogObservation, BrowserPageSnapshot } from "./types.js";

export type BrowserRuntimeErrorCode =
  | "BROWSER_RUNTIME_CLOSING"
  | "BROWSER_RUNTIME_CLOSED"
  | "BROWSER_LAUNCH_FAILED"
  | "BROWSER_LAUNCH_TIMEOUT"
  | "BROWSER_SESSION_LIMIT"
  | "BROWSER_PAGE_LIMIT"
  | "BROWSER_SESSION_NOT_FOUND"
  | "BROWSER_PAGE_NOT_FOUND"
  | "BROWSER_STALE_HANDLE"
  | "BROWSER_STALE_REF"
  | "BROWSER_ACTION_FAILED"
  | "BROWSER_SCREENSHOT_FAILED"
  | "BROWSER_DOWNLOAD_FAILED"
  | "BROWSER_EVIDENCE_FAILED"
  | "BROWSER_ARTIFACT_STORE_UNAVAILABLE"
  | "BROWSER_ARTIFACT_FAILED"
  | "BROWSER_OUTPUT_TOO_LARGE"
  | "BROWSER_DIALOG_BLOCKED"
  | "BROWSER_OPERATION_ABORTED"
  | "BROWSER_OPERATION_TIMEOUT"
  | "BROWSER_NAVIGATION_BLOCKED";

export interface BrowserRuntimeErrorDetails {
  readonly recoverySnapshot?: BrowserPageSnapshot;
  readonly dialog?: BrowserDialogObservation;
}

export interface BrowserRuntimeErrorOptions extends ErrorOptions {
  readonly details?: BrowserRuntimeErrorDetails;
}

export class BrowserRuntimeError extends Error {
  public readonly details: BrowserRuntimeErrorDetails | undefined;

  public constructor(
    public readonly code: BrowserRuntimeErrorCode,
    message: string,
    options?: BrowserRuntimeErrorOptions,
  ) {
    super(message, options);
    this.name = "BrowserRuntimeError";
    this.details = options?.details;
  }
}
