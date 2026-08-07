export type BrowserRuntimeState = "IDLE" | "LAUNCHING" | "READY" | "FAILED" | "CLOSING" | "CLOSED";
export type BrowserSessionState = "OPEN" | "CLOSING" | "CLOSED" | "CRASHED";
export type BrowserPageState = "OPEN" | "CLOSING" | "CLOSED" | "CRASHED";

export interface BrowserOwner {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly runId: string;
  readonly attemptId: string;
}

export interface BrowserRuntimeLimits {
  readonly maxSessions: number;
  readonly maxPagesPerSession: number;
  readonly launchTimeoutMs: number;
  readonly actionTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly sweepIntervalMs: number;
}

export interface BrowserNavigationPolicy {
  readonly allowPrivateNetwork: boolean;
  readonly allowedHostnames: readonly string[];
}

export interface BrowserRuntimePolicy {
  readonly navigation: BrowserNavigationPolicy;
  readonly popup: "DENY";
  readonly download: "EXPLICIT_ARTIFACT_ONLY";
  readonly persistentStorage: "DENY";
  readonly dialog: "BLOCK_AND_DISMISS";
}

export interface BrowserLaunchOptions {
  readonly headless: boolean;
  readonly executablePath?: string;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
}

export interface BrowserContextOptions {
  readonly acceptDownloads: true;
  readonly persistentStorage: false;
  readonly owner: BrowserOwner;
  /** Guard every top-level navigation request before network dispatch. */
  readonly assertNavigationAllowed: (url: string) => Promise<void>;
  /** Validate an explicit download URL before reading or persisting its bytes. */
  readonly assertDownloadAllowed: (url: string) => Promise<void>;
}

export interface BrowserNavigationResult {
  readonly url: string;
}

export interface BrowserDocumentNavigation {
  readonly url: string;
  readonly documentGeneration: number;
}

export interface BrowserPageObservationElement {
  /** Adapter-owned opaque identity. Browser Runtime maps it to a public ref. */
  readonly elementId: string;
  readonly role: string;
  readonly name: string;
  readonly interactive: boolean;
}

export interface BrowserPageObservation {
  readonly documentGeneration: number;
  readonly url: string;
  readonly title: string;
  readonly text: string;
  readonly elements: readonly BrowserPageObservationElement[];
  readonly truncated: boolean;
}

export interface BrowserPageSnapshotElement {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly interactive: boolean;
}

export interface BrowserPageSnapshot {
  readonly pageId: string;
  readonly documentGeneration: number;
  readonly url: string;
  readonly title: string;
  readonly text: string;
  readonly elements: readonly BrowserPageSnapshotElement[];
  readonly truncated: boolean;
}

export type BrowserDialogType = "alert" | "beforeunload" | "confirm" | "prompt" | "unknown";

export interface BrowserDialogObservation {
  readonly id: string;
  readonly type: BrowserDialogType;
  readonly message: string;
  readonly defaultValue?: string;
}

export type BrowserPageAction =
  | { readonly kind: "click"; readonly elementId: string }
  | { readonly kind: "type"; readonly elementId: string; readonly text: string; readonly submit: boolean }
  | { readonly kind: "press"; readonly key: string }
  | { readonly kind: "select"; readonly elementId: string; readonly values: readonly string[] }
  | { readonly kind: "fill"; readonly elementId: string; readonly value: string }
  | { readonly kind: "wait-time"; readonly timeMs: number }
  | { readonly kind: "wait-element"; readonly elementId: string }
  | { readonly kind: "wait-url"; readonly url: string };

export interface BrowserPageActionObservation {
  readonly documentGeneration: number;
  readonly url: string;
  readonly navigated: boolean;
  readonly dialog?: BrowserDialogObservation;
}

export interface BrowserPageActionResult {
  readonly pageId: string;
  readonly documentGeneration: number;
  readonly url: string;
  readonly navigated: boolean;
  readonly pageState?: BrowserPageSnapshot;
}


