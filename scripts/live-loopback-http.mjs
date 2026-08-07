import { request as httpRequest } from "node:http";
import { performance } from "node:perf_hooks";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export class LiveLoopbackHttpError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "LiveLoopbackHttpError";
    this.code = code;
    this.details = details;
  }
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer`);
  return value;
}

function diagnosticPath(url) {
  return url.pathname || "/";
}

function safeLabel(value) {
  const label = String(value ?? "loopback-http").replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 120);
  return label || "loopback-http";
}

function emitStart({ label, method, url, timeoutMs, maxBytes, log }) {
  log(`OPENRILL_LIVE_HTTP_START label=${label} method=${method} origin=${url.origin} path=${diagnosticPath(url)} timeout_ms=${timeoutMs} max_bytes=${maxBytes}`);
}

function emitEnd({ label, method, url, state, status, bytes, contentType, elapsedMs, code, log }) {
  const fields = [
    `label=${label}`,
    `method=${method}`,
    `origin=${url.origin}`,
    `path=${diagnosticPath(url)}`,
    `state=${state}`,
    `elapsed_ms=${Math.round(elapsedMs)}`,
  ];
  if (status !== undefined) fields.push(`status=${status}`);
  if (bytes !== undefined) fields.push(`bytes=${bytes}`);
  if (contentType !== undefined) fields.push(`content_type=${JSON.stringify(contentType)}`);
  if (code) fields.push(`code=${code}`);
  log(`OPENRILL_LIVE_HTTP_END ${fields.join(" ")}`);
}

export async function requestLoopback(options) {
  const url = options.url instanceof URL ? options.url : new URL(options.url);
  if (url.protocol !== "http:") {
    throw new LiveLoopbackHttpError("LIVE_HTTP_PROTOCOL_NOT_ALLOWED", `loopback HTTP requires http:, received ${url.protocol}`, { protocol: url.protocol });
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new LiveLoopbackHttpError("LIVE_HTTP_HOST_NOT_LOOPBACK", `loopback HTTP host is not allowed: ${url.hostname}`, { hostname: url.hostname });
  }
  if (url.username || url.password) {
    throw new LiveLoopbackHttpError("LIVE_HTTP_CREDENTIALS_NOT_ALLOWED", "loopback HTTP URL credentials are not allowed");
  }
  const timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
  const maxBytes = positiveInteger(options.maxBytes ?? DEFAULT_MAX_BYTES, "maxBytes");
  const method = String(options.method ?? "GET").toUpperCase();
  const label = safeLabel(options.label);
  const log = typeof options.log === "function" ? options.log : console.log;
  const started = performance.now();
  emitStart({ label, method, url, timeoutMs, maxBytes, log });

  try {
    const result = await new Promise((resolve, reject) => {
      let settled = false;
      let requestClosed = false;
      let pendingError = null;
      let pendingResult = null;
      let closeFallback = null;
      let response = null;

      const clearCloseFallback = () => {
        if (closeFallback !== null) {
          clearTimeout(closeFallback);
          closeFallback = null;
        }
      };
      const settleRejected = () => {
        if (settled || pendingError === null) return;
        settled = true;
        clearCloseFallback();
        reject(pendingError);
      };
      const settleResolved = () => {
        if (settled || pendingResult === null || !requestClosed) return;
        settled = true;
        clearCloseFallback();
        resolve(pendingResult);
      };
      const failAfterClose = (error) => {
        if (settled || pendingError !== null) return;
        pendingError = error instanceof LiveLoopbackHttpError
          ? error
          : new LiveLoopbackHttpError(
            "LIVE_HTTP_REQUEST_FAILED",
            `loopback HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
            { causeCode: error && typeof error === "object" && "code" in error ? String(error.code) : "" },
          );
        if (response && !response.destroyed) response.destroy(pendingError);
        if (!request.destroyed) request.destroy(pendingError);
        if (requestClosed) {
          settleRejected();
          return;
        }
        closeFallback = setTimeout(() => settleRejected(), Math.min(Math.max(timeoutMs, 250), 2_000));
      };

      const request = httpRequest({
        protocol: "http:",
        hostname: url.hostname,
        port: url.port,
        method,
        path: `${url.pathname}${url.search}`,
        agent: false,
        headers: {
          accept: options.accept ?? "*/*",
          "accept-encoding": "identity",
          connection: "close",
          ...(options.headers ?? {}),
        },
      });
      request.once("error", (error) => failAfterClose(error));
      request.once("close", () => {
        requestClosed = true;
        if (pendingError !== null) settleRejected();
        else settleResolved();
      });
      request.setTimeout(timeoutMs, () => {
        failAfterClose(new LiveLoopbackHttpError("LIVE_HTTP_TIMEOUT", `loopback HTTP request timed out after ${timeoutMs}ms`, { timeoutMs }));
      });
      request.once("response", (incoming) => {
        response = incoming;
        const chunks = [];
        let bytes = 0;
        let responseEnded = false;
        incoming.on("data", (chunk) => {
          if (settled || pendingError !== null) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > maxBytes) {
            failAfterClose(new LiveLoopbackHttpError("LIVE_HTTP_BODY_TOO_LARGE", `loopback HTTP body exceeded ${maxBytes} bytes`, { maxBytes, observedBytes: bytes }));
            return;
          }
          chunks.push(buffer);
        });
        incoming.once("aborted", () => failAfterClose(new LiveLoopbackHttpError("LIVE_HTTP_RESPONSE_ABORTED", "loopback HTTP response was aborted", { bytes })));
        incoming.once("error", (error) => failAfterClose(error instanceof LiveLoopbackHttpError ? error : new LiveLoopbackHttpError(
          "LIVE_HTTP_RESPONSE_FAILED",
          `loopback HTTP response failed: ${error instanceof Error ? error.message : String(error)}`,
          { bytes },
        )));
        incoming.once("end", () => {
          responseEnded = true;
          if (settled || pendingError !== null) return;
          pendingResult = {
            url,
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            contentType: String(incoming.headers["content-type"] ?? ""),
            body: Buffer.concat(chunks, bytes),
          };
          settleResolved();
        });
        incoming.once("close", () => {
          if (!responseEnded && pendingError === null) {
            failAfterClose(new LiveLoopbackHttpError("LIVE_HTTP_RESPONSE_CLOSED_EARLY", "loopback HTTP response closed before end", { bytes }));
          }
        });
      });
      request.end(options.body);
    });
    emitEnd({
      label,
      method,
      url,
      state: "PASS",
      status: result.status,
      bytes: result.body.length,
      contentType: result.contentType,
      elapsedMs: performance.now() - started,
      log,
    });
    return result;
  } catch (error) {
    const normalized = error instanceof LiveLoopbackHttpError
      ? error
      : new LiveLoopbackHttpError("LIVE_HTTP_UNKNOWN_FAILURE", error instanceof Error ? error.message : String(error));
    emitEnd({ label, method, url, state: "FAIL", elapsedMs: performance.now() - started, code: normalized.code, log });
    throw normalized;
  }
}

