import { randomUUID } from "node:crypto";
import { BrowserRuntimeError } from "./errors.js";
import { assertBrowserNavigationAllowed, assertBrowserNavigationResultAllowed } from "./policy.js";
import type {
  BrowserContextHandle,
  BrowserDocumentNavigation,
  BrowserDownloadHandle,
  BrowserDownloadResult,
  BrowserOwner,
  BrowserOutputLimits,
  BrowserPageAction,
  BrowserPageActionResult,
  BrowserPageEvidence,
  BrowserPageHandle,
  BrowserPageSnapshot,
  BrowserPageState,
  BrowserScreenshotFormat,
  BrowserScreenshotResult,
  BrowserPageView,
  BrowserProcessHandle,
  BrowserRuntimeEvent,
  BrowserRuntimeOptions,
  BrowserRuntimeSnapshot,
  BrowserRuntimeState,
  BrowserSessionState,
  BrowserSessionView,
} from "./types.js";

interface PageRecord {
  readonly pageId: string;
  readonly handle: BrowserPageHandle;
  readonly generation: number;
  readonly createdAt: number;
  lastUsedAt: number;
  state: BrowserPageState;
  url: string;
  documentGeneration: number;
  nextElementRef: number;
  readonly elementRefs: Map<string, string>;
  readonly refElements: Map<string, string>;
  readonly detachPopup: () => void;
  readonly detachDownload: () => void;
  readonly detachNavigation: () => void;
}

const DEFAULT_BROWSER_OUTPUT_LIMITS: BrowserOutputLimits = {
  maxScreenshotBytes: 8 * 1024 * 1024 - 64 * 1024,
  maxDownloadBytes: 8 * 1024 * 1024 - 64 * 1024,
  maxEvidenceEvents: 100,
};

interface SessionRecord {
  readonly sessionId: string;
  readonly owner: BrowserOwner;
  readonly context: BrowserContextHandle;
  readonly generation: number;
  readonly createdAt: number;
  lastUsedAt: number;
  state: BrowserSessionState;
  readonly pages: Map<string, PageRecord>;
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const code = typeof (error as Error & { readonly code?: unknown }).code === "string"
    ? (error as Error & { readonly code: string }).code
    : "";
  return code ? `${code}: ${error.message}` : error.message;
}

function validateOptions(options: BrowserRuntimeOptions): void {
  validatePositiveInteger(options.limits.maxSessions, "maxSessions");
  validatePositiveInteger(options.limits.maxPagesPerSession, "maxPagesPerSession");
  validatePositiveInteger(options.limits.launchTimeoutMs, "launchTimeoutMs");
  validatePositiveInteger(options.limits.actionTimeoutMs, "actionTimeoutMs");
  validatePositiveInteger(options.limits.idleTimeoutMs, "idleTimeoutMs");
  validatePositiveInteger(options.limits.sweepIntervalMs, "sweepIntervalMs");
}

function sameOwner(left: BrowserOwner, right: BrowserOwner): boolean {
  return left.workspaceId === right.workspaceId
    && left.conversationId === right.conversationId
    && left.runId === right.runId
    && left.attemptId === right.attemptId;
}

function abortError(code: "BROWSER_OPERATION_ABORTED" | "BROWSER_OPERATION_TIMEOUT", message: string): BrowserRuntimeError {
  return new BrowserRuntimeError(code, message);
}

