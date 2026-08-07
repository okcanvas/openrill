const MAX_DIAGNOSTICS = 64;
const MAX_TEXT = 1200;

function text(value, limit = MAX_TEXT) {
  const normalized = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}…`;
}

function pushBounded(state, entry) {
  state.entries.push(entry);
  if (state.entries.length > MAX_DIAGNOSTICS) state.entries.splice(0, state.entries.length - MAX_DIAGNOSTICS);
}

export function createBrowserPageEvidence() {
  return { entries: [] };
}

export function attachBrowserPageEvidence(cdp, state) {
  cdp.on("Runtime.exceptionThrown", (params) => {
    const details = params?.exceptionDetails ?? {};
    pushBounded(state, {
      kind: "runtime.exception",
      text: text(details.exception?.description ?? details.text ?? "runtime exception"),
      url: text(details.url ?? "", 512),
      line: Number.isInteger(details.lineNumber) ? details.lineNumber : null,
      column: Number.isInteger(details.columnNumber) ? details.columnNumber : null,
    });
  });
  cdp.on("Runtime.consoleAPICalled", (params) => {
    if (!new Set(["error", "warning", "assert"]).has(params?.type)) return;
    pushBounded(state, {
      kind: `console.${params.type}`,
      text: text((params.args ?? []).map((entry) => entry?.value ?? entry?.description ?? "").join(" ")),
      url: text(params.stackTrace?.callFrames?.[0]?.url ?? "", 512),
    });
  });
  cdp.on("Log.entryAdded", (params) => {
    const entry = params?.entry ?? {};
    if (!new Set(["error", "warning"]).has(entry.level)) return;
    pushBounded(state, { kind: `log.${entry.level}`, text: text(entry.text), url: text(entry.url ?? "", 512) });
  });
  cdp.on("Network.loadingFailed", (params) => {
    pushBounded(state, {
      kind: "network.failed",
      requestId: text(params?.requestId ?? "", 128),
      errorText: text(params?.errorText ?? "network loading failed", 512),
      blockedReason: text(params?.blockedReason ?? "", 256),
      canceled: params?.canceled === true,
    });
  });
  cdp.on("Network.responseReceived", (params) => {
    const response = params?.response ?? {};
    if (typeof response.status !== "number" || response.status < 400) return;
    pushBounded(state, {
      kind: "network.http",
      status: response.status,
      statusText: text(response.statusText ?? "", 256),
      url: text(response.url ?? "", 512),
      mimeType: text(response.mimeType ?? "", 128),
    });
  });
  cdp.on("Page.javascriptDialogOpening", (params) => {
    pushBounded(state, { kind: "page.dialog", type: text(params?.type ?? "", 64), message: text(params?.message ?? "") });
  });
  return state;
}

export async function enableBrowserPageEvidence(cdp) {
  await Promise.all([
    cdp.call("Runtime.enable"),
    cdp.call("Page.enable"),
    cdp.call("Log.enable"),
    cdp.call("Network.enable"),
  ]);
}

export async function readBrowserPageState(cdp) {
  const expression = `(() => ({
    url: location.href,
    readyState: document.readyState,
    title: document.title,
    vueVersion: window.Vue?.version ?? null,
    appShell: !!document.querySelector('[data-testid="app-shell"]'),
    connection: document.querySelector('[data-testid="connection-state"]')?.textContent ?? null,
    startupPhase: document.querySelector('[data-testid="startup-phase"]')?.textContent ?? null,
    alert: document.querySelector('[role="alert"]')?.textContent ?? null,
    appText: document.querySelector('#app')?.textContent?.slice(0, 1200) ?? null,
    scripts: Array.from(document.scripts).map((item) => ({ src: item.src || null, type: item.type || 'classic' })),
    resources: performance.getEntriesByType('resource').slice(-24).map((entry) => ({ name: entry.name, initiatorType: entry.initiatorType, duration: Math.round(entry.duration) })),
  }))()`;
  try {
    const result = await cdp.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) return { evaluationError: text(result.exceptionDetails.text ?? "browser state evaluation failed") };
    return result.result?.value ?? null;
  } catch (error) {
    return { evaluationError: text(error instanceof Error ? error.message : String(error)) };
  }
}

export function formatBrowserPageEvidence(description, state, pageState, lastValue) {
  return [
    `browser wait timeout: ${description}`,
    "OPENRILL_BROWSER_EVIDENCE_BEGIN",
    JSON.stringify({ lastValue, pageState, diagnostics: state.entries }, null, 2),
    "OPENRILL_BROWSER_EVIDENCE_END",
  ].join("\n");
}

export async function waitForBrowserCondition(cdp, expression, description, options = {}) {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const evidence = options.evidence ?? createBrowserPageEvidence();
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  let firstAttempt = true;
  while (firstAttempt || Date.now() < deadline) {
    firstAttempt = false;
    try {
      const result = await cdp.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (result.exceptionDetails) lastValue = { exception: result.exceptionDetails.text ?? "evaluation failed" };
      else {
        lastValue = result.result?.value;
        if (lastValue) return lastValue;
      }
    } catch (error) {
      lastValue = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const pageState = await readBrowserPageState(cdp);
  throw new Error(formatBrowserPageEvidence(description, evidence, pageState, lastValue));
}