export type BrowserScreenshotFormat = "png" | "jpeg";

export interface BrowserPageScreenshotObservation {
  readonly documentGeneration: number;
  readonly url: string;
  readonly title: string;
  readonly format: BrowserScreenshotFormat;
  readonly bytes: Uint8Array;
}

export interface BrowserPageDownloadObservation {
  readonly documentGeneration: number;
  readonly url: string;
  readonly suggestedFilename: string;
  readonly bytes: Uint8Array;
  readonly dialog?: BrowserDialogObservation;
}

export interface BrowserEvidenceLocation {
  readonly url?: string;
  readonly lineNumber?: number;
  readonly columnNumber?: number;
}

export type BrowserEvidenceEvent =
  | {
      readonly sequence: number;
      readonly at: number;
      readonly kind: "console";
      readonly level: string;
      readonly text: string;
      readonly location?: BrowserEvidenceLocation;
    }
  | {
      readonly sequence: number;
      readonly at: number;
      readonly kind: "page_error";
      readonly name?: string;
      readonly message: string;
      readonly stack?: string;
    }
  | {
      readonly sequence: number;
      readonly at: number;
      readonly kind: "network";
      readonly method: string;
      readonly url: string;
      readonly resourceType: string;
      readonly status?: number;
      readonly ok: boolean;
      readonly failureText?: string;
    };

export interface BrowserPageEvidenceObservation {
  readonly nextSequence: number;
  readonly truncated: boolean;
  readonly events: readonly BrowserEvidenceEvent[];
}

export type BrowserArtifactKind = "BROWSER_SCREENSHOT" | "BROWSER_DOWNLOAD";

