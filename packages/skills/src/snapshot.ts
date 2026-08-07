import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { SkillError } from "./errors.js";
import { parseSkillYaml } from "./yaml.js";
import type {
  PersistedSkillSnapshot,
  SkillCatalogEntry,
  SkillManifest,
  SkillMetadataSink,
  SkillResolvedFile,
  SkillSnapshot,
} from "./types.js";

const MAX_INSTRUCTIONS_BYTES = 256 * 1024;
const MAX_RESOURCE_BYTES = 512 * 1024;
const MAX_TOTAL_RESOURCE_BYTES = 2 * 1024 * 1024;
const captureTails = new Map<string, Promise<void>>();

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function contains(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function readUtf8(pathname: string, maxBytes: number): Promise<{ text: string; bytes: Uint8Array }> {
  const info = await stat(pathname);
  if (!info.isFile()) throw new SkillError("SKILL_SNAPSHOT_INCONSISTENT", `Skill snapshot source is not a file: ${pathname}`);
  if (info.size > maxBytes) throw new SkillError("SKILL_CONTENT_LIMIT_EXCEEDED", `Skill snapshot source exceeds ${maxBytes} bytes: ${pathname}`);
  const bytes = await readFile(pathname);
  if (bytes.includes(0)) throw new SkillError("SKILL_BINARY_CONTENT_DENIED", `Skill snapshot source contains NUL bytes: ${pathname}`);
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), bytes };
  } catch (error) {
    throw new SkillError("SKILL_BINARY_CONTENT_DENIED", `Skill snapshot source is not valid UTF-8: ${pathname}`, { cause: error });
  }
}

function snapshotId(runId: string, skillId: string): string {
  return sha256(`openrill-skill-snapshot\0${runId}\0${skillId}`);
}

function storagePathFor(id: string): string {
  return `skill-snapshots/${id}`;
}

function validateStoragePath(pathname: string): void {
  if (!/^skill-snapshots\/[a-f0-9]{64}$/.test(pathname)) throw new SkillError("SKILL_SNAPSHOT_INCONSISTENT", `invalid Skill snapshot storage path: ${pathname}`);
}

async function serializeCapture<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = captureTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((resolve) => { release = resolve; });
  const chained = previous.catch(() => undefined).then(() => tail);
  captureTails.set(key, chained);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (captureTails.get(key) === chained) captureTails.delete(key);
  }
}

export interface SkillSnapshotStoreOptions {
  readonly rootDirectory: string;
  readonly metadataSink: SkillMetadataSink;
  readonly now?: () => number;
}

export class SkillSnapshotStore {
  public constructor(private readonly options: SkillSnapshotStoreOptions) {}

  public async capture(runId: string, entry: SkillCatalogEntry): Promise<SkillSnapshot> {
    return serializeCapture(`${runId}\0${entry.skillId}`, () => this.captureSerialized(runId, entry));
  }

