export type PlaywrightAdapterErrorCode =
  | "OPENRILL_CHROMIUM_EXECUTABLE_INVALID"
  | "OPENRILL_CHROMIUM_EXECUTABLE_NOT_FOUND"
  | "OPENRILL_PLAYWRIGHT_CORE_UNAVAILABLE"
  | "OPENRILL_PLAYWRIGHT_LAUNCH_FAILED"
  | "OPENRILL_PLAYWRIGHT_DOCUMENT_CHANGED"
  | "OPENRILL_PLAYWRIGHT_ELEMENT_ID_INVALID"
  | "OPENRILL_PLAYWRIGHT_DOWNLOAD_STREAM_UNAVAILABLE"
  | "OPENRILL_PLAYWRIGHT_DOWNLOAD_TOO_LARGE"
  | "OPENRILL_PLAYWRIGHT_SCREENSHOT_TOO_LARGE"
  | "OPENRILL_PLAYWRIGHT_DOWNLOAD_BUSY"
  | "OPENRILL_PLAYWRIGHT_PAGE_CLOSED";

export class PlaywrightAdapterError extends Error {
  public constructor(
    public readonly code: PlaywrightAdapterErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PlaywrightAdapterError";
  }
}
