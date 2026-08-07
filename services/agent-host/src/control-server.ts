import { timingSafeEqual } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import type { HostStatusPayload, HostStopPayload, PublicWorkspaceView } from "@openrill/protocol";
import type { ControlUiArtifactContent } from "./control-ui-service.js";

const MAX_STATIC_ASSET_BYTES = 2 * 1024 * 1024;
const SAFE_ASSET_PATH = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,255}$/;
const SPA_ROUTES = new Set(["/", "/conversations", "/workspaces", "/skills", "/approvals", "/artifacts", "/settings", "/diagnostics"]);

function bearerMatches(header: string | undefined, token: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function securityHeaders(contentType: string, cacheControl = "no-store"): Record<string, string> {
  return {
    "content-type": contentType,
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin",
    "content-security-policy": "default-src 'none'; script-src 'self' 'sha256-RxS5yYucHp1VAnFXpTJ8qirCzQyQvS680H/Cskklvg8='; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  };
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  const body = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  response.writeHead(statusCode, { ...securityHeaders("application/json; charset=utf-8"), "content-length": String(body.length), connection: "close" });
  response.end(body);
}

function writeBytes(response: ServerResponse, statusCode: number, body: Buffer, contentType: string, cacheControl = "no-store"): void {
  response.writeHead(statusCode, { ...securityHeaders(contentType, cacheControl), "content-length": String(body.length), connection: "close" });
  response.end(body);
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function expectedHosts(status: HostStatusPayload): Set<string> {
  return new Set([`127.0.0.1:${status.port}`, `localhost:${status.port}`, `[::1]:${status.port}`]);
}

export function evaluateControlUiHttpRequest(request: IncomingMessage, status: HostStatusPayload): { readonly accepted: true; readonly host: string } | { readonly accepted: false; readonly statusCode: number; readonly code: string } {
  if (!isLoopbackAddress(request.socket.remoteAddress)) return { accepted: false, statusCode: 403, code: "UI_REMOTE_DENIED" };
  if (request.headers["x-forwarded-host"] || request.headers["x-forwarded-for"] || request.headers["x-forwarded-proto"] || request.headers.forwarded) {
    return { accepted: false, statusCode: 403, code: "UI_PROXY_HEADERS_DENIED" };
  }
  const host = request.headers.host ?? "";
  if (!expectedHosts(status).has(host)) return { accepted: false, statusCode: 421, code: "UI_HOST_DENIED" };
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) return { accepted: false, statusCode: 403, code: "UI_ORIGIN_DENIED" };
  return { accepted: true, host };
}

function contentTypeFor(pathname: string): string {
  switch (extname(pathname)) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

async function readStatic(root: string, relativePath: string): Promise<{ readonly body: Buffer; readonly contentType: string } | null> {
  if (!SAFE_ASSET_PATH.test(relativePath) || relativePath.includes("..") || relativePath.includes("//")) return null;
  const canonicalRoot = await realpath(root);
  let canonical: string;
  try { canonical = await realpath(join(canonicalRoot, relativePath)); } catch { return null; }
  const rel = relative(canonicalRoot, canonical);
  if (rel === ".." || rel.startsWith(`..${sep}`)) return null;
  const details = await stat(canonical);
  if (!details.isFile() || details.size > MAX_STATIC_ASSET_BYTES) return null;
  return { body: await readFile(canonical), contentType: contentTypeFor(canonical) };
}

export interface ControlUiBootstrap {
  readonly product: "OpenRill";
  readonly version: string;
  readonly profile: string;
  readonly instanceId: string;
  readonly protocol: { readonly path: "/protocol"; readonly token: string };
  readonly workspaces: readonly PublicWorkspaceView[];
}

export function createLifecycleRequestHandler(options: {
  readonly controlToken: string;
  readonly protocolToken?: string;
  readonly controlUiRoot?: string;
  readonly getStatus: () => HostStatusPayload;
  readonly getControlUiWorkspaces?: () => readonly PublicWorkspaceView[];
  readonly readArtifactContent?: (artifactId: string, fileName: string) => Promise<ControlUiArtifactContent | null>;
  readonly requestStop: () => boolean;
}): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void (async () => {
      const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (requestUrl.pathname.startsWith("/lifecycle/")) {
        if (!bearerMatches(request.headers.authorization, options.controlToken)) {
          writeJson(response, 401, { error: "unauthorized" });
          return;
        }
        if (request.method === "GET" && requestUrl.pathname === "/lifecycle/status") {
          writeJson(response, 200, options.getStatus());
          return;
        }
        if (request.method === "POST" && requestUrl.pathname === "/lifecycle/stop") {
          const status = options.getStatus();
          const accepted = options.requestStop();
          const payload: HostStopPayload = { accepted, alreadyStopping: !accepted, instanceId: status.instanceId };
          writeJson(response, accepted ? 202 : 200, payload);
          return;
        }
        writeJson(response, 404, { error: "not_found" });
        return;
      }

      const status = options.getStatus();
      const policy = evaluateControlUiHttpRequest(request, status);
      if (!policy.accepted) { writeJson(response, policy.statusCode, { error: policy.code }); return; }
      if (request.method !== "GET") { writeJson(response, 405, { error: "method_not_allowed" }); return; }

      if (requestUrl.pathname === "/ui/bootstrap") {
        if (!options.protocolToken) { writeJson(response, 404, { error: "not_found" }); return; }
        const payload: ControlUiBootstrap = {
          product: "OpenRill",
          version: status.version,
          profile: status.profile,
          instanceId: status.instanceId,
          protocol: { path: "/protocol", token: options.protocolToken },
          workspaces: options.getControlUiWorkspaces?.() ?? [],
        };
        writeJson(response, 200, payload);
        return;
      }

      const artifactMatch = /^\/ui\/artifacts\/([A-Za-z0-9._:-]{1,128})\/content$/.exec(requestUrl.pathname);
      if (artifactMatch) {
        if (!options.protocolToken || !bearerMatches(request.headers.authorization, options.protocolToken)) {
          writeJson(response, 401, { error: "unauthorized" });
          return;
        }
        const fileName = requestUrl.searchParams.get("file") ?? "";
        const content = await options.readArtifactContent?.(artifactMatch[1]!, fileName);
        if (!content) { writeJson(response, 404, { error: "not_found" }); return; }
        writeBytes(response, 200, content.bytes, content.mediaType);
        return;
      }

      if (!options.controlUiRoot) { writeJson(response, 404, { error: "not_found" }); return; }
      const assetPath = requestUrl.pathname.startsWith("/assets/") || requestUrl.pathname.startsWith("/vendor/")
        ? requestUrl.pathname.slice(1)
        : SPA_ROUTES.has(requestUrl.pathname) ? "index.html" : null;
      if (!assetPath) { writeJson(response, 404, { error: "not_found" }); return; }
      const asset = await readStatic(resolve(options.controlUiRoot), assetPath);
      if (!asset) { writeJson(response, 404, { error: "not_found" }); return; }
      writeBytes(response, 200, asset.body, asset.contentType, assetPath.startsWith("vendor/") ? "public, max-age=31536000, immutable" : "no-store");
    })().catch(() => {
      if (!response.headersSent) writeJson(response, 500, { error: "internal_error" });
      else response.destroy();
    });
  };
}

export async function listenHttpServer(server: http.Server, bind: string, port: number): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const onError = (error: Error) => { server.removeListener("listening", onListening); reject(error); };
    const onListening = () => {
      server.removeListener("error", onError);
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Host listener has no TCP address"));
      resolvePort(address.port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: bind, port, exclusive: true });
  });
}

export async function closeHttpServer(server: http.Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}
