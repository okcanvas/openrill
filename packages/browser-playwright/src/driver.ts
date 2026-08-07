import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type {
  BrowserContextHandle,
  BrowserContextOptions,
  BrowserDialogObservation,
  BrowserEvidenceEvent,
  BrowserDialogType,
  BrowserDocumentNavigation,
  BrowserDownloadHandle,
  BrowserDriver,
  BrowserLaunchOptions,
  BrowserPageAction,
  BrowserPageActionObservation,
  BrowserPageDownloadObservation,
  BrowserPageEvidenceObservation,
  BrowserPageHandle,
  BrowserPageObservation,
  BrowserPageScreenshotObservation,
  BrowserScreenshotFormat,
  BrowserProcessHandle,
} from "@openrill/browser-runtime";
import { PlaywrightAdapterError } from "./errors.js";
import { resolveChromiumExecutable, type ChromiumExecutableOptions, type ChromiumExecutableResolution } from "./executable.js";

interface PlaywrightDownload {
  cancel(): Promise<void>;
  url(): string;
  suggestedFilename(): string;
  createReadStream(): Promise<AsyncIterable<Uint8Array | string> | null>;
}
interface PlaywrightConsoleMessage {
  type(): string;
  text(): string;
  location(): { url?: string; lineNumber?: number; columnNumber?: number };
}
interface PlaywrightResponse {
  request(): PlaywrightRequest;
  status(): number;
  ok(): boolean;
}
interface PlaywrightDialog {
  type(): string;
  message(): string;
  defaultValue(): string;
  dismiss(): Promise<void>;
}
interface PlaywrightFrame {
  parentFrame(): PlaywrightFrame | null;
  page(): PlaywrightPage;
}
interface PlaywrightRequest {
  url(): string;
  method(): string;
  resourceType(): string;
  failure(): { errorText?: string } | null;
  isNavigationRequest(): boolean;
  frame(): PlaywrightFrame;
}
interface PlaywrightRoute {
  request(): PlaywrightRequest;
  continue(): Promise<void>;
  abort(errorCode?: string): Promise<void>;
}
interface PlaywrightLocator {
  innerText(options?: { timeout?: number }): Promise<string>;
  click(options?: { timeout?: number }): Promise<void>;
  type(text: string, options?: { timeout?: number }): Promise<void>;
  press(key: string, options?: { timeout?: number }): Promise<void>;
  fill(value: string, options?: { timeout?: number }): Promise<void>;
  selectOption(values: readonly string[], options?: { timeout?: number }): Promise<unknown>;
  waitFor(options?: { state?: "visible"; timeout?: number }): Promise<void>;
}
interface PlaywrightKeyboard { press(key: string, options?: { delay?: number }): Promise<void>; }
interface PlaywrightPage {
  goto(url: string, options?: { timeout?: number; waitUntil?: "domcontentloaded" }): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
  ariaSnapshot(options?: { mode?: "ai"; timeout?: number }): Promise<string>;
  close(): Promise<void>;
  isClosed(): boolean;
  mainFrame(): PlaywrightFrame;
  locator(selector: string): PlaywrightLocator;
  keyboard: PlaywrightKeyboard;
  waitForURL(url: string, options?: { timeout?: number; waitUntil?: "domcontentloaded" }): Promise<void>;
  evaluate(expression: string): Promise<unknown>;
  screenshot(options: { type: BrowserScreenshotFormat; fullPage: false; timeout: number; animations: "disabled"; caret: "hide"; scale: "css" }): Promise<Uint8Array>;
  on(event: "popup", listener: (page: PlaywrightPage) => void): void;
  on(event: "download", listener: (download: PlaywrightDownload) => void): void;
  on(event: "dialog", listener: (dialog: PlaywrightDialog) => void): void;
  on(event: "framenavigated", listener: (frame: PlaywrightFrame) => void): void;
  on(event: "console", listener: (message: PlaywrightConsoleMessage) => void): void;
  on(event: "pageerror", listener: (error: Error) => void): void;
  on(event: "request", listener: (request: PlaywrightRequest) => void): void;
  on(event: "response", listener: (response: PlaywrightResponse) => void): void;
  on(event: "requestfailed", listener: (request: PlaywrightRequest) => void): void;
  off(event: "popup", listener: (page: PlaywrightPage) => void): void;
  off(event: "download", listener: (download: PlaywrightDownload) => void): void;
  off(event: "dialog", listener: (dialog: PlaywrightDialog) => void): void;
  off(event: "framenavigated", listener: (frame: PlaywrightFrame) => void): void;
  off(event: "console", listener: (message: PlaywrightConsoleMessage) => void): void;
  off(event: "pageerror", listener: (error: Error) => void): void;
  off(event: "request", listener: (request: PlaywrightRequest) => void): void;
  off(event: "response", listener: (response: PlaywrightResponse) => void): void;
  off(event: "requestfailed", listener: (request: PlaywrightRequest) => void): void;
}
interface PlaywrightContext {
  newPage(): Promise<PlaywrightPage>;
  route(url: string, handler: (route: PlaywrightRoute) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}
interface PlaywrightBrowser {
  newContext(options: { acceptDownloads: true }): Promise<PlaywrightContext>;
  close(): Promise<void>;
  on(event: "disconnected", listener: () => void): void;
  off(event: "disconnected", listener: () => void): void;
}
interface PlaywrightModule {
  readonly chromium: {
    launch(options: { executablePath: string; headless: boolean; timeout: number; args: readonly string[] }): Promise<PlaywrightBrowser>;
  };
}

const INTERACTIVE_ROLES = new Set([
  "button", "checkbox", "combobox", "gridcell", "link", "listbox", "menuitem", "menuitemcheckbox",
  "menuitemradio", "option", "radio", "searchbox", "slider", "spinbutton", "switch", "tab", "textbox", "treeitem",
]);
const MAX_TEXT_CHARS = 20_000;
const MAX_PAGE_TITLE_CHARS = 4_096;
const MAX_ELEMENTS = 500;
const NAVIGATION_GRACE_MS = 250;
const MAX_ADAPTER_EVIDENCE_EVENTS = 200;
const MAX_CONSOLE_TEXT = 2_000;
const MAX_ERROR_STACK = 8_000;
const MAX_EVIDENCE_URL = 4_096;

function abortFailure(): Error {
  const error = new Error("Playwright operation aborted");
  error.name = "AbortError";
  return error;
}

async function withAbort<T>(work: Promise<T>, signal: AbortSignal, onAbort?: () => void): Promise<T> {
  if (signal.aborted) throw abortFailure();
  let listener: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    listener = () => {
      onAbort?.();
      reject(abortFailure());
    };
    signal.addEventListener("abort", listener, { once: true });
  });
  void work.catch(() => undefined);
  try { return await Promise.race([work, interrupted]); }
  finally { if (listener) signal.removeEventListener("abort", listener); }
}