export function requireHttpStatus(result, expectedStatus, label = "loopback-http") {
  if (result.status !== expectedStatus) {
    throw new LiveLoopbackHttpError(
      "LIVE_HTTP_UNEXPECTED_STATUS",
      `${label} expected HTTP ${expectedStatus}, received ${result.status}`,
      { expectedStatus, actualStatus: result.status, path: diagnosticPath(result.url), bytes: result.body.length },
    );
  }
  return result;
}

export function requireContentType(result, pattern, label = "loopback-http") {
  if (!pattern.test(result.contentType)) {
    throw new LiveLoopbackHttpError(
      "LIVE_HTTP_UNEXPECTED_CONTENT_TYPE",
      `${label} received unexpected content type ${JSON.stringify(result.contentType)}`,
      { contentType: result.contentType, path: diagnosticPath(result.url) },
    );
  }
  return result;
}

export async function getLoopbackBuffer(url, options = {}) {
  const result = await requestLoopback({ ...options, url, method: "GET" });
  if (options.expectedStatus !== undefined) requireHttpStatus(result, options.expectedStatus, options.label);
  if (options.contentTypePattern) requireContentType(result, options.contentTypePattern, options.label);
  return result;
}

export async function getLoopbackText(url, options = {}) {
  const result = await getLoopbackBuffer(url, options);
  return { ...result, text: result.body.toString(options.encoding ?? "utf8") };
}

export async function getLoopbackJson(url, options = {}) {
  const result = await getLoopbackBuffer(url, options);
  try {
    return { ...result, json: JSON.parse(result.body.toString("utf8")) };
  } catch (error) {
    throw new LiveLoopbackHttpError(
      "LIVE_HTTP_INVALID_JSON",
      `${options.label ?? "loopback-http"} returned invalid JSON`,
      { path: diagnosticPath(result.url), bytes: result.body.length, cause: error instanceof Error ? error.message : String(error) },
    );
  }
}
