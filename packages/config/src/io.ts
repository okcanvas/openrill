import { randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  ConfigFutureVersionError,
  ConfigIncludeError,
  ConfigParseError,
  ConfigRevisionConflictError,
  ConfigValidationError,
  OpenRillConfigError,
  type ConfigIssue,
} from "./errors.js";
import { collectChangedPaths, materializedRevision, sha256Text, stableJson } from "./canonical.js";
import { resolveConfigSource, type IncludeLimits } from "./includes.js";
import { createMinimalConfigSource, validateAndMaterializeConfig } from "./schema.js";
import { collectSecretStatuses, redactSecretReferences } from "./secrets.js";
import type { OsSecretProvider } from "./os-secrets.js";
import type {
  ConfigMutationJournalRecord,
  OpenRillConfig,
  OpenRillConfigPaths,
  OpenRillConfigReadResult,
  OpenRillConfigSource,
  PersistedConfigSnapshot,
} from "./types.js";
import { stringifyOpenRillYaml } from "./yaml-subset.js";

interface LoadConfigOptions {
  readonly paths: OpenRillConfigPaths;
  readonly env?: NodeJS.ProcessEnv;
  readonly includeLimits?: IncludeLimits;
  readonly persist?: boolean;
  readonly allowLastKnownGood?: boolean;
  readonly now?: () => Date;
  readonly platform?: NodeJS.Platform;
  readonly osSecretProvider?: OsSecretProvider;
}

interface WriteConfigOptions {
  readonly paths: OpenRillConfigPaths;
  readonly source: OpenRillConfigSource;
  readonly expectedRevision: string | null;
  readonly env?: NodeJS.ProcessEnv;
  readonly includeLimits?: IncludeLimits;
  readonly now?: () => Date;
  readonly platform?: NodeJS.Platform;
  readonly osSecretProvider?: OsSecretProvider;
}

interface MutationLockPayload {
  readonly schemaVersion: 1;
  readonly pid: number;
  readonly ownerId: string;
  readonly createdAt: string;
}

async function pathExists(path: string): Promise<boolean> {
  return await stat(path).then(() => true).catch(() => false);
}