function loadPlaywrightCore(): PlaywrightModule {
  try {
    const loaded = createRequire(import.meta.url)("playwright-core") as unknown;
    if (!loaded || typeof loaded !== "object" || !("chromium" in loaded)) throw new Error("playwright-core chromium export missing");
    return loaded as PlaywrightModule;
  } catch (error) {
    throw new PlaywrightAdapterError(
      "OPENRILL_PLAYWRIGHT_CORE_UNAVAILABLE",
      "playwright-core 1.62.0 is required; run pnpm install --frozen-lockfile",
      { cause: error },
    );
  }
}

function parseDialogType(value: string): BrowserDialogType {
  return value === "alert" || value === "beforeunload" || value === "confirm" || value === "prompt" ? value : "unknown";
}

function decodeSnapshotName(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
}

function toObservationElements(snapshot: string): { elements: BrowserPageObservation["elements"]; truncated: boolean } {
  const elements: Array<{ elementId: string; role: string; name: string; interactive: boolean }> = [];
  let truncated = false;
  const seen = new Set<string>();
  for (const line of snapshot.split(/\r?\n/)) {
    const refMatch = line.match(/\[ref=([^\]\s]+)\]/i);
    if (!refMatch) continue;
    const descriptor = line.match(/^\s*-\s*([a-zA-Z][\w-]*)(?:\s+"((?:[^"\\]|\\.)*)")?/);
    if (!descriptor) continue;
    const ref = refMatch[1];
    if (!ref || seen.has(ref)) continue;
    if (elements.length >= MAX_ELEMENTS) { truncated = true; break; }
    seen.add(ref);
    const role = descriptor[1]!.toLowerCase();
    const name = decodeSnapshotName(descriptor[2]);
    elements.push({ elementId: `aria:${ref}`, role, name, interactive: INTERACTIVE_ROLES.has(role) });
  }
  return { elements, truncated };
}

