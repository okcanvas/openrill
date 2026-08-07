import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { RegisteredTool, ToolExecutionContext, ToolExecutionResult, ToolRegistry } from "@openrill/tool-runtime";
import type { WorkspaceCatalog, WorkspaceFileReference } from "@openrill/workspace";
import { WorkspaceError, isWorkspacePathVisible } from "@openrill/workspace";
import { atomicWriteWorkspaceText, assertExpectedRevision, readCurrentTextFile } from "./io.js";
import { withWorkspaceFileMutation } from "./mutation-queue.js";
import { buildCompactDiff, countOccurrences, decodeWorkspaceText, revisionForBytes } from "./text.js";
import type { WorkspaceArtifactStore, WorkspaceFileToolLimits } from "./types.js";

export const DEFAULT_WORKSPACE_FILE_TOOL_LIMITS: WorkspaceFileToolLimits = {
  maxFileBytes: 4 * 1024 * 1024,
  maxReadBytes: 64 * 1024,
  maxReadLines: 400,
  maxListEntries: 500,
  maxSearchFiles: 2_000,
  maxSearchMatches: 200,
  maxSearchBytes: 4 * 1024 * 1024,
  maxPatchReplacements: 32,
  maxArtifactBytes: 8 * 1024 * 1024,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isPathInput(value: unknown, extra: readonly string[] = []): value is Record<string, unknown> & { path: string } {
  return isRecord(value) && typeof value.path === "string" && hasOnly(value, ["path", ...extra]);
}

function errorResult(error: WorkspaceError): ToolExecutionResult {
  return { output: { error: { code: error.code, message: error.message } }, isError: true };
}

async function expectedFailureAsResult(action: () => Promise<unknown>): Promise<ToolExecutionResult> {
  try {
    return { output: await action(), isError: false };
  } catch (error) {
    if (error instanceof WorkspaceError) return errorResult(error);
    throw error;
  }
}

function ref(workspaceId: string, relativePath: string): WorkspaceFileReference {
  return { workspaceId, relativePath };
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new TypeError("bounded integer validation mismatch");
  return value as number;
}

function toolContextWorkspace(context: ToolExecutionContext): string {
  if (!context.workspaceId) throw new WorkspaceError("WORKSPACE_NOT_FOUND", "tool execution has no workspace identity");
  return context.workspaceId;
}

export function createWorkspaceFileTools(options: {
  readonly workspaces: WorkspaceCatalog;
  readonly artifacts?: WorkspaceArtifactStore;
  readonly limits?: Partial<WorkspaceFileToolLimits>;
}): RegisteredTool[] {
  const limits = { ...DEFAULT_WORKSPACE_FILE_TOOL_LIMITS, ...options.limits };

  const listTool: RegisteredTool = {
    name: "workspace.list",
    description: "List a configured workspace directory without exposing absolute host paths.",
    inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: limits.maxListEntries } }, required: ["path"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isPathInput(value, ["limit"]) && (value.limit === undefined || isIntegerInRange(value.limit, 1, limits.maxListEntries)),
    execute: (input, context) => expectedFailureAsResult(async () => {
      const workspaceId = toolContextWorkspace(context);
      const resolved = await options.workspaces.resolve(workspaceId, input.path as string, "LIST", { allowRoot: true, mustExist: true });
      const target = await stat(resolved.absolutePath);
      if (!target.isDirectory()) throw new WorkspaceError("WORKSPACE_FILE_TYPE_UNSUPPORTED", `workspace path is not a directory: ${resolved.relativePath}`);
      const maxEntries = boundedInteger(input.limit, limits.maxListEntries, 1, limits.maxListEntries);
      const rawEntries = await readdir(resolved.absolutePath, { withFileTypes: true });
      const visible = rawEntries
        .map((entry) => ({ entry, relativePath: resolved.relativePath ? `${resolved.relativePath}/${entry.name}` : entry.name }))
        .filter(({ relativePath }) => isWorkspacePathVisible(relativePath))
        .sort((left, right) => left.entry.name.localeCompare(right.entry.name));
      const selected = visible.slice(0, maxEntries);
      return {
        ref: ref(workspaceId, resolved.relativePath),
        entries: selected.map(({ entry, relativePath }) => ({
          name: entry.name,
          ref: ref(workspaceId, relativePath),
          kind: entry.isDirectory() ? "DIRECTORY" : entry.isFile() ? "FILE" : entry.isSymbolicLink() ? "SYMLINK" : "OTHER",
        })),
        totalVisibleEntries: visible.length,
        omittedByPolicy: rawEntries.length - visible.length,
        truncated: visible.length > selected.length,
      };
    }),
  };

  const statTool: RegisteredTool = {
    name: "workspace.stat",
    description: "Return bounded metadata and content revision for one workspace path.",
    inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string" } }, required: ["path"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isPathInput(value),
    execute: (input, context) => expectedFailureAsResult(async () => {
      const workspaceId = toolContextWorkspace(context);
      const resolved = await options.workspaces.resolve(workspaceId, input.path as string, "READ", { allowRoot: true, mustExist: true });
      const details = await stat(resolved.absolutePath);
      let revision: string | null = null;
      if (details.isFile() && details.size <= limits.maxFileBytes) revision = revisionForBytes(await readFile(resolved.absolutePath));
      return {
        ref: ref(workspaceId, resolved.relativePath),
        kind: details.isFile() ? "FILE" : details.isDirectory() ? "DIRECTORY" : "OTHER",
        sizeBytes: details.size,
        modifiedAtMs: details.mtimeMs,
        revision,
        viaSymlink: resolved.viaSymlink,
      };
    }),
  };

  const readTool: RegisteredTool = {
    name: "workspace.read",
    description: "Read bounded UTF-8 text from a configured workspace file.",
    inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string" }, offsetLine: { type: "integer", minimum: 1 }, maxLines: { type: "integer", minimum: 1 }, maxBytes: { type: "integer", minimum: 1 } }, required: ["path"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isPathInput(value, ["offsetLine", "maxLines", "maxBytes"])
      && (value.offsetLine === undefined || isIntegerInRange(value.offsetLine, 1, Number.MAX_SAFE_INTEGER))
      && (value.maxLines === undefined || isIntegerInRange(value.maxLines, 1, limits.maxReadLines))
      && (value.maxBytes === undefined || isIntegerInRange(value.maxBytes, 1, limits.maxReadBytes)),
    execute: (input, context) => expectedFailureAsResult(async () => {
      const workspaceId = toolContextWorkspace(context);
      const resolved = await options.workspaces.resolve(workspaceId, input.path as string, "READ", { mustExist: true });
      const current = await readCurrentTextFile(resolved, limits.maxFileBytes);
      const content = current.content!;
      const lines = content.split("\n");
      const offsetLine = boundedInteger(input.offsetLine, 1, 1, Math.max(1, lines.length + 1));
      const maxLines = boundedInteger(input.maxLines, limits.maxReadLines, 1, limits.maxReadLines);
      const maxBytes = boundedInteger(input.maxBytes, limits.maxReadBytes, 1, limits.maxReadBytes);
      const selected: string[] = [];
      let outputBytes = 0;
      let truncatedByBytes = false;
      for (const line of lines.slice(offsetLine - 1, offsetLine - 1 + maxLines)) {
        const candidate = selected.length === 0 ? line : `\n${line}`;
        const bytes = Buffer.byteLength(candidate, "utf8");
        if (outputBytes + bytes > maxBytes) { truncatedByBytes = true; break; }
        selected.push(line);
        outputBytes += bytes;
      }
      const output = selected.join("\n");
      const truncated = truncatedByBytes || offsetLine - 1 + selected.length < lines.length;
      const artifact = truncated && options.artifacts
        ? await options.artifacts.recordRead({ context, ref: ref(workspaceId, resolved.relativePath), content, revision: current.revision })
        : null;
      return {
        ref: ref(workspaceId, resolved.relativePath),
        content: output,
        revision: current.revision,
        modifiedAtMs: current.modifiedAtMs,
        offsetLine,
        outputLines: selected.length,
        totalLines: lines.length,
        totalBytes: current.bytes!.byteLength,
        truncated,
        artifact,
      };
    }),
  };

  const searchTool: RegisteredTool = {
    name: "workspace.search",
    description: "Search bounded UTF-8 workspace files for a literal string.",
    inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string" }, query: { type: "string", minLength: 1, maxLength: 256 }, caseSensitive: { type: "boolean" }, maxFiles: { type: "integer", minimum: 1 }, maxMatches: { type: "integer", minimum: 1 } }, required: ["path", "query"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isPathInput(value, ["query", "caseSensitive", "maxFiles", "maxMatches"])
      && typeof value.query === "string" && value.query.length >= 1 && value.query.length <= 256
      && (value.caseSensitive === undefined || typeof value.caseSensitive === "boolean")
      && (value.maxFiles === undefined || isIntegerInRange(value.maxFiles, 1, limits.maxSearchFiles))
      && (value.maxMatches === undefined || isIntegerInRange(value.maxMatches, 1, limits.maxSearchMatches)),
    execute: (input, context) => expectedFailureAsResult(async () => {
      const workspaceId = toolContextWorkspace(context);
      const root = await options.workspaces.resolve(workspaceId, input.path as string, "SEARCH", { allowRoot: true, mustExist: true });
      const rootStat = await stat(root.absolutePath);
      if (!rootStat.isDirectory()) throw new WorkspaceError("WORKSPACE_FILE_TYPE_UNSUPPORTED", `workspace search path is not a directory: ${root.relativePath}`);
      const query = input.query as string;
      const caseSensitive = input.caseSensitive !== false;
      const needle = caseSensitive ? query : query.toLocaleLowerCase();
      const maxFiles = boundedInteger(input.maxFiles, limits.maxSearchFiles, 1, limits.maxSearchFiles);
      const maxMatches = boundedInteger(input.maxMatches, limits.maxSearchMatches, 1, limits.maxSearchMatches);
      const queue = [root.relativePath];
      const matches: Array<{ ref: WorkspaceFileReference; line: number; text: string }> = [];
      let scannedFiles = 0;
      let scannedBytes = 0;
      let skippedBinary = 0;
      let truncated = false;
      while (queue.length > 0 && !truncated) {
        const directoryRelative = queue.shift()!;
        const directory = await options.workspaces.resolve(workspaceId, directoryRelative || ".", "SEARCH", { allowRoot: true, mustExist: true });
        const entries = (await readdir(directory.absolutePath, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          const relativePath = directoryRelative ? `${directoryRelative}/${entry.name}` : entry.name;
          if (!isWorkspacePathVisible(relativePath)) continue;
          if (entry.isDirectory()) { queue.push(relativePath); continue; }
          if (!entry.isFile()) continue;
          if (scannedFiles >= maxFiles || scannedBytes >= limits.maxSearchBytes || matches.length >= maxMatches) { truncated = true; break; }
          const path = await options.workspaces.resolve(workspaceId, relativePath, "SEARCH", { mustExist: true });
          const details = await stat(path.absolutePath);
          if (details.size > limits.maxFileBytes || scannedBytes + details.size > limits.maxSearchBytes) { truncated = true; break; }
          const bytes = await readFile(path.absolutePath);
          scannedFiles += 1;
          scannedBytes += bytes.byteLength;
          let content: string;
          try { content = decodeWorkspaceText(bytes, relativePath); } catch (error) {
            if (error instanceof WorkspaceError && error.code === "WORKSPACE_BINARY_FILE_DENIED") { skippedBinary += 1; continue; }
            throw error;
          }
          for (const [index, line] of content.split("\n").entries()) {
            const haystack = caseSensitive ? line : line.toLocaleLowerCase();
            if (!haystack.includes(needle)) continue;
            matches.push({ ref: ref(workspaceId, relativePath), line: index + 1, text: line.slice(0, 500) });
            if (matches.length >= maxMatches) { truncated = true; break; }
          }
          if (truncated) break;
        }
      }
      const output = { ref: ref(workspaceId, root.relativePath), query, matches, scannedFiles, scannedBytes, skippedBinary, truncated };
      const artifact = truncated && options.artifacts ? await options.artifacts.recordSearch({ context, workspaceId, query, output }) : null;
      return { ...output, artifact };
    }),
  };

  const writeTool: RegisteredTool = {
    name: "workspace.write",
    description: "Atomically create or replace one UTF-8 workspace file using an expected revision.",
    inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string" }, content: { type: "string" }, expectedRevision: { type: "string" }, expectedModifiedAtMs: { type: "number" } }, required: ["path", "content", "expectedRevision"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isPathInput(value, ["content", "expectedRevision", "expectedModifiedAtMs"])
      && typeof value.content === "string"
      && typeof value.expectedRevision === "string" && (value.expectedRevision === "MISSING" || /^sha256:[0-9a-f]{64}$/.test(value.expectedRevision))
      && (value.expectedModifiedAtMs === undefined || (typeof value.expectedModifiedAtMs === "number" && Number.isFinite(value.expectedModifiedAtMs))),
    execute: (input, context) => expectedFailureAsResult(async () => {
      const workspaceId = toolContextWorkspace(context);
      const resolved = await options.workspaces.resolve(workspaceId, input.path as string, "WRITE", { mustExist: false });
      return withWorkspaceFileMutation(resolved.absolutePath, async () => {
        const mutation = await atomicWriteWorkspaceText({
          catalog: options.workspaces,
          path: resolved,
          content: input.content as string,
          expectedRevision: input.expectedRevision as string,
          ...(input.expectedModifiedAtMs !== undefined ? { expectedModifiedAtMs: input.expectedModifiedAtMs as number } : {}),
          maxFileBytes: limits.maxFileBytes,
        });
        const diff = buildCompactDiff(mutation.before.content, mutation.after.content!);
        const artifact = options.artifacts ? await options.artifacts.recordChange({
          context,
          ref: ref(workspaceId, resolved.relativePath),
          operation: "WRITE",
          before: mutation.before.content,
          after: mutation.after.content!,
          beforeRevision: mutation.before.revision,
          afterRevision: mutation.after.revision,
          diff: diff.text,
        }) : null;
        return {
          ref: ref(workspaceId, resolved.relativePath),
          beforeRevision: mutation.before.revision,
          revision: mutation.after.revision,
          modifiedAtMs: mutation.after.modifiedAtMs,
          bytes: mutation.after.bytes!.byteLength,
          diff: diff.text,
          diffTruncated: diff.truncated,
          artifact,
        };
      });
    }),
  };

  const patchTool: RegisteredTool = {
    name: "workspace.patch",
    description: "Apply exact text replacements all-or-nothing to one UTF-8 workspace file.",
    inputSchema: { type: "object", additionalProperties: false, properties: { path: { type: "string" }, expectedRevision: { type: "string" }, replacements: { type: "array", minItems: 1, maxItems: limits.maxPatchReplacements, items: { type: "object", additionalProperties: false, properties: { oldText: { type: "string" }, newText: { type: "string" }, replaceAll: { type: "boolean" } }, required: ["oldText", "newText"] } } }, required: ["path", "expectedRevision", "replacements"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isPathInput(value, ["expectedRevision", "replacements"])
      && typeof value.expectedRevision === "string" && /^sha256:[0-9a-f]{64}$/.test(value.expectedRevision)
      && Array.isArray(value.replacements) && value.replacements.length >= 1 && value.replacements.length <= limits.maxPatchReplacements
      && value.replacements.every((entry) => isRecord(entry) && hasOnly(entry, ["oldText", "newText", "replaceAll"])
        && typeof entry.oldText === "string" && entry.oldText.length > 0 && typeof entry.newText === "string"
        && (entry.replaceAll === undefined || typeof entry.replaceAll === "boolean")),
    execute: (input, context) => expectedFailureAsResult(async () => {
      const workspaceId = toolContextWorkspace(context);
      const resolved = await options.workspaces.resolve(workspaceId, input.path as string, "WRITE", { mustExist: true });
      return withWorkspaceFileMutation(resolved.absolutePath, async () => {
        const current = await readCurrentTextFile(resolved, limits.maxFileBytes);
        assertExpectedRevision(current, input.expectedRevision as string);
        let next = current.content!;
        for (const [index, raw] of (input.replacements as Array<Record<string, unknown>>).entries()) {
          const oldText = raw.oldText as string;
          const newText = raw.newText as string;
          const occurrences = countOccurrences(next, oldText);
          if (occurrences === 0 || (raw.replaceAll !== true && occurrences !== 1)) {
            throw new WorkspaceError("WORKSPACE_PATCH_CONFLICT", `workspace patch replacement ${index + 1} expected ${raw.replaceAll === true ? "at least one" : "exactly one"} match; found ${occurrences}`);
          }
          next = raw.replaceAll === true ? next.split(oldText).join(newText) : next.replace(oldText, newText);
        }
        const mutation = await atomicWriteWorkspaceText({
          catalog: options.workspaces,
          path: resolved,
          content: next,
          expectedRevision: input.expectedRevision as string,
          maxFileBytes: limits.maxFileBytes,
        });
        const diff = buildCompactDiff(mutation.before.content, mutation.after.content!);
        const artifact = options.artifacts ? await options.artifacts.recordChange({
          context,
          ref: ref(workspaceId, resolved.relativePath),
          operation: "PATCH",
          before: mutation.before.content,
          after: mutation.after.content!,
          beforeRevision: mutation.before.revision,
          afterRevision: mutation.after.revision,
          diff: diff.text,
        }) : null;
        return {
          ref: ref(workspaceId, resolved.relativePath),
          beforeRevision: mutation.before.revision,
          revision: mutation.after.revision,
          modifiedAtMs: mutation.after.modifiedAtMs,
          replacementsApplied: (input.replacements as unknown[]).length,
          diff: diff.text,
          diffTruncated: diff.truncated,
          artifact,
        };
      });
    }),
  };

  return [listTool, statTool, readTool, searchTool, writeTool, patchTool];
}

export function registerWorkspaceFileTools(
  registry: ToolRegistry,
  options: Parameters<typeof createWorkspaceFileTools>[0],
): void {
  for (const tool of createWorkspaceFileTools(options)) registry.register(tool);
}