export interface BrowserArtifactReference {
  readonly artifactId: string;
  readonly kind: BrowserArtifactKind;
  readonly fileName: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface BrowserArtifactStore {
  recordScreenshot(input: {
    readonly owner: BrowserOwner;
    readonly pageId: string;
    readonly documentGeneration: number;
    readonly url: string;
    readonly title: string;
    readonly format: BrowserScreenshotFormat;
    readonly bytes: Uint8Array;
  }): Promise<BrowserArtifactReference>;
  recordDownload(input: {
    readonly owner: BrowserOwner;
    readonly pageId: string;
    readonly documentGeneration: number;
    readonly url: string;
    readonly suggestedFilename: string;
    readonly bytes: Uint8Array;
  }): Promise<BrowserArtifactReference>;
}

export interface BrowserScreenshotResult {
  readonly pageId: string;
  readonly documentGeneration: number;
  readonly url: string;
  readonly artifact: BrowserArtifactReference;
}

export interface BrowserDownloadResult {
  readonly pageId: string;
  readonly documentGeneration: number;
  readonly url: string;
  readonly artifact: BrowserArtifactReference;
}

export interface BrowserPageEvidence {
  readonly pageId: string;
  readonly nextSequence: number;
  readonly truncated: boolean;
  readonly events: readonly BrowserEvidenceEvent[];
}

export interface BrowserOutputLimits {
  readonly maxScreenshotBytes: number;
  readonly maxDownloadBytes: number;
  readonly maxEvidenceEvents: number;
}

export interface BrowserDownloadHandle {
  cancel(): Promise<void>;
}

export interface BrowserPageHandle {
  readonly id: string;
  navigate(url: string, options: { readonly signal: AbortSignal; readonly timeoutMs: number }): Promise<BrowserNavigationResult>;
  currentUrl(): Promise<string> | string;
  title(): Promise<string>;
  snapshot(options: { readonly signal: AbortSignal; readonly timeoutMs: number }): Promise<BrowserPageObservation>;
  act(action: BrowserPageAction, options: { readonly signal: AbortSignal; readonly timeoutMs: number }): Promise<BrowserPageActionObservation>;
  screenshot(format: BrowserScreenshotFormat, options: { readonly signal: AbortSignal; readonly timeoutMs: number; readonly maxBytes: number }): Promise<BrowserPageScreenshotObservation>;
  download(elementId: string, options: { readonly signal: AbortSignal; readonly timeoutMs: number; readonly maxBytes: number }): Promise<BrowserPageDownloadObservation>;
  evidence(options: { readonly afterSequence: number; readonly limit: number }): Promise<BrowserPageEvidenceObservation>;
  close(): Promise<void>;
  onPopup(listener: (page: BrowserPageHandle) => void): () => void;
  onDownload(listener: (download: BrowserDownloadHandle) => void): () => void;
  onMainFrameNavigated(listener: (navigation: BrowserDocumentNavigation) => void): () => void;
}

export interface BrowserContextHandle {
  readonly id: string;
  newPage(): Promise<BrowserPageHandle>;
  close(): Promise<void>;
}

export interface BrowserProcessHandle {
  readonly id: string;
  createContext(options: BrowserContextOptions): Promise<BrowserContextHandle>;
  close(): Promise<void>;
  onDisconnected(listener: (reason?: unknown) => void): () => void;
}

export interface BrowserDriver {
  launch(options: BrowserLaunchOptions): Promise<BrowserProcessHandle>;
  dispose?(): Promise<void>;
}

export interface BrowserSessionView {
  readonly sessionId: string;
  readonly owner: BrowserOwner;
  readonly state: BrowserSessionState;
  readonly generation: number;
  readonly createdAt: number;
  readonly lastUsedAt: number;
  readonly pageCount: number;
}

export interface BrowserPageView {
  readonly pageId: string;
  readonly sessionId: string;
  readonly state: BrowserPageState;
  readonly generation: number;
  readonly documentGeneration: number;
  readonly createdAt: number;
  readonly lastUsedAt: number;
  readonly url: string;
}

export interface BrowserRuntimeSnapshot {
  readonly state: BrowserRuntimeState;
  readonly generation: number;
  readonly sessionCount: number;
  readonly pageCount: number;
  readonly sessions: readonly BrowserSessionView[];
  readonly events: readonly BrowserRuntimeEvent[];
}

export type BrowserRuntimeEventKind =
  | "browser.launched"
  | "browser.disconnected"
  | "browser.closed"
  | "session.opened"
  | "session.closed"
  | "session.idle_closed"
  | "session.run_cancelled"
  | "page.opened"
  | "page.closed"
  | "page.popup_denied"
  | "page.download_denied"
  | "page.document_invalidated"
  | "navigation.completed"
  | "snapshot.completed"
  | "action.completed"
  | "action.navigation_completed"
  | "action.dialog_blocked"
  | "action.stale_ref_recovered"
  | "screenshot.artifact_created"
  | "download.artifact_created"
  | "evidence.completed"
  | "runtime.failed";

export interface BrowserRuntimeEvent {
  readonly sequence: number;
  readonly at: number;
  readonly kind: BrowserRuntimeEventKind;
  readonly sessionId?: string;
  readonly pageId?: string;
  readonly runId?: string;
  readonly detail?: string;
}

export interface BrowserRuntimeOptions {
  readonly driver: BrowserDriver;
  readonly limits: BrowserRuntimeLimits;
  readonly policy: BrowserRuntimePolicy;
  readonly headless: boolean;
  readonly executablePath?: string;
  readonly now?: () => number;
  readonly createId?: () => string;
  readonly lookup?: BrowserHostnameLookup;
  readonly artifacts?: BrowserArtifactStore;
  readonly outputLimits?: Partial<BrowserOutputLimits>;
}

export interface BrowserHostnameLookupResult {
  readonly address: string;
  readonly family: 4 | 6;
}

export type BrowserHostnameLookup = (hostname: string) => Promise<readonly BrowserHostnameLookupResult[]>;
