/** Bundled OpenRill Skill catalogue boundary. */
export const PACKAGE_NAME = "@openrill/skills-builtin" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "SKILLS_BUILTIN" as const;
export const BUILTIN_SKILL_IDS = ["workspace-review"] as const;

export interface PackageIdentity {
  readonly name: typeof PACKAGE_NAME;
  readonly version: typeof PACKAGE_VERSION;
  readonly boundary: typeof PACKAGE_BOUNDARY;
}

export function getPackageIdentity(): PackageIdentity {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY };
}
