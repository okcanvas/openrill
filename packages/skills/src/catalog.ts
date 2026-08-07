import { createHash } from "node:crypto";
import { lstat, realpath, readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { SkillError } from "./errors.js";
import { parseSkillYaml } from "./yaml.js";
import type {
  PersistedSkillDiagnostic,
  PersistedSkillSource,
  ShadowedSkill,
  SkillCatalog,
  SkillCatalogEntry,
  SkillDiagnostic,
  SkillManifest,
  SkillMetadataSink,
  SkillSourceDescriptor,
  SkillSourceType,
} from "./types.js";

const ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const TOOL_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
const MAX_MANIFEST_BYTES = 64 * 1024;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function contains(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function versionTuple(version: string): readonly [number, number, number] {
  const core = version.split("-", 1)[0] ?? "";
  const parts = core.split(".").map(Number);
  return [parts[0] ?? -1, parts[1] ?? -1, parts[2] ?? -1];
}

function compareVersion(left: string, right: string): number {
  const a = versionTuple(left);
  const b = versionTuple(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function validateManifest(manifest: SkillManifest, currentVersion: string): void {
  if (!ID_PATTERN.test(manifest.id)) throw new SkillError("SKILL_ID_INVALID", `invalid Skill id: ${manifest.id}`);
  if (!VERSION_PATTERN.test(manifest.version)) throw new SkillError("SKILL_VERSION_INVALID", `invalid Skill version: ${manifest.version}`);
  if (manifest.description.length > 500) throw new SkillError("SKILL_MANIFEST_INVALID", `Skill description is too long: ${manifest.id}`);
  if (manifest.activation.length > 32 || manifest.activation.some((hint) => hint.length > 200)) {
    throw new SkillError("SKILL_MANIFEST_INVALID", `Skill activation hints exceed limits: ${manifest.id}`);
  }
  if (manifest.tools.length > 32 || manifest.tools.some((tool) => !TOOL_PATTERN.test(tool))) {
    throw new SkillError("SKILL_MANIFEST_INVALID", `Skill required tools are invalid: ${manifest.id}`);
  }
  if (manifest.resources.length > 64) throw new SkillError("SKILL_MANIFEST_INVALID", `Skill resources exceed limit: ${manifest.id}`);
  const min = manifest.compatibility.minOpenRill;
  const max = manifest.compatibility.maxOpenRillExclusive;
  if (min && (!VERSION_PATTERN.test(min) || compareVersion(currentVersion, min) < 0)) {
    throw new SkillError("SKILL_MANIFEST_INVALID", `Skill ${manifest.id} requires OpenRill ${min} or later`);
  }
  if (max && (!VERSION_PATTERN.test(max) || compareVersion(currentVersion, max) >= 0)) {
    throw new SkillError("SKILL_MANIFEST_INVALID", `Skill ${manifest.id} is incompatible with OpenRill ${currentVersion}`);
  }
}

async function readUtf8Bounded(pathname: string, maxBytes: number): Promise<string> {
  const info = await stat(pathname);
  if (!info.isFile()) throw new SkillError("SKILL_MANIFEST_INVALID", `Skill file is not a regular file: ${pathname}`);
  if (info.size > maxBytes) throw new SkillError("SKILL_CONTENT_LIMIT_EXCEEDED", `Skill file exceeds ${maxBytes} bytes: ${pathname}`);
  const bytes = await readFile(pathname);
  if (bytes.includes(0)) throw new SkillError("SKILL_BINARY_CONTENT_DENIED", `Skill file contains NUL bytes: ${pathname}`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new SkillError("SKILL_BINARY_CONTENT_DENIED", `Skill file is not valid UTF-8: ${pathname}`, { cause: error });
  }
}

function portableRelativePath(raw: string, label: string): string {
  if (!raw || raw.length > 1024 || raw.includes("\\") || isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) {
    throw new SkillError("SKILL_RESOURCE_ESCAPE", `${label} must be a portable relative path: ${raw}`);
  }
  const segments = raw.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[\u0000-\u001f]/.test(segment))) {
    throw new SkillError("SKILL_RESOURCE_ESCAPE", `${label} contains an unsafe path segment: ${raw}`);
  }
  return segments.join("/");
}

async function resolveContainedFile(skillRoot: string, relativePath: string, code: "SKILL_INSTRUCTIONS_MISSING" | "SKILL_RESOURCE_MISSING"): Promise<string> {
  const normalized = portableRelativePath(relativePath, code === "SKILL_INSTRUCTIONS_MISSING" ? "instructions" : "resource");
  const absolute = join(skillRoot, ...normalized.split("/"));
  if (!contains(skillRoot, absolute)) throw new SkillError("SKILL_RESOURCE_ESCAPE", `Skill path escapes directory: ${relativePath}`);
  let linkInfo;
  try {
    linkInfo = await lstat(absolute);
  } catch (error) {
    throw new SkillError(code, `Skill file is missing: ${relativePath}`, { cause: error });
  }
  if (!linkInfo.isFile() && !linkInfo.isSymbolicLink()) throw new SkillError(code, `Skill path is not a file: ${relativePath}`);
  const canonical = await realpath(absolute);
  if (!contains(skillRoot, canonical)) throw new SkillError("SKILL_SYMLINK_ESCAPE", `Skill path resolves outside directory: ${relativePath}`);
  const info = await stat(canonical);
  if (!info.isFile()) throw new SkillError(code, `Skill path is not a regular file: ${relativePath}`);
  return canonical;
}

async function candidateDirectories(root: string): Promise<string[]> {
  try {
    const rootManifest = join(root, "skill.yaml");
    const rootManifestInfo = await stat(rootManifest).catch(() => null);
    if (rootManifestInfo?.isFile()) return [root];
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
      .map((entry) => join(root, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function sourceKey(type: SkillSourceType, rootPath: string, workspaceId: string | undefined): string {
  return sha256(`${type}\0${workspaceId ?? ""}\0${rootPath}`);
}

export interface DiscoverSkillsOptions {
  readonly bundledRoots?: readonly string[];
  readonly managedUserRoots?: readonly string[];
  readonly workspaceRoot?: string;
  readonly workspaceId?: string;
  readonly availableTools: readonly string[];
  readonly enabledSkillIds?: readonly string[];
  readonly currentVersion: string;
  readonly metadataSink?: SkillMetadataSink;
  readonly now?: () => number;
}

function diagnostic(params: {
  source: SkillSourceDescriptor;
  code: string;
  path: string;
  message: string;
  createdAt: number;
  skillId?: string;
}): SkillDiagnostic {
  const diagnosticId = sha256(`${params.source.sourceKey}\0${params.skillId ?? ""}\0${params.code}\0${params.path}\0${params.message}`);
  return {
    diagnosticId,
    sourceKey: params.source.sourceKey,
    sourceType: params.source.type,
    code: params.code,
    path: params.path,
    message: params.message,
    createdAt: params.createdAt,
    ...(params.skillId ? { skillId: params.skillId } : {}),
  };
}

function persistedDiagnostic(item: SkillDiagnostic): PersistedSkillDiagnostic {
  return {
    diagnosticId: item.diagnosticId,
    sourceKey: item.sourceKey,
    skillId: item.skillId ?? null,
    code: item.code,
    path: item.path,
    message: item.message,
    createdAt: item.createdAt,
  };
}

function canonicalSourceRevision(input: {
  entries: readonly SkillCatalogEntry[];
  diagnostics: readonly SkillDiagnostic[];
}): string {
  return JSON.stringify({
    entries: [...input.entries]
      .map((entry) => ({
        skillId: entry.skillId,
        version: entry.version,
        manifestSha256: entry.manifestSha256,
        manifestPath: entry.manifestPath,
      }))
      .sort((left, right) => left.skillId.localeCompare(right.skillId) || left.manifestPath.localeCompare(right.manifestPath)),
    diagnostics: [...input.diagnostics]
      .map((item) => ({ code: item.code, path: item.path, skillId: item.skillId ?? null, message: item.message }))
      .sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path)),
  });
}

function sourceSort(left: SkillSourceDescriptor, right: SkillSourceDescriptor): number {
  return right.precedence - left.precedence || left.ordinal - right.ordinal || left.rootPath.localeCompare(right.rootPath);
}

export async function discoverSkills(options: DiscoverSkillsOptions): Promise<SkillCatalog> {
  const now = options.now ?? Date.now;
  const discoveredAt = now();
  const rawSources: Array<{ type: SkillSourceType; root: string; precedence: number; workspaceId?: string }> = [];
  for (const root of options.bundledRoots ?? []) rawSources.push({ type: "BUNDLED", root, precedence: 10 });
  for (const root of options.managedUserRoots ?? []) rawSources.push({ type: "MANAGED_USER", root, precedence: 20 });
  if (options.workspaceRoot) rawSources.push({ type: "WORKSPACE", root: join(options.workspaceRoot, "skills"), precedence: 30, ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}) });
  const sources: SkillSourceDescriptor[] = [];
  for (const [ordinal, raw] of rawSources.entries()) {
    const resolved = resolve(raw.root);
    let canonical: string;
    try {
      canonical = await realpath(resolved);
      const info = await stat(canonical);
      if (!info.isDirectory()) continue;
    } catch {
      continue;
    }
    sources.push({
      sourceKey: sourceKey(raw.type, canonical, raw.workspaceId),
      type: raw.type,
      rootPath: canonical,
      precedence: raw.precedence,
      ordinal,
      ...(raw.workspaceId ? { workspaceId: raw.workspaceId } : {}),
    });
  }
  sources.sort(sourceSort);
  const available = new Set(options.availableTools);
  const enabledFilter = new Set(options.enabledSkillIds ?? []);
  const candidates: SkillCatalogEntry[] = [];
  const diagnostics: SkillDiagnostic[] = [];

  for (const source of sources) {
    const sourceDiagnostics: SkillDiagnostic[] = [];
    for (const directory of await candidateDirectories(source.rootPath)) {
      const manifestPath = join(directory, "skill.yaml");
      let manifest: SkillManifest | null = null;
      try {
        const directoryCanonical = await realpath(directory);
        if (!contains(source.rootPath, directoryCanonical)) throw new SkillError("SKILL_SYMLINK_ESCAPE", `Skill directory resolves outside source root: ${directory}`);
        const raw = await readUtf8Bounded(manifestPath, MAX_MANIFEST_BYTES);
        manifest = parseSkillYaml(raw);
        validateManifest(manifest, options.currentVersion);
        const instructionsPath = await resolveContainedFile(directoryCanonical, manifest.instructions, "SKILL_INSTRUCTIONS_MISSING");
        for (const resource of manifest.resources) await resolveContainedFile(directoryCanonical, resource, "SKILL_RESOURCE_MISSING");
        const unavailable = manifest.tools.filter((tool) => !available.has(tool));
        if (unavailable.length > 0) {
          throw new SkillError("SKILL_REQUIRED_TOOL_UNAVAILABLE", `Skill ${manifest.id} requires unavailable tools: ${unavailable.join(", ")}`);
        }
        const enabled = enabledFilter.size === 0 || enabledFilter.has(manifest.id);
        candidates.push({
          skillId: manifest.id,
          version: manifest.version,
          description: manifest.description,
          activation: manifest.activation,
          requiredTools: manifest.tools,
          resources: manifest.resources,
          source,
          skillDirectory: directoryCanonical,
          manifestPath: await realpath(manifestPath),
          instructionsPath,
          manifestSha256: sha256(raw),
          enabled,
        });
      } catch (error) {
        const skillError = error instanceof SkillError ? error : new SkillError("SKILL_MANIFEST_INVALID", `Skill discovery failed: ${manifestPath}`, { cause: error });
        sourceDiagnostics.push(diagnostic({
          source,
          code: skillError.code,
          path: manifestPath,
          message: skillError.message,
          createdAt: discoveredAt,
          ...(manifest?.id ? { skillId: manifest.id } : {}),
        }));
      }
    }
    diagnostics.push(...sourceDiagnostics);
  }

  candidates.sort((left, right) => sourceSort(left.source, right.source) || left.skillId.localeCompare(right.skillId) || left.manifestPath.localeCompare(right.manifestPath));
  const selected = new Map<string, SkillCatalogEntry>();
  const shadowed: ShadowedSkill[] = [];
  for (const candidate of candidates) {
    const existing = selected.get(candidate.skillId);
    if (!existing) {
      selected.set(candidate.skillId, candidate);
      continue;
    }
    shadowed.push({
      skillId: candidate.skillId,
      selectedSourceKey: existing.source.sourceKey,
      shadowedSourceKey: candidate.source.sourceKey,
      shadowedPath: candidate.manifestPath,
    });
    diagnostics.push(diagnostic({
      source: candidate.source,
      code: "SKILL_SHADOWED",
      path: candidate.manifestPath,
      message: `Skill ${candidate.skillId} is shadowed by higher precedence source ${existing.source.type}`,
      skillId: candidate.skillId,
      createdAt: discoveredAt,
    }));
  }
  if (options.metadataSink) {
    for (const source of sources) {
      const persisted: PersistedSkillSource = {
        sourceKey: source.sourceKey,
        sourceType: source.type,
        workspaceId: source.workspaceId ?? null,
        rootPath: source.rootPath,
        rootRevision: sha256(canonicalSourceRevision({
          entries: candidates.filter((item) => item.source.sourceKey === source.sourceKey),
          diagnostics: diagnostics.filter((item) => item.sourceKey === source.sourceKey),
        })),
        discoveredAt,
      };
      options.metadataSink.replaceSourceDiscovery(
        persisted,
        diagnostics.filter((item) => item.sourceKey === source.sourceKey).map(persistedDiagnostic),
      );
    }
  }
  return {
    entries: [...selected.values()].sort((left, right) => left.skillId.localeCompare(right.skillId)),
    diagnostics: diagnostics.sort((left, right) => left.diagnosticId.localeCompare(right.diagnosticId)),
    shadowed: shadowed.sort((left, right) => left.skillId.localeCompare(right.skillId) || left.shadowedPath.localeCompare(right.shadowedPath)),
    discoveredAt,
  };
}

export function selectActivatedSkills(catalog: SkillCatalog, userText: string): SkillCatalogEntry[] {
  const normalized = userText.toLocaleLowerCase("en-US");
  return catalog.entries.filter((entry) => entry.enabled && entry.activation.some((hint) => normalized.includes(hint.toLocaleLowerCase("en-US"))));
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function formatSkillCatalogForPrompt(catalog: SkillCatalog): string {
  if (catalog.entries.length === 0) return "";
  const lines = ["", "OpenRill Skill catalog metadata:", "<skill_catalog>"];
  for (const entry of catalog.entries) {
    lines.push(`  <skill id="${xml(entry.skillId)}" version="${xml(entry.version)}" source="${entry.source.type}">`);
    lines.push(`    <description>${xml(entry.description)}</description>`);
    if (entry.activation.length > 0) lines.push(`    <activation>${xml(entry.activation.join(" | "))}</activation>`);
    if (entry.requiredTools.length > 0) lines.push(`    <required_tools>${xml(entry.requiredTools.join(","))}</required_tools>`);
    lines.push("  </skill>");
  }
  lines.push("</skill_catalog>");
  return lines.join("\n");
}
