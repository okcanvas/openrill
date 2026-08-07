import { createHash } from "node:crypto";
import { WorkspaceError } from "@openrill/workspace";

export function revisionForBytes(content: Uint8Array): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function revisionForText(content: string): string {
  return revisionForBytes(Buffer.from(content, "utf8"));
}

export function decodeWorkspaceText(content: Uint8Array, relativePath: string): string {
  if (content.includes(0)) throw new WorkspaceError("WORKSPACE_BINARY_FILE_DENIED", `binary workspace file is not readable as text: ${relativePath}`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch (error) {
    throw new WorkspaceError("WORKSPACE_BINARY_FILE_DENIED", `workspace file is not valid UTF-8 text: ${relativePath}`, { cause: error });
  }
}

export function buildCompactDiff(before: string | null, after: string, maxBytes = 64 * 1024): { readonly text: string; readonly truncated: boolean } {
  const oldLines = (before ?? "").split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1;
  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const lines = [
    "--- before",
    "+++ after",
    `@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@`,
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
  ];
  const full = `${lines.join("\n")}\n`;
  const bytes = Buffer.byteLength(full, "utf8");
  if (bytes <= maxBytes) return { text: full, truncated: false };
  const buffer = Buffer.from(full, "utf8").subarray(0, maxBytes);
  return { text: `${new TextDecoder("utf-8", { fatal: false }).decode(buffer)}\n...DIFF_TRUNCATED...\n`, truncated: true };
}

export function countOccurrences(content: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = content.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}
