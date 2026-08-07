import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { ConfigIncludeError } from "./errors.js";
import { deepMergeConfig, sha256Text, stableJson } from "./canonical.js";
import { parseOpenRillYaml } from "./yaml-subset.js";

export interface IncludeLimits {
  readonly maxDepth: number;
  readonly maxFiles: number;
  readonly maxTotalBytes: number;
}

export const DEFAULT_INCLUDE_LIMITS: IncludeLimits = {
  maxDepth: 8,
  maxFiles: 32,
  maxTotalBytes: 512 * 1024,
};

export interface ResolvedConfigSource {
  readonly source: unknown;
  readonly sourceFiles: readonly string[];
  readonly rawRoot: string;
  readonly sourceRevision: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function within(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function normalizeIncludeList(value: unknown, ownerPath: string): string[] {
  if (value === undefined) return [];
  const list = typeof value === "string" ? [value] : value;
  if (!Array.isArray(list) || list.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    throw new ConfigIncludeError("CONFIG_INCLUDE_INVALID", `include in ${ownerPath} must be a non-empty string or string array`);
  }
  return list.map((entry) => (entry as string).trim());
}

function removeInclude(value: Record<string, unknown>): Record<string, unknown> {
  const { include: _include, ...rest } = value;
  return rest;
}

export async function resolveConfigSource(
  sourcePath: string,
  configRoot: string,
  limits: IncludeLimits = DEFAULT_INCLUDE_LIMITS,
): Promise<ResolvedConfigSource> {
  const rootReal = await realpath(configRoot).catch(() => resolve(configRoot));
  const visited = new Set<string>();
  const stack: string[] = [];
  const sourceFiles: string[] = [];
  let totalBytes = 0;
  let rawRoot = "";
  const revisionEntries: Array<{ path: string; raw: string }> = [];

  async function visit(candidatePath: string, depth: number, isRoot: boolean): Promise<unknown> {
    if (depth > limits.maxDepth) {
      throw new ConfigIncludeError("CONFIG_INCLUDE_LIMIT", `config include depth exceeds ${limits.maxDepth}`, candidatePath);
    }
    if (revisionEntries.length >= limits.maxFiles) {
      throw new ConfigIncludeError("CONFIG_INCLUDE_LIMIT", `config include file count exceeds ${limits.maxFiles}`, candidatePath);
    }
    const lexical = resolve(candidatePath);
    if (!within(resolve(configRoot), lexical)) {
      throw new ConfigIncludeError("CONFIG_INCLUDE_ESCAPE", `config include escapes profile config root: ${candidatePath}`, candidatePath);
    }
    let fileReal: string;
    try {
      const stats = await lstat(lexical);
      if (!stats.isFile() && !stats.isSymbolicLink()) {
        throw new ConfigIncludeError("CONFIG_INCLUDE_INVALID", `config include is not a file: ${candidatePath}`, candidatePath);
      }
      fileReal = await realpath(lexical);
    } catch (error) {
      if (error instanceof ConfigIncludeError) throw error;
      throw new ConfigIncludeError("CONFIG_INCLUDE_INVALID", `cannot read config include: ${candidatePath}`, candidatePath, { cause: error });
    }
    if (!within(rootReal, fileReal)) {
      throw new ConfigIncludeError("CONFIG_INCLUDE_ESCAPE", `config include real path escapes profile config root: ${candidatePath}`, candidatePath);
    }
    if (stack.includes(fileReal)) {
      throw new ConfigIncludeError("CONFIG_INCLUDE_CYCLE", `config include cycle: ${[...stack, fileReal].join(" -> ")}`, candidatePath);
    }
    if (visited.has(fileReal)) return {};
    stack.push(fileReal);
    const raw = await readFile(fileReal, "utf8");
    if (isRoot) rawRoot = raw;
    totalBytes += Buffer.byteLength(raw, "utf8");
    if (totalBytes > limits.maxTotalBytes) {
      throw new ConfigIncludeError("CONFIG_INCLUDE_LIMIT", `config include bytes exceed ${limits.maxTotalBytes}`, candidatePath);
    }
    revisionEntries.push({ path: relative(resolve(configRoot), fileReal).split(sep).join("/"), raw });
    const parsed = parseOpenRillYaml(raw);
    if (!isRecord(parsed)) {
      throw new ConfigIncludeError("CONFIG_INCLUDE_INVALID", `config document must be an object: ${candidatePath}`, candidatePath);
    }
    let merged: unknown = {};
    for (const include of normalizeIncludeList(parsed.include, candidatePath)) {
      if (isAbsolute(include)) {
        throw new ConfigIncludeError("CONFIG_INCLUDE_ESCAPE", `absolute config include is forbidden: ${include}`, include);
      }
      const included = await visit(resolve(dirname(fileReal), include), depth + 1, false);
      merged = deepMergeConfig(merged, included);
    }
    merged = deepMergeConfig(merged, removeInclude(parsed));
    stack.pop();
    visited.add(fileReal);
    sourceFiles.push(fileReal);
    return merged;
  }

  const source = await visit(sourcePath, 0, true);
  const sourceRevision = sha256Text(stableJson(revisionEntries.sort((a, b) => a.path.localeCompare(b.path))));
  return { source, sourceFiles, rawRoot, sourceRevision };
}
