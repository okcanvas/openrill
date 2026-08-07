import type { IncomingMessage } from "node:http";
import { OPENRILL_WEBSOCKET_PATH, OPENRILL_WEBSOCKET_SUBPROTOCOL } from "@openrill/protocol";

export interface UpgradePolicyDecision {
  readonly accepted: boolean;
  readonly statusCode: number;
  readonly code: "OK" | "PATH_DENIED" | "REMOTE_DENIED" | "PROXY_DENIED" | "HOST_DENIED" | "ORIGIN_DENIED" | "UPGRADE_INVALID" | "SUBPROTOCOL_REQUIRED";
}

function isLoopbackAddress(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "::ffff:127.0.0.1";
}
function normalizeHost(value: string | undefined): string {
  if (!value) return "";
  if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1).toLowerCase();
  return value.split(":", 1)[0]!.toLowerCase();
}
function isLocalHostName(value: string): boolean {
  return value === "localhost" || value === "127.0.0.1" || value === "[::1]";
}
function hasForwardedHeaders(request: IncomingMessage): boolean {
  return request.headers.forwarded !== undefined || request.headers["x-forwarded-for"] !== undefined || request.headers["x-real-ip"] !== undefined;
}
function connectionRequestsUpgrade(request: IncomingMessage): boolean {
  const value = request.headers.connection;
  return typeof value === "string" && value.split(",").some((item) => item.trim().toLowerCase() === "upgrade");
}
function hasRequiredSubprotocol(request: IncomingMessage): boolean {
  const value = request.headers["sec-websocket-protocol"];
  if (typeof value !== "string") return false;
  return value.split(",").map((item) => item.trim()).includes(OPENRILL_WEBSOCKET_SUBPROTOCOL);
}
function originAllowed(origin: string | undefined, port: number): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
    if (!local || (url.protocol !== "http:" && url.protocol !== "https:")) return false;
    const originPort = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
    return originPort === port;
  } catch { return false; }
}

export function evaluateProtocolUpgrade(request: IncomingMessage, localPort: number): UpgradePolicyDecision {
  if (request.url !== OPENRILL_WEBSOCKET_PATH) return { accepted: false, statusCode: 404, code: "PATH_DENIED" };
  if (!isLoopbackAddress(request.socket.remoteAddress)) return { accepted: false, statusCode: 403, code: "REMOTE_DENIED" };
  if (hasForwardedHeaders(request)) return { accepted: false, statusCode: 403, code: "PROXY_DENIED" };
  if (!isLocalHostName(normalizeHost(request.headers.host))) return { accepted: false, statusCode: 403, code: "HOST_DENIED" };
  const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
  if (!originAllowed(origin, localPort)) return { accepted: false, statusCode: 403, code: "ORIGIN_DENIED" };
  if (request.method !== "GET" || request.headers.upgrade?.toLowerCase() !== "websocket" || !connectionRequestsUpgrade(request) || request.headers["sec-websocket-version"] !== "13") {
    return { accepted: false, statusCode: 400, code: "UPGRADE_INVALID" };
  }
  if (!hasRequiredSubprotocol(request)) return { accepted: false, statusCode: 400, code: "SUBPROTOCOL_REQUIRED" };
  return { accepted: true, statusCode: 101, code: "OK" };
}
