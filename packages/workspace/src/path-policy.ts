import { posix, win32 } from "node:path";
import { WorkspaceError } from "./errors.js";

const DENIED_SEGMENTS = new Set([".git", ".hg", ".svn", "node_modules", ".openrill"]);
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const INVALID_PORTABLE_CHARS = /[<>:"|?*\u0000-\u001f]/;
const SECRET_BASENAME = /^(?:\.env(?:\..+)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|credentials(?:\..+)?|secrets?(?:\..+)?|.*\.(?:pem|key|p12|pfx|jks|keystore))$/i;

export function normalizeWorkspaceRelativePath(raw: string, options: { readonly allowRoot?: boolean } = {}): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) {
    throw new WorkspaceError("WORKSPACE_PATH_INVALID", "workspace path must be a non-empty string of at most 4096 characters");
  }
  const normalizedInput = raw.replaceAll("\\", "/");
  if (posix.isAbsolute(normalizedInput) || win32.isAbsolute(raw) || /^[A-Za-z]:/.test(raw) || normalizedInput.startsWith("//")) {
    throw new WorkspaceError("WORKSPACE_PATH_INVALID", "workspace path must be relative");
  }
  const output: string[] = [];
  for (const segment of normalizedInput.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") throw new WorkspaceError("WORKSPACE_PATH_ESCAPE", "workspace path traversal is not allowed");
    if (segment.length > 255 || INVALID_PORTABLE_CHARS.test(segment) || /[. ]$/.test(segment) || WINDOWS_RESERVED.test(segment)) {
      throw new WorkspaceError("WORKSPACE_PATH_INVALID", `workspace path segment is not portable: ${segment}`);
    }
    output.push(segment);
  }
  const relativePath = output.join("/");
  if (!relativePath && options.allowRoot !== true) {
    throw new WorkspaceError("WORKSPACE_PATH_INVALID", "workspace root is not valid for this operation");
  }
  return relativePath;
}

export function assertWorkspacePathPolicy(relativePath: string): void {
  const segments = relativePath.split("/").filter(Boolean);
  for (const segment of segments) {
    if (DENIED_SEGMENTS.has(segment.toLowerCase())) {
      throw new WorkspaceError("WORKSPACE_PATH_DENIED", `workspace path is denied by policy: ${relativePath}`);
    }
  }
  for (const segment of segments) {
    if (SECRET_BASENAME.test(segment)) {
      throw new WorkspaceError("WORKSPACE_SECRET_PATH_DENIED", `secret-like workspace path is denied: ${relativePath}`);
    }
  }
}

export function isWorkspacePathVisible(relativePath: string): boolean {
  try {
    assertWorkspacePathPolicy(relativePath);
    return true;
  } catch {
    return false;
  }
}
