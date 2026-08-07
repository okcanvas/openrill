import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type {
  WorkspaceArtifactMetadata,
  WorkspaceArtifactMetadataSink,
  WorkspaceArtifactReference,
  WorkspaceArtifactStore,
} from "./types.js";

async function writePrivate(pathname: string, content: string | Uint8Array): Promise<number> {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
  const handle = await open(pathname, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return bytes.byteLength;
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function safeDownloadName(value: string): string {
  const candidate = basename(value.replaceAll("\\", "/")).normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-");
  const trimmed = candidate.replace(/^[.-]+/, "").slice(0, 120);
  const safe = trimmed || "download.bin";
  return safe === "source.json" || safe === "metadata.json" ? `download-${safe}` : safe;
}

function mediaTypeForName(name: string): string {
  switch (extname(name).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".pdf": return "application/pdf";
    case ".json": return "application/json";
    case ".txt": return "text/plain; charset=utf-8";
    case ".csv": return "text/csv; charset=utf-8";
    case ".html":
    case ".htm": return "text/html; charset=utf-8";
    case ".zip": return "application/zip";
    default: return "application/octet-stream";
  }
}

export function createWorkspaceArtifactStore(options: {
  readonly rootDirectory: string;
  readonly metadataSink?: WorkspaceArtifactMetadataSink;
  readonly now?: () => number;
  readonly createId?: () => string;
  readonly maxArtifactBytes?: number;
}): WorkspaceArtifactStore {
  const now = options.now ?? Date.now;
  const createId = options.createId ?? randomUUID;
  const maxArtifactBytes = options.maxArtifactBytes ?? 8 * 1024 * 1024;

  const record = async (input: {
    readonly kind: WorkspaceArtifactReference["kind"];
    readonly context: { readonly runId: string; readonly attemptId: string; readonly workspaceId: string };
    readonly relativePath: string | null;
    readonly operation: string;
    readonly beforeSha256: string | null;
    readonly afterSha256: string | null;
    readonly files: Readonly<Record<string, string | Uint8Array>>;
  }): Promise<{ readonly artifactId: string; readonly kind: WorkspaceArtifactReference["kind"]; readonly sizeBytes: number }> => {
    const artifactId = createId();
    const directory = join(options.rootDirectory, artifactId);
    await mkdir(options.rootDirectory, { recursive: true, mode: 0o700 });
    await mkdir(directory, { recursive: false, mode: 0o700 });
    try {
      let sizeBytes = 0;
      for (const [name, content] of Object.entries(input.files)) {
        const bytes = typeof content === "string" ? Buffer.byteLength(content, "utf8") : content.byteLength;
        if (sizeBytes + bytes > maxArtifactBytes) throw new RangeError("workspace artifact exceeds configured byte limit");
        sizeBytes += await writePrivate(join(directory, name), content);
      }
      const createdAt = now();
      const metadata: WorkspaceArtifactMetadata = {
        artifactId,
        runId: input.context.runId,
        attemptId: input.context.attemptId,
        workspaceId: input.context.workspaceId,
        kind: input.kind,
        relativePath: input.relativePath,
        operation: input.operation,
        beforeSha256: input.beforeSha256,
        afterSha256: input.afterSha256,
        storagePath: directory,
        sizeBytes,
        createdAt,
      };
      await writeFile(join(directory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      options.metadataSink?.recordArtifact(metadata);
      return { artifactId, kind: input.kind, sizeBytes };
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  };

  return {
    recordRead: async ({ context, ref, content, revision }) => {
      const saved = await record({
        kind: "READ_OUTPUT",
        context,
        relativePath: ref.relativePath,
        operation: "READ",
        beforeSha256: null,
        afterSha256: revision,
        files: { "content.txt": content },
      });
      return { artifactId: saved.artifactId, kind: "READ_OUTPUT" };
    },
    recordSearch: async ({ context, workspaceId, query, output }) => {
      const saved = await record({
        kind: "SEARCH_OUTPUT",
        context: { ...context, workspaceId },
        relativePath: null,
        operation: "SEARCH",
        beforeSha256: null,
        afterSha256: null,
        files: { "query.txt": query, "results.json": `${JSON.stringify(output, null, 2)}\n` },
      });
      return { artifactId: saved.artifactId, kind: "SEARCH_OUTPUT" };
    },
    recordChange: async ({ context, ref, operation, before, after, beforeRevision, afterRevision, diff }) => {
      const saved = await record({
        kind: "FILE_CHANGE",
        context,
        relativePath: ref.relativePath,
        operation,
        beforeSha256: beforeRevision === "MISSING" ? null : beforeRevision,
        afterSha256: afterRevision,
        files: {
          ...(before !== null ? { "before.txt": before } : {}),
          "after.txt": after,
          "change.patch": diff,
        },
      });
      return { artifactId: saved.artifactId, kind: "FILE_CHANGE" };
    },
    recordScreenshot: async ({ owner, pageId, documentGeneration, url, title, format, bytes }) => {
      const fileName = format === "jpeg" ? "screenshot.jpeg" : "screenshot.png";
      const digest = sha256(bytes);
      const saved = await record({
        kind: "BROWSER_SCREENSHOT",
        context: owner,
        relativePath: null,
        operation: "browser.screenshot",
        beforeSha256: null,
        afterSha256: digest,
        files: {
          [fileName]: bytes,
          "source.json": `${JSON.stringify({ pageId, documentGeneration, url, title, format }, null, 2)}\n`,
        },
      });
      return { artifactId: saved.artifactId, kind: "BROWSER_SCREENSHOT", fileName, mediaType: format === "jpeg" ? "image/jpeg" : "image/png", sizeBytes: bytes.byteLength, sha256: digest };
    },
    recordDownload: async ({ owner, pageId, documentGeneration, url, suggestedFilename, bytes }) => {
      const fileName = safeDownloadName(suggestedFilename);
      const digest = sha256(bytes);
      const saved = await record({
        kind: "BROWSER_DOWNLOAD",
        context: owner,
        relativePath: null,
        operation: "browser.download",
        beforeSha256: null,
        afterSha256: digest,
        files: {
          [fileName]: bytes,
          "source.json": `${JSON.stringify({ pageId, documentGeneration, url, suggestedFilename }, null, 2)}\n`,
        },
      });
      return { artifactId: saved.artifactId, kind: "BROWSER_DOWNLOAD", fileName, mediaType: mediaTypeForName(fileName), sizeBytes: bytes.byteLength, sha256: digest };
    },
  };
}