async function bounded<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  if (externalSignal?.aborted) throw abortError("BROWSER_OPERATION_ABORTED", "browser operation was aborted");
  const controller = new AbortController();
  let timer: NodeJS.Timeout | null = null;
  let externalAbortHandler: (() => void) | undefined;
  const interruption = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(abortError("BROWSER_OPERATION_TIMEOUT", `browser operation exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    if (externalSignal) {
      externalAbortHandler = () => {
        controller.abort();
        reject(abortError("BROWSER_OPERATION_ABORTED", "browser operation was aborted"));
      };
      externalSignal.addEventListener("abort", externalAbortHandler, { once: true });
    }
  });
  const operation = Promise.resolve().then(() => work(controller.signal));
  void operation.catch(() => undefined);
  try {
    return await Promise.race([operation, interruption]);
  } finally {
    if (timer) clearTimeout(timer);
    if (externalSignal && externalAbortHandler) externalSignal.removeEventListener("abort", externalAbortHandler);
  }
}

export class BrowserRuntime {
  readonly #now: () => number;
  readonly #createId: () => string;
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #operations = new Set<Promise<unknown>>();
  readonly #events: BrowserRuntimeEvent[] = [];
  readonly #outputLimits: BrowserOutputLimits;
  #eventSequence = 0;
  #state: BrowserRuntimeState = "IDLE";
  #generation = 0;
  #browser: BrowserProcessHandle | null = null;
  #detachDisconnect: (() => void) | null = null;
  #launchPromise: Promise<BrowserProcessHandle> | null = null;
  #transitionTail: Promise<void> = Promise.resolve();
  #closePromise: Promise<void> | null = null;
  #sweepTimer: NodeJS.Timeout | null = null;

  public constructor(private readonly options: BrowserRuntimeOptions) {
    validateOptions(options);
    this.#outputLimits = { ...DEFAULT_BROWSER_OUTPUT_LIMITS, ...(options.outputLimits ?? {}) };
    validatePositiveInteger(this.#outputLimits.maxScreenshotBytes, "maxScreenshotBytes");
    validatePositiveInteger(this.#outputLimits.maxDownloadBytes, "maxDownloadBytes");
    validatePositiveInteger(this.#outputLimits.maxEvidenceEvents, "maxEvidenceEvents");
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? randomUUID;
    this.#sweepTimer = setInterval(() => {
      void this.sweepIdle().catch((error) => this.#record("runtime.failed", { detail: error instanceof Error ? error.message : "idle sweep failed" }));
    }, options.limits.sweepIntervalMs);
    this.#sweepTimer.unref();
  }

  public snapshot(): BrowserRuntimeSnapshot {
    const sessions = [...this.#sessions.values()].map((session): BrowserSessionView => ({
      sessionId: session.sessionId,
      owner: session.owner,
      state: session.state,
      generation: session.generation,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      pageCount: [...session.pages.values()].filter((page) => page.state === "OPEN").length,
    })).sort((left, right) => left.sessionId.localeCompare(right.sessionId));
    return {
      state: this.#state,
      generation: this.#generation,
      sessionCount: sessions.filter((session) => session.state === "OPEN").length,
      pageCount: sessions.reduce((sum, session) => sum + session.pageCount, 0),
      sessions,
      events: [...this.#events],
    };
  }

  public sessionsForOwner(owner: BrowserOwner): readonly BrowserSessionView[] {
    return this.snapshot().sessions.filter((session) => sameOwner(session.owner, owner));
  }

  public listPages(sessionId: string): readonly BrowserPageView[] {
    const session = this.#requireSession(sessionId);
    return [...session.pages.values()].map((page) => this.#viewPage(sessionId, page))
      .sort((left, right) => left.pageId.localeCompare(right.pageId));
  }

  public listOwnedPages(sessionId: string, owner: BrowserOwner): readonly BrowserPageView[] {
    const session = this.#requireOwnedSession(sessionId, owner);
    return [...session.pages.values()].map((page) => this.#viewPage(sessionId, page))
      .sort((left, right) => left.pageId.localeCompare(right.pageId));
  }

  public async openSession(owner: BrowserOwner): Promise<BrowserSessionView> {
    return this.#serialize(async () => {
      this.#assertOpen();
      const activeSessions = [...this.#sessions.values()].filter((session) => session.state === "OPEN").length;
      if (activeSessions >= this.options.limits.maxSessions) {
        throw new BrowserRuntimeError("BROWSER_SESSION_LIMIT", `browser session limit reached: ${this.options.limits.maxSessions}`);
      }
      const browser = await this.#ensureBrowser();
      this.#assertOpen();
      const context = await bounded(
        () => browser.createContext({
          acceptDownloads: true,
          persistentStorage: false,
          owner,
          assertNavigationAllowed: async (url) => {
            await assertBrowserNavigationAllowed(url, this.options.policy.navigation, this.options.lookup);
          },
          assertDownloadAllowed: async (url) => {
            await assertBrowserNavigationAllowed(url, this.options.policy.navigation, this.options.lookup);
          },
        }),
        this.options.limits.actionTimeoutMs,
      );
      const at = this.#now();
      const sessionId = this.#createId();
      const session: SessionRecord = {
        sessionId,
        owner,
        context,
        generation: this.#generation,
        createdAt: at,
        lastUsedAt: at,
        state: "OPEN",
        pages: new Map(),
      };
      this.#sessions.set(sessionId, session);
      this.#record("session.opened", { sessionId, runId: owner.runId });
      return this.snapshot().sessions.find((item) => item.sessionId === sessionId)!;
    });
  }

  public async openPage(sessionId: string, initialUrl = "about:blank", signal?: AbortSignal): Promise<BrowserPageView> {
    return this.#serialize(async () => {
      this.#assertOpen();
      const session = this.#requireSession(sessionId);
      this.#assertCurrent(session.generation);
      const activePages = [...session.pages.values()].filter((page) => page.state === "OPEN").length;
      if (activePages >= this.options.limits.maxPagesPerSession) {
        throw new BrowserRuntimeError("BROWSER_PAGE_LIMIT", `browser page limit reached for session ${sessionId}: ${this.options.limits.maxPagesPerSession}`);
      }
      await assertBrowserNavigationAllowed(initialUrl, this.options.policy.navigation, this.options.lookup);
      const handle = await bounded(() => session.context.newPage(), this.options.limits.actionTimeoutMs, signal);
      const pageId = this.#createId();
      const at = this.#now();
      const page: PageRecord = {
        pageId,
        handle,
        generation: session.generation,
        createdAt: at,
        lastUsedAt: at,
        state: "OPEN",
        url: "about:blank",
        documentGeneration: 1,
        nextElementRef: 0,
        elementRefs: new Map(),
        refElements: new Map(),
        detachPopup: () => {},
        detachDownload: () => {},
        detachNavigation: () => {},
      };
      const detachPopup = handle.onPopup((popup) => {
        void popup.close().catch(() => undefined);
        this.#record("page.popup_denied", { sessionId, pageId, runId: session.owner.runId });
      });
      const detachDownload = handle.onDownload((download: BrowserDownloadHandle) => {
        void download.cancel().catch(() => undefined);
        this.#record("page.download_denied", { sessionId, pageId, runId: session.owner.runId });
      });
      const detachNavigation = handle.onMainFrameNavigated((navigation) => {
        this.#onDocumentNavigation(session, page, navigation);
      });
      Object.assign(page, { detachPopup, detachDownload, detachNavigation });
      session.pages.set(pageId, page);
      session.lastUsedAt = at;
      this.#record("page.opened", { sessionId, pageId, runId: session.owner.runId });
      if (initialUrl !== "about:blank") await this.#navigateRecord(session, page, initialUrl, signal);
      return this.#viewPage(sessionId, page);
    });
  }

  public async openOwnedPage(owner: BrowserOwner, initialUrl = "about:blank", signal?: AbortSignal): Promise<BrowserPageView> {
    let session = this.sessionsForOwner(owner).find((candidate) => candidate.state === "OPEN");
    if (!session) session = await this.openSession(owner);
    return this.openPage(session.sessionId, initialUrl, signal);
  }

  public async navigate(sessionId: string, pageId: string, url: string, signal?: AbortSignal): Promise<BrowserPageView> {
    this.#assertOpen();
    const session = this.#requireSession(sessionId);
    const page = this.#requirePage(session, pageId);
    this.#assertCurrent(session.generation);
    return this.#track(this.#navigateRecord(session, page, url, signal));
  }

  public async navigateOwned(owner: BrowserOwner, sessionId: string, pageId: string, url: string, signal?: AbortSignal): Promise<BrowserPageView> {
    this.#requireOwnedSession(sessionId, owner);
    return this.navigate(sessionId, pageId, url, signal);
  }

  public async snapshotPage(sessionId: string, pageId: string, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    this.#assertOpen();
    const session = this.#requireSession(sessionId);
    const page = this.#requirePage(session, pageId);
    this.#assertCurrent(session.generation);
    return this.#track(this.#snapshotRecord(session, page, signal));
  }

  public async snapshotOwned(owner: BrowserOwner, sessionId: string, pageId: string, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    this.#requireOwnedSession(sessionId, owner);
    return this.snapshotPage(sessionId, pageId, signal);
  }

  public async screenshotOwned(
    owner: BrowserOwner,
    sessionId: string,
    pageId: string,
    format: BrowserScreenshotFormat,
    signal?: AbortSignal,
  ): Promise<BrowserScreenshotResult> {
    this.#assertOpen();
    const session = this.#requireOwnedSession(sessionId, owner);
    const page = this.#requirePage(session, pageId);
    this.#assertCurrent(session.generation);
    return this.#track(this.#screenshotRecord(session, page, format, signal));
  }

  public async downloadOwned(
    owner: BrowserOwner,
    sessionId: string,
    pageId: string,
    elementId: string,
    signal?: AbortSignal,
  ): Promise<BrowserDownloadResult> {
    this.#assertOpen();
    const session = this.#requireOwnedSession(sessionId, owner);
    const page = this.#requirePage(session, pageId);
    this.#assertCurrent(session.generation);
    return this.#track(this.#downloadRecord(session, page, elementId, signal));
  }

  public async evidenceOwned(
    owner: BrowserOwner,
    sessionId: string,
    pageId: string,
    afterSequence = 0,
    limit = this.#outputLimits.maxEvidenceEvents,
  ): Promise<BrowserPageEvidence> {
    this.#assertOpen();
    const session = this.#requireOwnedSession(sessionId, owner);
    const page = this.#requirePage(session, pageId);
    this.#assertCurrent(session.generation);
    if (!Number.isInteger(afterSequence) || afterSequence < 0) throw new TypeError("afterSequence must be a non-negative integer");
    if (!Number.isInteger(limit) || limit <= 0 || limit > this.#outputLimits.maxEvidenceEvents) {
      throw new TypeError(`browser evidence limit must be 1..${this.#outputLimits.maxEvidenceEvents}`);
    }
    return this.#track(this.#evidenceRecord(session, page, afterSequence, limit));
  }

  public async actOwned(
    owner: BrowserOwner,
    sessionId: string,
    pageId: string,
    action: BrowserPageAction,
    signal?: AbortSignal,
  ): Promise<BrowserPageActionResult> {
    this.#assertOpen();
    const session = this.#requireOwnedSession(sessionId, owner);
    const page = this.#requirePage(session, pageId);
    this.#assertCurrent(session.generation);
    return this.#track(this.#actRecord(session, page, action, signal));
  }

  public async resolveOwnedElementRef(
    owner: BrowserOwner,
    sessionId: string,
    pageId: string,
    ref: string,
    signal?: AbortSignal,
  ): Promise<string> {
    this.#requireOwnedSession(sessionId, owner);
    try {
      return this.assertElementRefCurrent(sessionId, pageId, ref);
    } catch (error) {
      if (!(error instanceof BrowserRuntimeError) || error.code !== "BROWSER_STALE_REF") throw error;
      let recoverySnapshot: BrowserPageSnapshot | undefined;
      try { recoverySnapshot = await this.snapshotPage(sessionId, pageId, signal); }
      catch { recoverySnapshot = undefined; }
      this.#record("action.stale_ref_recovered", {
        sessionId,
        pageId,
        runId: owner.runId,
        detail: `ref=${ref}${recoverySnapshot ? ` documentGeneration=${recoverySnapshot.documentGeneration}` : ""}`,
      });
      throw new BrowserRuntimeError(
        "BROWSER_STALE_REF",
        `browser element ref is stale; use recoverySnapshot refs and retry: ${ref}`,
        { ...(recoverySnapshot ? { details: { recoverySnapshot } } : {}) },
      );
    }
  }

  public assertElementRefCurrent(sessionId: string, pageId: string, ref: string): string {
    const session = this.#requireSession(sessionId);
    const page = this.#requirePage(session, pageId);
    const elementId = page.refElements.get(ref);
    if (!elementId) {
      throw new BrowserRuntimeError("BROWSER_STALE_REF", `browser element ref is stale for document generation ${page.documentGeneration}: ${ref}`);
    }
    return elementId;
  }

  public async closePage(sessionId: string, pageId: string): Promise<void> {
    await this.#serialize(async () => {
      const session = this.#requireSession(sessionId);
      const page = this.#requirePage(session, pageId);
      await this.#closePageRecord(session, page);
    });
  }

  public async closeOwnedPage(owner: BrowserOwner, sessionId: string, pageId: string): Promise<void> {
    this.#requireOwnedSession(sessionId, owner);
    await this.closePage(sessionId, pageId);
  }

  public async closeSession(sessionId: string): Promise<void> {
    await this.#serialize(async () => {
      const session = this.#requireSession(sessionId);
      await this.#closeSessionRecord(session, "session.closed");
    });
  }

  public async closeOwnedSession(owner: BrowserOwner, sessionId: string): Promise<void> {
    this.#requireOwnedSession(sessionId, owner);
    await this.closeSession(sessionId);
  }

  public async cancelRun(runId: string): Promise<number> {
    return this.#serialize(async () => {
      const sessions = [...this.#sessions.values()].filter((session) => session.owner.runId === runId && session.state === "OPEN");
      for (const session of sessions) await this.#closeSessionRecord(session, "session.run_cancelled");
      return sessions.length;
    });
  }

  public async sweepIdle(): Promise<readonly string[]> {
    if (this.#state === "CLOSING" || this.#state === "CLOSED") return [];
    return this.#serialize(async () => {
      const cutoff = this.#now() - this.options.limits.idleTimeoutMs;
      const idle = [...this.#sessions.values()].filter((session) => session.state === "OPEN" && session.lastUsedAt <= cutoff);
      for (const session of idle) await this.#closeSessionRecord(session, "session.idle_closed");
      return idle.map((session) => session.sessionId);
    });
  }

  public async close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#state = "CLOSING";
    if (this.#sweepTimer) {
      clearInterval(this.#sweepTimer);
      this.#sweepTimer = null;
    }
    this.#closePromise = (async () => {
      await Promise.allSettled([...this.#operations]);
      await this.#serialize(async () => {
        let firstError: unknown;
        for (const session of [...this.#sessions.values()]) {
          try { await this.#closeSessionRecord(session, "session.closed"); }
          catch (error) { firstError ??= error; }
        }
        const browser = this.#browser;
        this.#browser = null;
        this.#detachDisconnect?.();
        this.#detachDisconnect = null;
        if (browser) {
          try { await browser.close(); }
          catch (error) { firstError ??= error; }
        }
        try { await this.options.driver.dispose?.(); }
        catch (error) { firstError ??= error; }
        this.#state = "CLOSED";
        this.#record("browser.closed", {});
        if (firstError) throw firstError;
      });
    })();
    return this.#closePromise;
  }

  #requireArtifactStore() {
    if (!this.options.artifacts) {
      throw new BrowserRuntimeError(
        "BROWSER_ARTIFACT_STORE_UNAVAILABLE",
        "browser Artifact storage requires a configured workspace",
      );
    }
    return this.options.artifacts;
  }

  async #screenshotRecord(
    session: SessionRecord,
    page: PageRecord,
    format: BrowserScreenshotFormat,
    signal?: AbortSignal,
  ): Promise<BrowserScreenshotResult> {
    const artifacts = this.#requireArtifactStore();
    let observed;
    try {
      observed = await bounded(
        (operationSignal) => page.handle.screenshot(format, {
          signal: operationSignal,
          timeoutMs: this.options.limits.actionTimeoutMs,
          maxBytes: this.#outputLimits.maxScreenshotBytes,
        }),
        this.options.limits.actionTimeoutMs,
        signal,
      );
    } catch (error) {
      const detail = describeFailure(error);
      if (detail.includes("SCREENSHOT_TOO_LARGE")) {
        throw new BrowserRuntimeError("BROWSER_OUTPUT_TOO_LARGE", `browser screenshot exceeds ${this.#outputLimits.maxScreenshotBytes} bytes`, { cause: error });
      }
      throw new BrowserRuntimeError("BROWSER_SCREENSHOT_FAILED", `browser screenshot failed: ${detail}`, { cause: error });
    }
    this.#assertCurrent(session.generation);
    await assertBrowserNavigationResultAllowed(observed.url, this.options.policy.navigation, this.options.lookup);
    this.#synchronizeDocument(session, page, observed.documentGeneration, observed.url);
    let artifact;
    try {
      artifact = await artifacts.recordScreenshot({
        owner: session.owner,
        pageId: page.pageId,
        documentGeneration: page.documentGeneration,
        url: observed.url,
        title: observed.title,
        format: observed.format,
        bytes: observed.bytes,
      });
    } catch (error) {
      throw new BrowserRuntimeError("BROWSER_ARTIFACT_FAILED", `browser screenshot Artifact creation failed: ${describeFailure(error)}`, { cause: error });
    }
    const at = this.#now();
    session.lastUsedAt = at;
    page.lastUsedAt = at;
    page.url = observed.url;
    this.#record("screenshot.artifact_created", {
      sessionId: session.sessionId, pageId: page.pageId, runId: session.owner.runId,
      detail: `artifactId=${artifact.artifactId} bytes=${artifact.sizeBytes}`,
    });
    return { pageId: page.pageId, documentGeneration: page.documentGeneration, url: page.url, artifact };
  }

  async #downloadRecord(
    session: SessionRecord,
    page: PageRecord,
    elementId: string,
    signal?: AbortSignal,
  ): Promise<BrowserDownloadResult> {
    const artifacts = this.#requireArtifactStore();
    let observed;
    try {
      observed = await bounded(
        (operationSignal) => page.handle.download(elementId, {
          signal: operationSignal,
          timeoutMs: this.options.limits.actionTimeoutMs,
          maxBytes: this.#outputLimits.maxDownloadBytes,
        }),
        this.options.limits.actionTimeoutMs,
        signal,
      );
    } catch (error) {
      const detail = describeFailure(error);
      if (detail.includes("DOWNLOAD_TOO_LARGE")) {
        throw new BrowserRuntimeError("BROWSER_OUTPUT_TOO_LARGE", `browser download exceeds ${this.#outputLimits.maxDownloadBytes} bytes`, { cause: error });
      }
      throw new BrowserRuntimeError("BROWSER_DOWNLOAD_FAILED", `browser download failed: ${detail}`, { cause: error });
    }
    this.#assertCurrent(session.generation);
    if (observed.dialog) {
      this.#record("action.dialog_blocked", {
        sessionId: session.sessionId, pageId: page.pageId, runId: session.owner.runId,
        detail: `dialog=${observed.dialog.id} type=${observed.dialog.type} action=download`,
      });
      throw new BrowserRuntimeError(
        "BROWSER_DIALOG_BLOCKED",
        `browser download opened a ${observed.dialog.type} dialog and was blocked; the dialog was dismissed safely`,
        { details: { dialog: observed.dialog } },
      );
    }
    await assertBrowserNavigationResultAllowed(observed.url, this.options.policy.navigation, this.options.lookup);
    const currentUrl = await page.handle.currentUrl();
    await assertBrowserNavigationResultAllowed(currentUrl, this.options.policy.navigation, this.options.lookup);
    this.#synchronizeDocument(session, page, observed.documentGeneration, currentUrl);
    let artifact;
    try {
      artifact = await artifacts.recordDownload({
        owner: session.owner,
        pageId: page.pageId,
        documentGeneration: page.documentGeneration,
        url: observed.url,
        suggestedFilename: observed.suggestedFilename,
        bytes: observed.bytes,
      });
    } catch (error) {
      throw new BrowserRuntimeError("BROWSER_ARTIFACT_FAILED", `browser download Artifact creation failed: ${describeFailure(error)}`, { cause: error });
    }
    const at = this.#now();
    session.lastUsedAt = at;
    page.lastUsedAt = at;
    page.url = currentUrl;
    this.#record("download.artifact_created", {
      sessionId: session.sessionId, pageId: page.pageId, runId: session.owner.runId,
      detail: `artifactId=${artifact.artifactId} bytes=${artifact.sizeBytes}`,
    });
    return { pageId: page.pageId, documentGeneration: page.documentGeneration, url: page.url, artifact };
  }

  async #evidenceRecord(
    session: SessionRecord,
    page: PageRecord,
    afterSequence: number,
    limit: number,
  ): Promise<BrowserPageEvidence> {
    let observed;
    try { observed = await page.handle.evidence({ afterSequence, limit }); }
    catch (error) {
      throw new BrowserRuntimeError("BROWSER_EVIDENCE_FAILED", `browser evidence read failed: ${describeFailure(error)}`, { cause: error });
    }
    const at = this.#now();
    session.lastUsedAt = at;
    page.lastUsedAt = at;
    this.#record("evidence.completed", {
      sessionId: session.sessionId, pageId: page.pageId, runId: session.owner.runId,
      detail: `events=${observed.events.length} nextSequence=${observed.nextSequence} truncated=${observed.truncated}`,
    });
    return { pageId: page.pageId, ...observed };
  }

  async #snapshotRecord(session: SessionRecord, page: PageRecord, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    const observed = await bounded(
      (operationSignal) => page.handle.snapshot({ signal: operationSignal, timeoutMs: this.options.limits.actionTimeoutMs }),
      this.options.limits.actionTimeoutMs,
      signal,
    );
    this.#assertCurrent(session.generation);
    await assertBrowserNavigationResultAllowed(observed.url, this.options.policy.navigation, this.options.lookup);
    this.#synchronizeDocument(session, page, observed.documentGeneration, observed.url);
    const at = this.#now();
    session.lastUsedAt = at;
    page.lastUsedAt = at;
    page.url = observed.url;
    const elements = observed.elements.map((element) => {
      let ref = page.elementRefs.get(element.elementId);
      if (!ref) {
        ref = `e${page.documentGeneration}-${++page.nextElementRef}`;
        page.elementRefs.set(element.elementId, ref);
        page.refElements.set(ref, element.elementId);
      }
      return { ref, role: element.role, name: element.name, interactive: element.interactive };
    });
    this.#record("snapshot.completed", {
      sessionId: session.sessionId,
      pageId: page.pageId,
      runId: session.owner.runId,
      detail: `documentGeneration=${page.documentGeneration} elements=${elements.length}`,
    });
    return {
      pageId: page.pageId,
      documentGeneration: page.documentGeneration,
      url: observed.url,
      title: observed.title,
      text: observed.text,
      elements,
      truncated: observed.truncated,
    };
  }

  async #actRecord(
    session: SessionRecord,
    page: PageRecord,
    action: BrowserPageAction,
    signal?: AbortSignal,
  ): Promise<BrowserPageActionResult> {
    this.#assertCurrent(session.generation);
    if (session.state !== "OPEN" || page.state !== "OPEN") {
      throw new BrowserRuntimeError("BROWSER_STALE_HANDLE", "browser page is no longer open");
    }
    if (action.kind === "wait-url") {
      await assertBrowserNavigationAllowed(action.url, this.options.policy.navigation, this.options.lookup);
    }
    let observed;
    try {
      observed = await bounded(
        (operationSignal) => page.handle.act(action, { signal: operationSignal, timeoutMs: this.options.limits.actionTimeoutMs }),
        this.options.limits.actionTimeoutMs,
        signal,
      );
    } catch (error) {
      if (error instanceof BrowserRuntimeError) throw error;
      const detail = describeFailure(error);
      throw new BrowserRuntimeError("BROWSER_ACTION_FAILED", `browser ${action.kind} failed: ${detail}`, { cause: error });
    }
    this.#assertCurrent(session.generation);
    if (observed.dialog) {
      this.#record("action.dialog_blocked", {
        sessionId: session.sessionId,
        pageId: page.pageId,
        runId: session.owner.runId,
        detail: `dialog=${observed.dialog.id} type=${observed.dialog.type}`,
      });
      throw new BrowserRuntimeError(
        "BROWSER_DIALOG_BLOCKED",
        `browser action opened a ${observed.dialog.type} dialog and was blocked; the dialog was dismissed safely`,
        { details: { dialog: observed.dialog } },
      );
    }
    try {
      await assertBrowserNavigationResultAllowed(observed.url, this.options.policy.navigation, this.options.lookup);
    } catch (error) {
      await this.#closePageRecord(session, page).catch(() => undefined);
      throw error;
    }
    this.#synchronizeDocument(session, page, observed.documentGeneration, observed.url);
    const at = this.#now();
    session.lastUsedAt = at;
    page.lastUsedAt = at;
    page.url = observed.url;
    if (observed.navigated) {
      const pageState = await this.#snapshotRecord(session, page, signal);
      this.#record("action.navigation_completed", {
        sessionId: session.sessionId,
        pageId: page.pageId,
        runId: session.owner.runId,
        detail: `kind=${action.kind} documentGeneration=${page.documentGeneration}`,
      });
      return {
        pageId: page.pageId,
        documentGeneration: page.documentGeneration,
        url: page.url,
        navigated: true,
        pageState,
      };
    }
    this.#record("action.completed", {
      sessionId: session.sessionId,
      pageId: page.pageId,
      runId: session.owner.runId,
      detail: `kind=${action.kind}`,
    });
    return {
      pageId: page.pageId,
      documentGeneration: page.documentGeneration,
      url: page.url,
      navigated: false,
    };
  }

  async #navigateRecord(session: SessionRecord, page: PageRecord, url: string, signal?: AbortSignal): Promise<BrowserPageView> {
    this.#assertCurrent(session.generation);
    if (session.state !== "OPEN" || page.state !== "OPEN") throw new BrowserRuntimeError("BROWSER_STALE_HANDLE", "browser page is no longer open");
    const parsed = await assertBrowserNavigationAllowed(url, this.options.policy.navigation, this.options.lookup);
    const result = await bounded(
      (operationSignal) => page.handle.navigate(parsed.href, { signal: operationSignal, timeoutMs: this.options.limits.actionTimeoutMs }),
      this.options.limits.actionTimeoutMs,
      signal,
    );
    this.#assertCurrent(session.generation);
    const finalUrl = result.url || await page.handle.currentUrl();
    await assertBrowserNavigationResultAllowed(finalUrl, this.options.policy.navigation, this.options.lookup);
    const at = this.#now();
    session.lastUsedAt = at;
    page.lastUsedAt = at;
    page.url = finalUrl;
    this.#record("navigation.completed", { sessionId: session.sessionId, pageId: page.pageId, runId: session.owner.runId, detail: new URL(finalUrl).origin });
    return this.#viewPage(session.sessionId, page);
  }

  async #ensureBrowser(): Promise<BrowserProcessHandle> {
    if (this.#browser) return this.#browser;
    if (this.#launchPromise) return this.#launchPromise;
    this.#state = "LAUNCHING";
    this.#launchPromise = bounded(
      (signal) => this.options.driver.launch({
        headless: this.options.headless,
        ...(this.options.executablePath ? { executablePath: this.options.executablePath } : {}),
        signal,
        timeoutMs: this.options.limits.launchTimeoutMs,
      }),
      this.options.limits.launchTimeoutMs,
    ).then((browser) => {
      if (this.#state === "CLOSING" || this.#state === "CLOSED") {
        void browser.close().catch(() => undefined);
        throw new BrowserRuntimeError("BROWSER_RUNTIME_CLOSING", "browser runtime closed while launching");
      }
      this.#generation += 1;
      this.#browser = browser;
      this.#detachDisconnect = browser.onDisconnected((reason) => this.#onDisconnected(reason));
      this.#state = "READY";
      this.#record("browser.launched", { detail: browser.id });
      return browser;
    }).catch((error) => {
      if (this.#state !== "CLOSING" && this.#state !== "CLOSED") this.#state = "FAILED";
      const normalized = error instanceof BrowserRuntimeError && error.code === "BROWSER_OPERATION_TIMEOUT"
        ? new BrowserRuntimeError("BROWSER_LAUNCH_TIMEOUT", `browser launch exceeded ${this.options.limits.launchTimeoutMs}ms`, { cause: error })
        : error;
      const failureDetail = describeFailure(normalized);
      this.#record("runtime.failed", { detail: failureDetail });
      if (normalized instanceof BrowserRuntimeError) throw normalized;
      throw new BrowserRuntimeError("BROWSER_LAUNCH_FAILED", `browser launch failed: ${failureDetail}`, { cause: normalized });
    }).finally(() => {
      this.#launchPromise = null;
    });
    return this.#launchPromise;
  }

  #onDocumentNavigation(session: SessionRecord, page: PageRecord, navigation: BrowserDocumentNavigation): void {
    if (session.state !== "OPEN" || page.state !== "OPEN") return;
    this.#synchronizeDocument(session, page, navigation.documentGeneration, navigation.url);
  }

  #synchronizeDocument(session: SessionRecord, page: PageRecord, documentGeneration: number, url: string): void {
    if (!Number.isInteger(documentGeneration) || documentGeneration <= 0) {
      throw new BrowserRuntimeError("BROWSER_STALE_HANDLE", "browser adapter returned an invalid document generation");
    }
    if (documentGeneration < page.documentGeneration) {
      throw new BrowserRuntimeError("BROWSER_STALE_HANDLE", `browser observation belongs to stale document generation ${documentGeneration}`);
    }
    if (documentGeneration > page.documentGeneration) {
      page.documentGeneration = documentGeneration;
      page.nextElementRef = 0;
      page.elementRefs.clear();
      page.refElements.clear();
      page.url = url;
      const at = this.#now();
      page.lastUsedAt = at;
      session.lastUsedAt = at;
      this.#record("page.document_invalidated", {
        sessionId: session.sessionId,
        pageId: page.pageId,
        runId: session.owner.runId,
        detail: `documentGeneration=${documentGeneration}`,
      });
    }
  }

  #onDisconnected(reason?: unknown): void {
    if (this.#state === "CLOSING" || this.#state === "CLOSED") return;
    this.#browser = null;
    this.#detachDisconnect?.();
    this.#detachDisconnect = null;
    this.#generation += 1;
    this.#state = "FAILED";
    for (const session of this.#sessions.values()) {
      session.state = "CRASHED";
      for (const page of session.pages.values()) page.state = "CRASHED";
    }
    this.#record("browser.disconnected", { detail: reason instanceof Error ? reason.message : "browser disconnected" });
  }

  async #closePageRecord(session: SessionRecord, page: PageRecord): Promise<void> {
    if (page.state === "CLOSED" || page.state === "CRASHED") return;
    page.state = "CLOSING";
    page.detachPopup();
    page.detachDownload();
    page.detachNavigation();
    page.elementRefs.clear();
    page.refElements.clear();
    try { await page.handle.close(); } finally {
      page.state = "CLOSED";
      session.pages.delete(page.pageId);
      session.lastUsedAt = this.#now();
      this.#record("page.closed", { sessionId: session.sessionId, pageId: page.pageId, runId: session.owner.runId });
    }
  }

  async #closeSessionRecord(session: SessionRecord, kind: "session.closed" | "session.idle_closed" | "session.run_cancelled"): Promise<void> {
    if (session.state === "CLOSED") return;
    const wasCrashed = session.state === "CRASHED";
    if (!wasCrashed) session.state = "CLOSING";
    let firstError: unknown;
    for (const page of [...session.pages.values()]) {
      try { await this.#closePageRecord(session, page); }
      catch (error) { firstError ??= error; }
    }
    try { await session.context.close(); }
    catch (error) { firstError ??= error; }
    session.state = "CLOSED";
    this.#sessions.delete(session.sessionId);
    this.#record(kind, { sessionId: session.sessionId, runId: session.owner.runId, ...(wasCrashed ? { detail: "crashed" } : {}) });
    if (firstError) throw firstError;
  }

  #requireOwnedSession(sessionId: string, owner: BrowserOwner): SessionRecord {
    const session = this.#requireSession(sessionId);
    if (!sameOwner(session.owner, owner)) {
      throw new BrowserRuntimeError("BROWSER_SESSION_NOT_FOUND", `browser session not found: ${sessionId}`);
    }
    return session;
  }

  #requireSession(sessionId: string): SessionRecord {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new BrowserRuntimeError("BROWSER_SESSION_NOT_FOUND", `browser session not found: ${sessionId}`);
    if (session.state === "CRASHED" || session.state === "CLOSED") throw new BrowserRuntimeError("BROWSER_STALE_HANDLE", `browser session is stale: ${sessionId}`);
    return session;
  }

  #requirePage(session: SessionRecord, pageId: string): PageRecord {
    const page = session.pages.get(pageId);
    if (!page) throw new BrowserRuntimeError("BROWSER_PAGE_NOT_FOUND", `browser page not found: ${pageId}`);
    if (page.state === "CRASHED" || page.state === "CLOSED") throw new BrowserRuntimeError("BROWSER_STALE_HANDLE", `browser page is stale: ${pageId}`);
    return page;
  }

  #assertCurrent(generation: number): void {
    if (generation !== this.#generation || this.#state === "FAILED") throw new BrowserRuntimeError("BROWSER_STALE_HANDLE", "browser handle belongs to an invalid runtime generation");
  }

  #assertOpen(): void {
    if (this.#state === "CLOSING") throw new BrowserRuntimeError("BROWSER_RUNTIME_CLOSING", "browser runtime is closing");
    if (this.#state === "CLOSED") throw new BrowserRuntimeError("BROWSER_RUNTIME_CLOSED", "browser runtime is closed");
  }

  #viewPage(sessionId: string, page: PageRecord): BrowserPageView {
    return {
      pageId: page.pageId,
      sessionId,
      state: page.state,
      generation: page.generation,
      documentGeneration: page.documentGeneration,
      createdAt: page.createdAt,
      lastUsedAt: page.lastUsedAt,
      url: page.url,
    };
  }

  #record(kind: BrowserRuntimeEvent["kind"], fields: Omit<BrowserRuntimeEvent, "sequence" | "at" | "kind">): void {
    this.#events.push({ sequence: ++this.#eventSequence, at: this.#now(), kind, ...fields });
    if (this.#events.length > 256) this.#events.splice(0, this.#events.length - 256);
  }

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#transitionTail.then(operation, operation);
    this.#transitionTail = result.then(() => undefined, () => undefined);
    return result;
  }

  #track<T>(operation: Promise<T>): Promise<T> {
    this.#operations.add(operation);
    void operation.finally(() => this.#operations.delete(operation)).catch(() => undefined);
    return operation;
  }
}
