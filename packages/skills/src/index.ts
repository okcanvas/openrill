/** OpenRill Skill discovery, validation, precedence, and immutable Run snapshot boundary. */
export const PACKAGE_NAME = "@openrill/skills" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "SKILLS" as const;

export interface PackageIdentity {
  readonly name: typeof PACKAGE_NAME;
  readonly version: typeof PACKAGE_VERSION;
  readonly boundary: typeof PACKAGE_BOUNDARY;
}

export function getPackageIdentity(): PackageIdentity {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY };
}

export { SkillError, type SkillErrorCode } from "./errors.js";
export { discoverSkills, formatSkillCatalogForPrompt, selectActivatedSkills, type DiscoverSkillsOptions } from "./catalog.js";
export { SkillSnapshotStore, formatActiveSkillInstructions, type SkillSnapshotStoreOptions } from "./snapshot.js";
export { parseSkillYaml } from "./yaml.js";
export type {
  PersistedSkillDiagnostic,
  PersistedSkillRunContext,
  PersistedSkillSnapshot,
  PersistedSkillSource,
  ShadowedSkill,
  SkillCatalog,
  SkillCatalogEntry,
  SkillCompatibility,
  SkillDiagnostic,
  SkillManifest,
  SkillMetadataSink,
  SkillResolvedFile,
  SkillSnapshot,
  SkillSourceDescriptor,
  SkillSourceType,
} from "./types.js";