  private async captureSerialized(runId: string, entry: SkillCatalogEntry): Promise<SkillSnapshot> {
    const existing = this.options.metadataSink.listRunSnapshots(runId).find((item) => item.skillId === entry.skillId);
    if (existing) return this.load(existing);
    const id = snapshotId(runId, entry.skillId);
    const storagePath = storagePathFor(id);
    const destination = join(this.options.rootDirectory, storagePath);
    const temp = `${destination}.tmp-${process.pid}-${Date.now()}`;
    await rm(destination, { recursive: true, force: true });
    const skillRoot = await realpath(entry.skillDirectory);
    const manifestRead = await readUtf8(entry.manifestPath, 64 * 1024);
    if (sha256(manifestRead.bytes) !== entry.manifestSha256) {
      throw new SkillError("SKILL_SNAPSHOT_INCONSISTENT", `Skill manifest changed after discovery: ${entry.skillId}`);
    }
    const manifest = parseSkillYaml(manifestRead.text);
    if (manifest.id !== entry.skillId || manifest.version !== entry.version) {
      throw new SkillError("SKILL_SNAPSHOT_INCONSISTENT", `Skill manifest changed during snapshot: ${entry.skillId}`);
    }
    const sourceFiles: Array<{ kind: SkillResolvedFile["kind"]; sourceRelativePath: string; absolutePath: string; maxBytes: number }> = [
      { kind: "MANIFEST", sourceRelativePath: "skill.yaml", absolutePath: entry.manifestPath, maxBytes: 64 * 1024 },
      { kind: "INSTRUCTIONS", sourceRelativePath: manifest.instructions, absolutePath: entry.instructionsPath, maxBytes: MAX_INSTRUCTIONS_BYTES },
    ];
    for (const resource of manifest.resources) {
      const absolute = await realpath(join(skillRoot, ...resource.split("/")));
      if (!contains(skillRoot, absolute)) throw new SkillError("SKILL_SYMLINK_ESCAPE", `Skill resource resolves outside directory during snapshot: ${resource}`);
      sourceFiles.push({ kind: "RESOURCE", sourceRelativePath: resource, absolutePath: absolute, maxBytes: MAX_RESOURCE_BYTES });
    }
    const resolvedFiles: SkillResolvedFile[] = [];
    let instructions = "";
    let resourceBytes = 0;
    try {
      await mkdir(temp, { recursive: true, mode: 0o700 });
      for (const source of sourceFiles) {
        const read = await readUtf8(source.absolutePath, source.maxBytes);
        if (source.kind === "RESOURCE") {
          resourceBytes += read.bytes.byteLength;
          if (resourceBytes > MAX_TOTAL_RESOURCE_BYTES) throw new SkillError("SKILL_CONTENT_LIMIT_EXCEEDED", `Skill resources exceed ${MAX_TOTAL_RESOURCE_BYTES} bytes: ${entry.skillId}`);
        }
        if (source.kind === "INSTRUCTIONS") instructions = read.text;
        const snapshotRelativePath = source.kind === "MANIFEST" ? "skill.yaml" : source.kind === "INSTRUCTIONS" ? "instructions.md" : `resources/${source.sourceRelativePath}`;
        const target = join(temp, ...snapshotRelativePath.split("/"));
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        await writeFile(target, read.bytes, { flag: "wx", mode: 0o600 });
        resolvedFiles.push({
          kind: source.kind,
          sourceRelativePath: source.sourceRelativePath,
          snapshotRelativePath,
          bytes: read.bytes.byteLength,
          sha256: sha256(read.bytes),
        });
      }
      const contentHash = sha256(canonical({ manifest, files: resolvedFiles.map(({ kind, sourceRelativePath, bytes, sha256: hash }) => ({ kind, sourceRelativePath, bytes, sha256: hash })) }));
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await rename(temp, destination);
      const capturedAt = (this.options.now ?? Date.now)();
      const persisted = this.options.metadataSink.insertSnapshot({
        snapshotId: id,
        runId,
        skillId: entry.skillId,
        sourceKey: entry.source.sourceKey,
        skillVersion: entry.version,
        contentHash,
        storagePath,
        manifest,
        files: resolvedFiles,
        capturedAt,
      });
      return { ...persisted, instructions };
    } catch (error) {
      await rm(temp, { recursive: true, force: true }).catch(() => undefined);
      const persisted = this.options.metadataSink.listRunSnapshots(runId).find((item) => item.skillId === entry.skillId);
      if (!persisted) await rm(destination, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  public async load(persisted: PersistedSkillSnapshot): Promise<SkillSnapshot> {
    validateStoragePath(persisted.storagePath);
    const directory = join(this.options.rootDirectory, persisted.storagePath);
    let instructions = "";
    for (const file of persisted.files) {
      const maxBytes = file.kind === "MANIFEST" ? 64 * 1024 : file.kind === "INSTRUCTIONS" ? MAX_INSTRUCTIONS_BYTES : MAX_RESOURCE_BYTES;
      const read = await readUtf8(join(directory, ...file.snapshotRelativePath.split("/")), maxBytes);
      if (read.bytes.byteLength !== file.bytes || sha256(read.bytes) !== file.sha256) {
        throw new SkillError("SKILL_SNAPSHOT_INCONSISTENT", `Skill snapshot file hash mismatch: ${persisted.snapshotId}/${file.snapshotRelativePath}`);
      }
      if (file.kind === "INSTRUCTIONS") instructions = read.text;
      if (file.kind === "MANIFEST") {
        const actual = parseSkillYaml(read.text);
        if (canonical(actual) !== canonical(persisted.manifest)) {
          throw new SkillError("SKILL_SNAPSHOT_INCONSISTENT", `Skill snapshot manifest metadata mismatch: ${persisted.snapshotId}`);
        }
      }
    }
    if (!persisted.files.some((file) => file.kind === "INSTRUCTIONS")) {
      throw new SkillError("SKILL_SNAPSHOT_INCONSISTENT", `Skill snapshot instructions metadata is missing: ${persisted.snapshotId}`);
    }
    return { ...persisted, instructions };
  }

  public async loadRun(runId: string): Promise<SkillSnapshot[]> {
    const snapshots = this.options.metadataSink.listRunSnapshots(runId);
    return Promise.all(snapshots.map((snapshot) => this.load(snapshot)));
  }
}

export function formatActiveSkillInstructions(snapshots: readonly SkillSnapshot[]): string {
  if (snapshots.length === 0) return "";
  const lines = ["", "Active OpenRill Skill instructions are immutable for this Run:", "<active_skills>"];
  for (const snapshot of [...snapshots].sort((left, right) => left.skillId.localeCompare(right.skillId))) {
    lines.push(`  <skill id="${snapshot.skillId}" version="${snapshot.skillVersion}" content_hash="${snapshot.contentHash}">`);
    lines.push(snapshot.instructions);
    if (snapshot.files.some((file) => file.kind === "RESOURCE")) {
      lines.push(`Resources: ${snapshot.files.filter((file) => file.kind === "RESOURCE").map((file) => file.sourceRelativePath).join(", ")}`);
    }
    lines.push("  </skill>");
  }
  lines.push("</active_skills>");
  return lines.join("\n");
}
