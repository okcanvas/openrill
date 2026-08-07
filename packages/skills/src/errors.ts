export type SkillErrorCode =
  | "SKILL_MANIFEST_INVALID"
  | "SKILL_ID_INVALID"
  | "SKILL_VERSION_INVALID"
  | "SKILL_INSTRUCTIONS_MISSING"
  | "SKILL_RESOURCE_MISSING"
  | "SKILL_RESOURCE_ESCAPE"
  | "SKILL_SYMLINK_ESCAPE"
  | "SKILL_BINARY_CONTENT_DENIED"
  | "SKILL_CONTENT_LIMIT_EXCEEDED"
  | "SKILL_REQUIRED_TOOL_UNAVAILABLE"
  | "SKILL_SNAPSHOT_INCONSISTENT";

export class SkillError extends Error {
  public readonly code: SkillErrorCode;
  public constructor(code: SkillErrorCode, message: string, options: ErrorOptions = {}) {
    super(message, options);
    this.name = "SkillError";
    this.code = code;
  }
}
