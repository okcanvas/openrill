import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { BrowserRuntimeError } from "./errors.js";
import type { BrowserHostnameLookup, BrowserNavigationPolicy } from "./types.js";

const NETWORK_PROTOCOLS = new Set(["http:", "https:"]);
const SAFE_NON_NETWORK_URLS = new Set(["about:blank"]);

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function matchHostname(hostname: string, pattern: string): boolean {
  const normalized = normalizeHostname(hostname);
  const candidate = normalizeHostname(pattern);
  if (!candidate) return false;
  if (candidate.startsWith("*.")) {
    const suffix = candidate.slice(1);
    return normalized.endsWith(suffix) && normalized.length > suffix.length;
  }
  return normalized === candidate;
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map((value) => Number.parseInt(value, 10));
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a = 0, b = 0] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("ff");
}

export function isPrivateNetworkAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return false;
}

export const defaultBrowserHostnameLookup: BrowserHostnameLookup = async (hostname) => {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => ({ address: entry.address, family: entry.family as 4 | 6 }));
};

export function parseBrowserNavigationUrl(rawUrl: string): URL {
  const value = rawUrl.trim();
  if (!value) throw new BrowserRuntimeError("BROWSER_NAVIGATION_BLOCKED", "browser navigation URL is required");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    const diagnostic = value.includes("@") ? "[redacted credential-bearing URL]" : value;
    throw new BrowserRuntimeError("BROWSER_NAVIGATION_BLOCKED", `invalid browser navigation URL: ${diagnostic}`, { cause: error });
  }
  if (parsed.username || parsed.password) {
    throw new BrowserRuntimeError("BROWSER_NAVIGATION_BLOCKED", "browser navigation URL credentials are not allowed");
  }
  return parsed;
}

export async function assertBrowserNavigationAllowed(
  rawUrl: string,
  policy: BrowserNavigationPolicy,
  lookup: BrowserHostnameLookup = defaultBrowserHostnameLookup,
): Promise<URL> {
  const parsed = parseBrowserNavigationUrl(rawUrl);
  if (!NETWORK_PROTOCOLS.has(parsed.protocol)) {
    if (SAFE_NON_NETWORK_URLS.has(parsed.href)) return parsed;
    throw new BrowserRuntimeError("BROWSER_NAVIGATION_BLOCKED", `browser navigation protocol is not allowed: ${parsed.protocol}`);
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (policy.allowedHostnames.some((pattern) => matchHostname(hostname, pattern))) return parsed;

  if (isIP(hostname) !== 0) {
    if (!policy.allowPrivateNetwork && isPrivateNetworkAddress(hostname)) {
      throw new BrowserRuntimeError("BROWSER_NAVIGATION_BLOCKED", `private browser navigation address is not allowed: ${hostname}`);
    }
    return parsed;
  }

  let resolved: readonly { readonly address: string; readonly family: 4 | 6 }[];
  try {
    resolved = await lookup(hostname);
  } catch (error) {
    throw new BrowserRuntimeError("BROWSER_NAVIGATION_BLOCKED", `browser navigation hostname could not be resolved: ${hostname}`, { cause: error });
  }
  if (resolved.length === 0) {
    throw new BrowserRuntimeError("BROWSER_NAVIGATION_BLOCKED", `browser navigation hostname resolved to no addresses: ${hostname}`);
  }
  if (!policy.allowPrivateNetwork && resolved.some((entry) => isPrivateNetworkAddress(entry.address))) {
    throw new BrowserRuntimeError("BROWSER_NAVIGATION_BLOCKED", `browser navigation hostname resolves to a private address: ${hostname}`);
  }
  return parsed;
}

export async function assertBrowserNavigationResultAllowed(
  rawUrl: string,
  policy: BrowserNavigationPolicy,
  lookup: BrowserHostnameLookup = defaultBrowserHostnameLookup,
): Promise<URL> {
  return assertBrowserNavigationAllowed(rawUrl, policy, lookup);
}
