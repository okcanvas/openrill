import {
  loadOpenRillConfig,
  parseOpenRillYaml,
  writeOpenRillConfig,
  type OpenRillConfigPaths,
  type OpenRillConfigSource,
  type OsSecretProvider,
} from "@openrill/config";
import { discoverSkills, type SkillCatalog, type SkillCatalogEntry } from "@openrill/skills";
import { resolveConfiguredProductToolNames } from "@openrill/tool-discovery";
import { createWorkspaceCatalog } from "@openrill/workspace";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type SkillCommandAction = "list" | "show" | "check" | "enable" | "disable";

export interface SkillCommandOptions {
  readonly action: SkillCommandAction;
  readonly skillId: string | null;
  readonly workspaceId: string;
  readonly json: boolean;
}

export interface SkillCommandIo {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

export interface SkillCommandRuntime {
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
  readonly osSecretProvider?: OsSecretProvider;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function catalogFor(
  options: SkillCommandOptions,
  paths: OpenRillConfigPaths,
  configRoot: string,
  runtime: SkillCommandRuntime,
): Promise<{ readonly catalog: SkillCatalog; readonly sourceRevision: string | null; readonly sourcePath: string }> {
  const loaded = await loadOpenRillConfig({
    paths,
    env: runtime.env,
    platform: runtime.platform,
    ...(runtime.osSecretProvider ? { osSecretProvider: runtime.osSecretProvider } : {}),
  });
  const workspaces = await createWorkspaceCatalog(loaded.config.workspaces);
  const workspace = workspaces.internal(options.workspaceId);
  const catalog = await discoverSkills({
    bundledRoots: [resolve(import.meta.dirname, "../../../skills/builtin/catalog")],
    managedUserRoots: loaded.config.skills.roots.map((root) => resolve(configRoot, root)),
    workspaceRoot: workspace.canonicalRoot,
    workspaceId: options.workspaceId,
    availableTools: resolveConfiguredProductToolNames({ browserEnabled: loaded.config.browser.enabled }),
    enabledSkillIds: loaded.config.skills.enabled,
    currentVersion: "0.18.1-step018b",
  });
  return { catalog, sourceRevision: loaded.sourceRevision, sourcePath: paths.sourcePath };
}

function entryView(entry: SkillCatalogEntry) {
  return {
    id: entry.skillId,
    version: entry.version,
    description: entry.description,
    enabled: entry.enabled,
    source: entry.source.type,
    sourceKey: entry.source.sourceKey,
    root: entry.source.rootPath,
    requiredTools: entry.requiredTools,
    activation: entry.activation,
    resources: entry.resources,
    manifestSha256: entry.manifestSha256,
  };
}

async function mutateEnabled(
  options: SkillCommandOptions,
  paths: OpenRillConfigPaths,
  runtime: SkillCommandRuntime,
  enabled: boolean,
  discoveredSkillIds: readonly string[],
): Promise<{ readonly changed: boolean; readonly enabledSkillIds: readonly string[] }> {
  const skillId = options.skillId!;
  const raw = await readFile(paths.sourcePath, "utf8");
  const parsed = parseOpenRillYaml(raw);
  if (!isRecord(parsed)) throw new Error("OpenRill config source must be an object");
  const source = parsed as unknown as OpenRillConfigSource;
  const current = Array.isArray(source.skills?.enabled) ? [...source.skills.enabled] : [];
  const implicitAll = current.length === 0;
  const next = new Set(implicitAll ? discoveredSkillIds : current);
  const changed = enabled ? !next.has(skillId) : next.has(skillId);
  if (enabled) next.add(skillId); else next.delete(skillId);
  const enabledSkillIds = [...next].sort();
  if (changed) {
    const loaded = await loadOpenRillConfig({
      paths,
      env: runtime.env,
      platform: runtime.platform,
      ...(runtime.osSecretProvider ? { osSecretProvider: runtime.osSecretProvider } : {}),
    });
    await writeOpenRillConfig({
      paths,
      source: { ...source, skills: { ...(source.skills ?? {}), enabled: enabledSkillIds } },
      expectedRevision: loaded.sourceRevision,
      env: runtime.env,
      platform: runtime.platform,
      ...(runtime.osSecretProvider ? { osSecretProvider: runtime.osSecretProvider } : {}),
    });
  }
  return { changed, enabledSkillIds };
}

export async function runSkillCommand(
  options: SkillCommandOptions,
  paths: OpenRillConfigPaths,
  configRoot: string,
  io: SkillCommandIo,
  runtime: SkillCommandRuntime,
): Promise<number> {
  try {
    const resolved = await catalogFor(options, paths, configRoot, runtime);
    const entries = resolved.catalog.entries.map(entryView);
    const diagnostics = resolved.catalog.diagnostics.map((item) => ({
      code: item.code,
      skillId: item.skillId ?? null,
      source: item.sourceType,
      path: item.path,
      message: item.message,
    }));
    if (options.action === "list") {
      const payload = { workspaceId: options.workspaceId, entries, diagnostics, shadowed: resolved.catalog.shadowed };
      if (options.json) io.stdout(JSON.stringify(payload));
      else {
        for (const entry of entries) io.stdout(`${entry.enabled ? "ENABLED" : "DISABLED"} ${entry.id}@${entry.version} ${entry.source} ${entry.description}`);
        if (entries.length === 0) io.stdout("No Skills discovered.");
        for (const item of diagnostics) io.stdout(`DIAGNOSTIC ${item.code} ${item.skillId ?? "<unknown>"} ${item.message}`);
      }
      return 0;
    }
    if (options.action === "check") {
      const ready = diagnostics.length === 0;
      const payload = { workspaceId: options.workspaceId, ready, discovered: entries.length, enabled: entries.filter((item) => item.enabled).length, diagnostics };
      if (options.json) io.stdout(JSON.stringify(payload));
      else {
        io.stdout(`OpenRill Skills ${ready ? "READY" : "NOT_READY"} discovered=${payload.discovered} enabled=${payload.enabled} diagnostics=${diagnostics.length}`);
        for (const item of diagnostics) io.stdout(`DIAGNOSTIC ${item.code} ${item.skillId ?? "<unknown>"} ${item.message}`);
      }
      return ready ? 0 : 40;
    }
    const entry = entries.find((item) => item.id === options.skillId);
    if (!entry) {
      io.stderr(`openrill: Skill not found in workspace ${options.workspaceId}: ${options.skillId}`);
      return 41;
    }
    if (options.action === "show") {
      if (options.json) io.stdout(JSON.stringify(entry));
      else io.stdout(JSON.stringify(entry, null, 2));
      return 0;
    }
    const mutation = await mutateEnabled(options, paths, runtime, options.action === "enable", entries.map((item) => item.id));
    const payload = { skillId: options.skillId, action: options.action, changed: mutation.changed, enabledSkillIds: mutation.enabledSkillIds };
    if (options.json) io.stdout(JSON.stringify(payload));
    else io.stdout(`OpenRill Skill ${options.action} id=${options.skillId} changed=${mutation.changed}`);
    return 0;
  } catch (error) {
    io.stderr(`openrill: Skill operation failed: ${error instanceof Error ? error.message : String(error)}`);
    return 40;
  }
}