function elementLocator(page: PlaywrightPage, elementId: string): PlaywrightLocator {
  if (!elementId.startsWith("aria:")) {
    throw new PlaywrightAdapterError("OPENRILL_PLAYWRIGHT_ELEMENT_ID_INVALID", `unsupported browser element identity: ${elementId}`);
  }
  const ref = elementId.slice("aria:".length);
  if (!ref) throw new PlaywrightAdapterError("OPENRILL_PLAYWRIGHT_ELEMENT_ID_INVALID", "browser element identity is empty");
  return page.locator(`aria-ref=${ref}`);
}

function boundedText(value: string, max: number): string { return value.length <= max ? value : value.slice(0, max); }

function evidenceUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    if (parsed.search) parsed.search = "?redacted";
    return boundedText(parsed.href, MAX_EVIDENCE_URL);
  } catch {
    return boundedText(value, MAX_EVIDENCE_URL);
  }
}

async function readDownloadBytes(download: PlaywrightDownload, maxBytes: number): Promise<Uint8Array> {
  const stream = await download.createReadStream();
  if (!stream) throw new PlaywrightAdapterError("OPENRILL_PLAYWRIGHT_DOWNLOAD_STREAM_UNAVAILABLE", "browser download stream is unavailable");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maxBytes) {
      await download.cancel().catch(() => undefined);
      throw new PlaywrightAdapterError("OPENRILL_PLAYWRIGHT_DOWNLOAD_TOO_LARGE", `browser download exceeded ${maxBytes} bytes`);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

class PlaywrightDownloadHandle implements BrowserDownloadHandle {
  public constructor(private readonly download: PlaywrightDownload) {}
  public cancel(): Promise<void> { return this.download.cancel(); }
}

interface DialogSignal {
  readonly observation: BrowserDialogObservation;
  readonly settled: Promise<void>;
}

interface DownloadCapture {
  claimed: boolean;
  download?: PlaywrightDownload;
  readonly maxBytes: number;
  readonly resolve: (value: BrowserPageDownloadObservation) => void;
  readonly reject: (error: unknown) => void;
}

interface RequestEvidence {
  readonly method: string;
  readonly url: string;
  readonly resourceType: string;
}

type BrowserEvidencePayload = BrowserEvidenceEvent extends infer Event
  ? Event extends { readonly sequence: number; readonly at: number }
    ? Omit<Event, "sequence" | "at">
    : never
  : never;


class PlaywrightPageHandle implements BrowserPageHandle {
  public readonly id = randomUUID();
  #documentGeneration = 1;
  #dialogSequence = 0;
  #evidenceSequence = 0;
  #evidenceDroppedBefore = 0;
  readonly #evidenceEvents: BrowserEvidenceEvent[] = [];
  readonly #requestEvidence = new WeakMap<object, RequestEvidence>();
  #downloadCapture: DownloadCapture | undefined;
  readonly #popupListeners = new Set<(page: BrowserPageHandle) => void>();
  readonly #downloadListeners = new Set<(download: BrowserDownloadHandle) => void>();
  readonly #navigationListeners = new Set<(navigation: BrowserDocumentNavigation) => void>();
  readonly #dialogListeners = new Set<(dialog: DialogSignal) => void>();
  readonly #navigationWaiters = new Set<() => void>();
  readonly #onPopup: (page: PlaywrightPage) => void;
  readonly #onDownload: (download: PlaywrightDownload) => void;
  readonly #onDialog: (dialog: PlaywrightDialog) => void;
  readonly #onFrameNavigated: (frame: PlaywrightFrame) => void;
  readonly #onConsole: (message: PlaywrightConsoleMessage) => void;
  readonly #onPageError: (error: Error) => void;
  readonly #onRequest: (request: PlaywrightRequest) => void;
  readonly #onResponse: (response: PlaywrightResponse) => void;
  readonly #onRequestFailed: (request: PlaywrightRequest) => void;

  public constructor(
    private readonly page: PlaywrightPage,
    private readonly wrapPage: (page: PlaywrightPage) => BrowserPageHandle,
    private readonly consumeBlockedNavigation: (page: PlaywrightPage) => unknown | undefined,
    private readonly assertDownloadAllowed: (url: string) => Promise<void>,
  ) {
    this.#onPopup = (popup) => {
      const wrapped = this.wrapPage(popup);
      for (const listener of this.#popupListeners) listener(wrapped);
    };
    this.#onDownload = (download) => {
      const capture = this.#downloadCapture;
      if (capture && !capture.claimed) {
        capture.claimed = true;
        capture.download = download;
        void (async () => {
          const url = download.url();
          await this.assertDownloadAllowed(url);
          const bytes = await readDownloadBytes(download, capture.maxBytes);
          return {
            documentGeneration: this.#documentGeneration,
            url,
            suggestedFilename: boundedText(download.suggestedFilename(), 255),
            bytes,
          };
        })().then(capture.resolve, capture.reject);
        return;
      }
      const wrapped = new PlaywrightDownloadHandle(download);
      for (const listener of this.#downloadListeners) listener(wrapped);
    };
    this.#onDialog = (dialog) => {
      const type = parseDialogType(dialog.type());
      const defaultValue = dialog.defaultValue();
      const observation: BrowserDialogObservation = {
        id: `d${++this.#dialogSequence}`,
        type,
        message: dialog.message(),
        ...(type === "prompt" ? { defaultValue } : {}),
      };
      const settled = dialog.dismiss();
      void settled.catch(() => undefined);
      for (const listener of this.#dialogListeners) listener({ observation, settled });
    };
    this.#onFrameNavigated = (frame) => {
      if (frame !== this.page.mainFrame()) return;
      this.#documentGeneration += 1;
      const navigation = { url: this.page.url(), documentGeneration: this.#documentGeneration };
      for (const listener of this.#navigationListeners) listener(navigation);
      for (const waiter of [...this.#navigationWaiters]) waiter();
      this.#navigationWaiters.clear();
    };
    this.#onConsole = (message) => {
      const location = message.location();
      this.#appendEvidence({
        kind: "console",
        level: boundedText(message.type(), 64),
        text: boundedText(message.text(), MAX_CONSOLE_TEXT),
        ...(location.url || location.lineNumber !== undefined || location.columnNumber !== undefined ? {
          location: {
            ...(location.url ? { url: evidenceUrl(location.url) } : {}),
            ...(Number.isInteger(location.lineNumber) ? { lineNumber: location.lineNumber } : {}),
            ...(Number.isInteger(location.columnNumber) ? { columnNumber: location.columnNumber } : {}),
          },
        } : {}),
      });
    };
    this.#onPageError = (error) => {
      this.#appendEvidence({
        kind: "page_error",
        ...(error.name ? { name: boundedText(error.name, 128) } : {}),
        message: boundedText(error.message || String(error), MAX_CONSOLE_TEXT),
        ...(error.stack ? { stack: boundedText(error.stack, MAX_ERROR_STACK) } : {}),
      });
    };
    this.#onRequest = (request) => {
      this.#requestEvidence.set(request as object, {
        method: boundedText(request.method(), 32),
        url: evidenceUrl(request.url()),
        resourceType: boundedText(request.resourceType(), 64),
      });
    };
    this.#onResponse = (response) => {
      const request = response.request();
      const base = this.#requestEvidence.get(request as object);
      if (!base) return;
      this.#requestEvidence.delete(request as object);
      this.#appendEvidence({ kind: "network", ...base, status: response.status(), ok: response.ok() });
    };
    this.#onRequestFailed = (request) => {
      const base = this.#requestEvidence.get(request as object);
      if (!base) return;
      this.#requestEvidence.delete(request as object);
      const failureText = request.failure()?.errorText;
      this.#appendEvidence({
        kind: "network",
        ...base,
        ok: false,
        ...(failureText ? { failureText: boundedText(failureText, MAX_CONSOLE_TEXT) } : {}),
      });
    };
    this.page.on("popup", this.#onPopup);
    this.page.on("download", this.#onDownload);
    this.page.on("dialog", this.#onDialog);
    this.page.on("framenavigated", this.#onFrameNavigated);
    this.page.on("console", this.#onConsole);
    this.page.on("pageerror", this.#onPageError);
    this.page.on("request", this.#onRequest);
    this.page.on("response", this.#onResponse);
    this.page.on("requestfailed", this.#onRequestFailed);
  }

  #appendEvidence(event: BrowserEvidencePayload): void {
    const recorded = { ...event, sequence: ++this.#evidenceSequence, at: Date.now() } as BrowserEvidenceEvent;
    this.#evidenceEvents.push(recorded);
    if (this.#evidenceEvents.length > MAX_ADAPTER_EVIDENCE_EVENTS) {
      const removed = this.#evidenceEvents.shift();
      if (removed) this.#evidenceDroppedBefore = removed.sequence;
    }
  }

  #throwBlockedNavigation(): void {
    const blocked = this.consumeBlockedNavigation(this.page);
    if (blocked !== undefined) throw blocked;
  }

  public async navigate(url: string, options: { readonly signal: AbortSignal; readonly timeoutMs: number }): Promise<{ url: string }> {
    this.#throwBlockedNavigation();
    const navigation = this.page.goto(url, { timeout: options.timeoutMs, waitUntil: "domcontentloaded" });
    try {
      await withAbort(navigation, options.signal, () => { void this.page.evaluate("window.stop()").catch(() => undefined); });
    } catch (error) {
      this.#throwBlockedNavigation();
      throw error;
    }
    this.#throwBlockedNavigation();
    return { url: this.page.url() };
  }

  public currentUrl(): string { return this.page.url(); }
  public async title(): Promise<string> { return boundedText(await this.page.title(), MAX_PAGE_TITLE_CHARS); }

  public async snapshot(options: { readonly signal: AbortSignal; readonly timeoutMs: number }): Promise<BrowserPageObservation> {
    this.#throwBlockedNavigation();
    const startingGeneration = this.#documentGeneration;
    const capture = async (): Promise<BrowserPageObservation> => {
      const [title, rawText, ariaSnapshot] = await Promise.all([
        this.title(),
        this.page.locator("body").innerText({ timeout: options.timeoutMs }).catch(() => ""),
        this.page.ariaSnapshot({ mode: "ai", timeout: options.timeoutMs }),
      ]);
      if (startingGeneration !== this.#documentGeneration) {
        throw new PlaywrightAdapterError(
          "OPENRILL_PLAYWRIGHT_DOCUMENT_CHANGED",
          "main-frame document changed while snapshot was being captured; retry browser.snapshot",
        );
      }
      this.#throwBlockedNavigation();
      const textTruncated = rawText.length > MAX_TEXT_CHARS;
      const text = textTruncated ? rawText.slice(0, MAX_TEXT_CHARS) : rawText;
      const converted = toObservationElements(ariaSnapshot);
      return {
        documentGeneration: startingGeneration,
        url: this.page.url(),
        title,
        text,
        elements: converted.elements,
        truncated: textTruncated || converted.truncated,
      };
    };
    return withAbort(capture(), options.signal);
  }

  public async act(
    action: BrowserPageAction,
    options: { readonly signal: AbortSignal; readonly timeoutMs: number },
  ): Promise<BrowserPageActionObservation> {
    this.#throwBlockedNavigation();
    const startingGeneration = this.#documentGeneration;
    let detachDialog: (() => void) | undefined;
    const dialogPromise = new Promise<DialogSignal>((resolve) => {
      const listener = (dialog: DialogSignal) => resolve(dialog);
      this.#dialogListeners.add(listener);
      detachDialog = () => this.#dialogListeners.delete(listener);
    });
    const actionPromise = this.#executeAction(action, options.timeoutMs, options.signal);
    void actionPromise.catch(() => undefined);
    try {
      const outcome = await withAbort(Promise.race([
        actionPromise.then(() => ({ kind: "action" as const })),
        dialogPromise.then((dialog) => ({ kind: "dialog" as const, dialog })),
      ]), options.signal);
      if (outcome.kind === "dialog") {
        await outcome.dialog.settled.catch(() => undefined);
        await Promise.race([actionPromise.catch(() => undefined), delay(100)]);
        return {
          documentGeneration: this.#documentGeneration,
          url: this.page.url(),
          navigated: this.#documentGeneration !== startingGeneration,
          dialog: outcome.dialog.observation,
        };
      }
      if (this.#documentGeneration === startingGeneration) {
        await this.#waitForNavigationGrace(Math.min(NAVIGATION_GRACE_MS, options.timeoutMs), options.signal);
      }
      this.#throwBlockedNavigation();
      return {
        documentGeneration: this.#documentGeneration,
        url: this.page.url(),
        navigated: this.#documentGeneration !== startingGeneration,
      };
    } catch (error) {
      this.#throwBlockedNavigation();
      throw error;
    } finally {
      detachDialog?.();
    }
  }

  public async screenshot(
    format: BrowserScreenshotFormat,
    options: { readonly signal: AbortSignal; readonly timeoutMs: number; readonly maxBytes: number },
  ): Promise<BrowserPageScreenshotObservation> {
    this.#throwBlockedNavigation();
    const startingGeneration = this.#documentGeneration;
    const bytes = await withAbort(this.page.screenshot({
      type: format,
      fullPage: false,
      timeout: options.timeoutMs,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    }), options.signal);
    if (bytes.byteLength > options.maxBytes) {
      throw new PlaywrightAdapterError(
        "OPENRILL_PLAYWRIGHT_SCREENSHOT_TOO_LARGE",
        `browser screenshot exceeded ${options.maxBytes} bytes`,
      );
    }
    const [title, url] = await Promise.all([this.title(), Promise.resolve(this.page.url())]);
    if (startingGeneration !== this.#documentGeneration) {
      throw new PlaywrightAdapterError(
        "OPENRILL_PLAYWRIGHT_DOCUMENT_CHANGED",
        "main-frame document changed while screenshot was being captured; retry browser.screenshot",
      );
    }
    this.#throwBlockedNavigation();
    return {
      documentGeneration: startingGeneration,
      url,
      title,
      format,
      bytes,
    };
  }

  public async download(
    elementId: string,
    options: { readonly signal: AbortSignal; readonly timeoutMs: number; readonly maxBytes: number },
  ): Promise<BrowserPageDownloadObservation> {
    this.#throwBlockedNavigation();
    if (this.#downloadCapture) {
      throw new PlaywrightAdapterError("OPENRILL_PLAYWRIGHT_DOWNLOAD_BUSY", "another explicit browser download is already active");
    }
    let resolveDownload!: (value: BrowserPageDownloadObservation) => void;
    let rejectDownload!: (error: unknown) => void;
    const downloadPromise = new Promise<BrowserPageDownloadObservation>((resolve, reject) => {
      resolveDownload = resolve;
      rejectDownload = reject;
    });
    const capture: DownloadCapture = { claimed: false, maxBytes: options.maxBytes, resolve: resolveDownload, reject: rejectDownload };
    this.#downloadCapture = capture;
    let detachDialog: (() => void) | undefined;
    const dialogPromise = new Promise<DialogSignal>((resolve) => {
      const listener = (dialog: DialogSignal) => resolve(dialog);
      this.#dialogListeners.add(listener);
      detachDialog = () => this.#dialogListeners.delete(listener);
    });
    const actionPromise = elementLocator(this.page, elementId).click({ timeout: options.timeoutMs });
    void actionPromise.catch(() => undefined);
    void downloadPromise.catch(() => undefined);
    try {
      const outcome = await withAbort(Promise.race([
        Promise.all([actionPromise, downloadPromise]).then(([, download]) => ({ kind: "download" as const, download })),
        dialogPromise.then((dialog) => ({ kind: "dialog" as const, dialog })),
      ]), options.signal, () => { void capture.download?.cancel().catch(() => undefined); });
      if (outcome.kind === "dialog") {
        await outcome.dialog.settled.catch(() => undefined);
        await capture.download?.cancel().catch(() => undefined);
        return {
          documentGeneration: this.#documentGeneration,
          url: this.page.url(),
          suggestedFilename: "",
          bytes: new Uint8Array(),
          dialog: outcome.dialog.observation,
        };
      }
      this.#throwBlockedNavigation();
      return outcome.download;
    } catch (error) {
      this.#throwBlockedNavigation();
      throw error;
    } finally {
      detachDialog?.();
      if (this.#downloadCapture === capture) this.#downloadCapture = undefined;
    }
  }

  public async evidence(options: { readonly afterSequence: number; readonly limit: number }): Promise<BrowserPageEvidenceObservation> {
    const available = this.#evidenceEvents.filter((event) => event.sequence > options.afterSequence);
    const events = available.slice(0, options.limit);
    return {
      nextSequence: events.at(-1)?.sequence ?? options.afterSequence,
      truncated: options.afterSequence < this.#evidenceDroppedBefore || available.length > events.length,
      events: events.map((event) => ({ ...event })),
    };
  }

  async #executeAction(action: BrowserPageAction, timeoutMs: number, signal: AbortSignal): Promise<void> {
    switch (action.kind) {
      case "click":
        await elementLocator(this.page, action.elementId).click({ timeout: timeoutMs });
        return;
      case "type": {
        const locator = elementLocator(this.page, action.elementId);
        await locator.type(action.text, { timeout: timeoutMs });
        if (action.submit) await locator.press("Enter", { timeout: timeoutMs });
        return;
      }
      case "press":
        await this.page.keyboard.press(action.key);
        return;
      case "select":
        await elementLocator(this.page, action.elementId).selectOption(action.values, { timeout: timeoutMs });
        return;
      case "fill":
        await elementLocator(this.page, action.elementId).fill(action.value, { timeout: timeoutMs });
        return;
      case "wait-time":
        await withAbort(delay(action.timeMs), signal);
        return;
      case "wait-element":
        await elementLocator(this.page, action.elementId).waitFor({ state: "visible", timeout: timeoutMs });
        return;
      case "wait-url":
        await this.page.waitForURL(action.url, { timeout: timeoutMs, waitUntil: "domcontentloaded" });
        return;
    }
  }

  async #waitForNavigationGrace(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0) return;
    let detach: (() => void) | undefined;
    const navigated = new Promise<void>((resolve) => {
      const waiter = () => resolve();
      this.#navigationWaiters.add(waiter);
      detach = () => this.#navigationWaiters.delete(waiter);
    });
    try { await withAbort(Promise.race([navigated, delay(ms)]), signal); }
    finally { detach?.(); }
  }

  public async close(): Promise<void> {
    const capture = this.#downloadCapture;
    this.#downloadCapture = undefined;
    await capture?.download?.cancel().catch(() => undefined);
    capture?.reject(new PlaywrightAdapterError("OPENRILL_PLAYWRIGHT_PAGE_CLOSED", "browser page closed during explicit download"));
    this.page.off("popup", this.#onPopup);
    this.page.off("download", this.#onDownload);
    this.page.off("dialog", this.#onDialog);
    this.page.off("framenavigated", this.#onFrameNavigated);
    this.page.off("console", this.#onConsole);
    this.page.off("pageerror", this.#onPageError);
    this.page.off("request", this.#onRequest);
    this.page.off("response", this.#onResponse);
    this.page.off("requestfailed", this.#onRequestFailed);
    if (!this.page.isClosed()) await this.page.close();
  }

  public onPopup(listener: (page: BrowserPageHandle) => void): () => void {
    this.#popupListeners.add(listener);
    return () => this.#popupListeners.delete(listener);
  }
  public onDownload(listener: (download: BrowserDownloadHandle) => void): () => void {
    this.#downloadListeners.add(listener);
    return () => this.#downloadListeners.delete(listener);
  }
  public onMainFrameNavigated(listener: (navigation: BrowserDocumentNavigation) => void): () => void {
    this.#navigationListeners.add(listener);
    return () => this.#navigationListeners.delete(listener);
  }
}

class PlaywrightContextHandle implements BrowserContextHandle {
  public readonly id = randomUUID();
  readonly #pages = new WeakMap<object, BrowserPageHandle>();
  readonly #blockedNavigations = new WeakMap<object, unknown>();

  private constructor(private readonly context: PlaywrightContext, private readonly assertDownloadAllowed: (url: string) => Promise<void>) {}

  public static async create(context: PlaywrightContext, options: BrowserContextOptions): Promise<PlaywrightContextHandle> {
    const handle = new PlaywrightContextHandle(context, options.assertDownloadAllowed);
    await context.route("**/*", async (route) => {
      const request = route.request();
      const frame = request.frame();
      if (!request.isNavigationRequest() || frame.parentFrame() !== null) {
        await route.continue();
        return;
      }
      try {
        await options.assertNavigationAllowed(request.url());
        await route.continue();
      } catch (error) {
        handle.#blockedNavigations.set(frame.page() as object, error);
        await route.abort("blockedbyclient");
      }
    });
    return handle;
  }

  #consumeBlockedNavigation = (page: PlaywrightPage): unknown | undefined => {
    const value = this.#blockedNavigations.get(page as object);
    this.#blockedNavigations.delete(page as object);
    return value;
  };

  #wrap = (page: PlaywrightPage): BrowserPageHandle => {
    const existing = this.#pages.get(page as object);
    if (existing) return existing;
    const wrapped = new PlaywrightPageHandle(page, this.#wrap, this.#consumeBlockedNavigation, this.assertDownloadAllowed);
    this.#pages.set(page as object, wrapped);
    return wrapped;
  };

  public async newPage(): Promise<BrowserPageHandle> { return this.#wrap(await this.context.newPage()); }
  public close(): Promise<void> { return this.context.close(); }
}

class PlaywrightProcessHandle implements BrowserProcessHandle {
  public readonly id = randomUUID();
  readonly #disconnectListeners = new Set<(reason?: unknown) => void>();
  #retired = false;
  readonly #onDisconnected = () => {
    this.#retire();
    for (const listener of this.#disconnectListeners) listener(new Error("Playwright Chromium disconnected"));
  };

  public constructor(private readonly browser: PlaywrightBrowser, private readonly onRetired: (process: PlaywrightProcessHandle) => void) {
    this.browser.on("disconnected", this.#onDisconnected);
  }

  #retire(): void {
    if (this.#retired) return;
    this.#retired = true;
    this.onRetired(this);
  }

  public async createContext(options: BrowserContextOptions): Promise<BrowserContextHandle> {
    if (options.acceptDownloads !== true || options.persistentStorage !== false) {
      throw new TypeError("OpenRill Playwright adapter requires ephemeral contexts with explicit artifact-only downloads");
    }
    return PlaywrightContextHandle.create(await this.browser.newContext({ acceptDownloads: true }), options);
  }

  public async close(): Promise<void> {
    this.browser.off("disconnected", this.#onDisconnected);
    try { await this.browser.close(); }
    finally { this.#retire(); }
  }

  public onDisconnected(listener: (reason?: unknown) => void): () => void {
    this.#disconnectListeners.add(listener);
    return () => this.#disconnectListeners.delete(listener);
  }
}

export interface PlaywrightBrowserDriverOptions extends ChromiumExecutableOptions { readonly launchArgs?: readonly string[]; }

export class PlaywrightBrowserDriver implements BrowserDriver {
  public readonly executable: ChromiumExecutableResolution;
  readonly #launchArgs: readonly string[];
  readonly #processes = new Set<PlaywrightProcessHandle>();
  public get activeProcessCount(): number { return this.#processes.size; }

  public constructor(options: PlaywrightBrowserDriverOptions = {}) {
    this.executable = resolveChromiumExecutable(options);
    this.#launchArgs = options.launchArgs ?? ["--disable-background-networking", "--disable-component-update", "--no-first-run"];
  }

  public async launch(options: BrowserLaunchOptions): Promise<BrowserProcessHandle> {
    const executable = options.executablePath
      ? resolveChromiumExecutable({ executablePath: options.executablePath }).executablePath
      : this.executable.executablePath;
    const playwright = loadPlaywrightCore();
    try {
      const launched = playwright.chromium.launch({ executablePath: executable, headless: options.headless, timeout: options.timeoutMs, args: this.#launchArgs });
      const closeLateLaunch = () => { void launched.then((lateBrowser) => lateBrowser.close()).catch(() => undefined); };
      const browser = await withAbort(launched, options.signal, closeLateLaunch);
      if (options.signal.aborted) {
        await browser.close().catch(() => undefined);
        throw abortFailure();
      }
      const process = new PlaywrightProcessHandle(browser, (retired) => this.#processes.delete(retired));
      this.#processes.add(process);
      return process;
    } catch (error) {
      if (error instanceof PlaywrightAdapterError || (error instanceof Error && error.name === "AbortError")) throw error;
      throw new PlaywrightAdapterError("OPENRILL_PLAYWRIGHT_LAUNCH_FAILED", `failed to launch Chromium executable: ${executable}`, { cause: error });
    }
  }

  public async dispose(): Promise<void> {
    const processes = [...this.#processes];
    this.#processes.clear();
    const results = await Promise.allSettled(processes.map((process) => process.close()));
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failed) throw failed.reason;
  }
}

export function createPlaywrightBrowserDriver(options: PlaywrightBrowserDriverOptions = {}): PlaywrightBrowserDriver {
  return new PlaywrightBrowserDriver(options);
}