async function readTextIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function syncDirectoryBestEffort(path: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch {
    // Windows and some filesystems do not support directory fsync.
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = resolve(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw new OpenRillConfigError("CONFIG_IO_FAILED", `atomic replace failed for ${path}`, { cause: error });
  }
  if (process.platform !== "win32") await chmod(path, 0o600).catch(() => {});
  await syncDirectoryBestEffort(directory);
}

function createSnapshot(result: OpenRillConfigReadResult): PersistedConfigSnapshot {
  if (!result.sourceRevision) throw new Error("cannot persist a snapshot without source revision");
  return {
    schemaVersion: 1,
    product: "OpenRill",
    configVersion: 1,
    sourcePath: result.sourcePath,
    sourceRevision: result.sourceRevision,
    materializedRevision: result.materializedRevision,
    sourceFiles: result.sourceFiles,
    loadedAt: result.loadedAt,
    config: result.config,
    redactedConfig: result.redactedConfig,
    warnings: result.warnings,
    secretStatuses: result.secretStatuses,
  };
}

function parsePersistedSnapshot(raw: string): PersistedConfigSnapshot | null {
  try {
    const value = JSON.parse(raw) as Partial<PersistedConfigSnapshot>;
    if (
      value.schemaVersion !== 1
      || value.product !== "OpenRill"
      || value.configVersion !== 1
      || typeof value.sourcePath !== "string"
      || typeof value.sourceRevision !== "string"
      || typeof value.materializedRevision !== "string"
      || typeof value.loadedAt !== "string"
      || !Array.isArray(value.sourceFiles)
      || !Array.isArray(value.warnings)
      || !Array.isArray(value.secretStatuses)
    ) return null;
    const config = validateAndMaterializeConfig(value.config);
    if (materializedRevision(config) !== value.materializedRevision) return null;
    return { ...value, config } as PersistedConfigSnapshot;
  } catch {
    return null;
  }
}

async function persistValidSnapshot(paths: OpenRillConfigPaths, result: OpenRillConfigReadResult): Promise<void> {
  const snapshot = createSnapshot(result);
  const json = stableJson(snapshot);
  await writeFileAtomic(paths.materializedPath, json);
  await writeFileAtomic(paths.lastKnownGoodPath, json);
}

async function readLastKnownGood(paths: OpenRillConfigPaths): Promise<PersistedConfigSnapshot | null> {
  const raw = await readTextIfExists(paths.lastKnownGoodPath);
  return raw ? parsePersistedSnapshot(raw) : null;
}

function configIssuesFromError(error: unknown): readonly ConfigIssue[] {
  if (error instanceof ConfigParseError || error instanceof ConfigValidationError) return error.issues;
  return [];
}

function recoverableSourceError(error: unknown): boolean {
  return error instanceof ConfigParseError || error instanceof ConfigValidationError;
}

async function buildResultFromSource(options: LoadConfigOptions, loadedAt: string): Promise<OpenRillConfigReadResult> {
  const env = options.env ?? process.env;
  const resolved = await resolveConfigSource(options.paths.sourcePath, dirname(options.paths.sourcePath), options.includeLimits);
  const config = validateAndMaterializeConfig(resolved.source);
  const secretStatuses = await collectSecretStatuses(config, {
    env,
    configRoot: dirname(options.paths.sourcePath),
    ...(options.platform ? { platform: options.platform } : {}),
    ...(options.osSecretProvider ? { osSecretProvider: options.osSecretProvider } : {}),
  });
  const warnings = secretStatuses
    .filter((status) => !status.available)
    .map((status) => `secret reference unavailable at ${status.path}: ${status.reference.kind}:${status.reference.key} (${status.reason})`);
  return {
    config,
    redactedConfig: redactSecretReferences(config),
    sourcePath: options.paths.sourcePath,
    sourceExists: true,
    sourceRevision: resolved.sourceRevision,
    materializedRevision: materializedRevision(config),
    sourceFiles: resolved.sourceFiles,
    warnings,
    issues: [],
    secretStatuses,
    recovery: "SOURCE",
    loadedAt,
  };
}

export async function loadOpenRillConfig(options: LoadConfigOptions): Promise<OpenRillConfigReadResult> {
  const now = options.now ?? (() => new Date());
  const loadedAt = now().toISOString();
  const sourceRaw = await readTextIfExists(options.paths.sourcePath);
  if (sourceRaw === null) {
    const config = validateAndMaterializeConfig(createMinimalConfigSource());
    return {
      config,
      redactedConfig: redactSecretReferences(config),
      sourcePath: options.paths.sourcePath,
      sourceExists: false,
      sourceRevision: null,
      materializedRevision: materializedRevision(config),
      sourceFiles: [],
      warnings: ["config source is missing; built-in defaults are active"],
      issues: [],
      secretStatuses: [],
      recovery: "DEFAULTS",
      loadedAt,
    };
  }

  try {
    const result = await buildResultFromSource(options, loadedAt);
    if (options.persist !== false) await persistValidSnapshot(options.paths, result);
    return result;
  } catch (error) {
    if (error instanceof ConfigIncludeError || error instanceof ConfigFutureVersionError) throw error;
    if (!recoverableSourceError(error) || options.allowLastKnownGood === false) throw error;
    const lastKnownGood = await readLastKnownGood(options.paths);
    if (!lastKnownGood) throw error;
    return {
      config: lastKnownGood.config,
      redactedConfig: lastKnownGood.redactedConfig,
      sourcePath: options.paths.sourcePath,
      sourceExists: true,
      sourceRevision: sha256Text(sourceRaw),
      materializedRevision: lastKnownGood.materializedRevision,
      sourceFiles: lastKnownGood.sourceFiles,
      warnings: [
        `current config is invalid; last-known-good snapshot ${lastKnownGood.sourceRevision.slice(0, 12)} is active`,
        ...lastKnownGood.warnings,
      ],
      issues: configIssuesFromError(error),
      secretStatuses: lastKnownGood.secretStatuses,
      recovery: "LAST_KNOWN_GOOD",
      loadedAt,
    };
  }
}

async function currentSourceRevision(paths: OpenRillConfigPaths, limits?: IncludeLimits): Promise<string | null> {
  const raw = await readTextIfExists(paths.sourcePath);
  if (raw === null) return null;
  try {
    return (await resolveConfigSource(paths.sourcePath, dirname(paths.sourcePath), limits)).sourceRevision;
  } catch (error) {
    if (error instanceof ConfigIncludeError || error instanceof ConfigFutureVersionError) throw error;
    return sha256Text(raw);
  }
}

function parseMutationLock(raw: string): MutationLockPayload | null {
  try {
    const value = JSON.parse(raw) as Partial<MutationLockPayload>;
    if (value.schemaVersion !== 1 || !Number.isInteger(value.pid) || (value.pid ?? 0) <= 0 || typeof value.ownerId !== "string" || typeof value.createdAt !== "string") return null;
    return value as MutationLockPayload;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function acquireMutationLock(paths: OpenRillConfigPaths, now: () => Date): Promise<() => Promise<void>> {
  await mkdir(paths.stateDir, { recursive: true, mode: 0o700 });
  const ownerId = randomUUID();
  const payload: MutationLockPayload = { schemaVersion: 1, pid: process.pid, ownerId, createdAt: now().toISOString() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(paths.mutationLockPath, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(payload)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return async () => {
        const current = parseMutationLock((await readTextIfExists(paths.mutationLockPath)) ?? "");
        if (current?.ownerId === ownerId) await rm(paths.mutationLockPath, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new OpenRillConfigError("CONFIG_IO_FAILED", `failed to acquire config mutation lock: ${paths.mutationLockPath}`, { cause: error });
      }
    }
    const current = parseMutationLock((await readTextIfExists(paths.mutationLockPath)) ?? "");
    if (current && !isPidAlive(current.pid)) {
      await rm(paths.mutationLockPath, { force: true });
      continue;
    }
    throw new OpenRillConfigError("CONFIG_MUTATION_BUSY", `OpenRill config mutation is already active: ${paths.mutationLockPath}`);
  }
  throw new OpenRillConfigError("CONFIG_MUTATION_BUSY", `OpenRill config mutation lock could not be reclaimed: ${paths.mutationLockPath}`);
}

async function appendMutationJournal(paths: OpenRillConfigPaths, record: ConfigMutationJournalRecord): Promise<void> {
  await mkdir(paths.journalDir, { recursive: true, mode: 0o700 });
  const safeTimestamp = record.changedAt.replace(/[:.]/g, "-");
  const name = `${safeTimestamp}-${record.sourceRevisionAfter.slice(0, 12)}.json`;
  await writeFileAtomic(resolve(paths.journalDir, name), stableJson(record));
}

export async function writeOpenRillConfig(options: WriteConfigOptions): Promise<OpenRillConfigReadResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const release = await acquireMutationLock(options.paths, now);
  let priorRaw: string | null = null;
  try {
    const actualRevision = await currentSourceRevision(options.paths, options.includeLimits);
    if (actualRevision !== options.expectedRevision) {
      throw new ConfigRevisionConflictError(options.expectedRevision, actualRevision);
    }
    priorRaw = await readTextIfExists(options.paths.sourcePath);
    const nextRaw = stringifyOpenRillYaml(options.source);

    await mkdir(dirname(options.paths.sourcePath), { recursive: true, mode: 0o700 });
    const candidatePath = resolve(dirname(options.paths.sourcePath), `.agent.candidate.${process.pid}.${randomUUID()}.yaml`);
    await writeFile(candidatePath, nextRaw, { encoding: "utf8", mode: 0o600, flag: "wx" });
    try {
      const candidateResolved = await resolveConfigSource(candidatePath, dirname(options.paths.sourcePath), options.includeLimits);
      const candidateConfig = validateAndMaterializeConfig(candidateResolved.source);
      await collectSecretStatuses(candidateConfig, {
        env,
        configRoot: dirname(options.paths.sourcePath),
        ...(options.platform ? { platform: options.platform } : {}),
        ...(options.osSecretProvider ? { osSecretProvider: options.osSecretProvider } : {}),
      });
    } finally {
      await rm(candidatePath, { force: true });
    }

    const previousMaterialized = priorRaw === null
      ? validateAndMaterializeConfig(createMinimalConfigSource())
      : await loadOpenRillConfig({ ...options, persist: false, allowLastKnownGood: true }).then((result) => result.config);

    if (priorRaw !== null) {
      await copyFile(options.paths.sourcePath, `${options.paths.sourcePath}.previous`).catch(() => {});
      if (process.platform !== "win32") await chmod(`${options.paths.sourcePath}.previous`, 0o600).catch(() => {});
    }
    await writeFileAtomic(options.paths.sourcePath, nextRaw);

    let result: OpenRillConfigReadResult;
    try {
      result = await loadOpenRillConfig({
        paths: options.paths,
        env,
        ...(options.includeLimits ? { includeLimits: options.includeLimits } : {}),
        persist: true,
        allowLastKnownGood: false,
        now,
      });
    } catch (error) {
      if (priorRaw === null) await rm(options.paths.sourcePath, { force: true });
      else await writeFileAtomic(options.paths.sourcePath, priorRaw);
      throw new OpenRillConfigError("CONFIG_IO_FAILED", "config post-commit verification failed; previous source was restored", { cause: error });
    }

    const record: ConfigMutationJournalRecord = {
      schemaVersion: 1,
      product: "OpenRill",
      event: "config.write",
      changedAt: now().toISOString(),
      sourceRevisionBefore: actualRevision,
      sourceRevisionAfter: result.sourceRevision!,
      materializedRevision: result.materializedRevision,
      changedPaths: collectChangedPaths(previousMaterialized, result.config),
    };
    await appendMutationJournal(options.paths, record);
    return result;
  } finally {
    await release();
  }
}

export async function listConfigJournal(paths: OpenRillConfigPaths): Promise<readonly string[]> {
  return await readdir(paths.journalDir).then((entries) => entries.filter((entry) => entry.endsWith(".json")).sort()).catch(() => []);
}
