import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { MattermostError } from "./errors.js";

function privateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a === 0;
}

function privateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return normalized === "::1"
    || normalized === "::"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb");
}

function privateAddress(address: string): boolean {
  const kind = isIP(address);
  return kind === 4 ? privateIpv4(address) : kind === 6 ? privateIpv6(address) : false;
}

export function normalizeMattermostBaseUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost baseUrl is invalid", false); }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost baseUrl must use http or https", false);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost baseUrl must not contain credentials, query, or fragment", false);
  }
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api\/v4$/i, "");
  if (!url.pathname) url.pathname = "/";
  return url.toString().replace(/\/$/, "");
}

export function mattermostApiUrl(baseUrl: string, path: string): string {
  const normalized = normalizeMattermostBaseUrl(baseUrl);
  if (!path.startsWith("/") || path.includes("\\")) {
    throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost API path is invalid", false);
  }
  for (const segment of path.split("/")) {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); }
    catch { throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost API path is invalid", false); }
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
      throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost API path is invalid", false);
    }
  }
  return `${normalized}/api/v4${path}`;
}

export function mattermostWebSocketUrl(baseUrl: string): string {
  const url = new URL(normalizeMattermostBaseUrl(baseUrl));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/api/v4/websocket`;
  return url.toString();
}

export async function assertMattermostNetworkAllowed(urlInput: string, allowPrivateNetwork: boolean): Promise<void> {
  const url = new URL(urlInput);
  if (allowPrivateNetwork) return;
  const addresses = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0) {
    throw new MattermostError("MATTERMOST_API_UNAVAILABLE", "Mattermost host resolution failed", true, "NOT_SENT");
  }
  if (addresses.some((entry) => privateAddress(entry.address))) {
    throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost private network access requires explicit opt-in", false, "NOT_SENT");
  }
}
