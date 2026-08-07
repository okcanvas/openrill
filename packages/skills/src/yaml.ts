import { SkillError } from "./errors.js";
import type { SkillCompatibility, SkillManifest } from "./types.js";

const TOP_LEVEL_KEYS = new Set(["id", "version", "description", "activation", "instructions", "tools", "resources", "compatibility"]);
const ARRAY_KEYS = new Set(["activation", "tools", "resources"]);
const COMPATIBILITY_KEYS = new Set(["minOpenRill", "maxOpenRillExclusive"]);

function scalar(raw: string, lineNumber: number): string {
  const value = raw.trim();
  if (!value) throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: scalar value is empty`);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const quote = value[0];
    const body = value.slice(1, -1);
    if (quote === '"') {
      try {
        return JSON.parse(value) as string;
      } catch (error) {
        throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: invalid quoted scalar`, { cause: error });
      }
    }
    return body.replaceAll("''", "'");
  }
  if (value.includes(" #")) return value.slice(0, value.indexOf(" #")).trimEnd();
  return value;
}

function requiredString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml field ${key} must be a non-empty string`);
  }
  return value.trim();
}

function stringArray(record: Readonly<Record<string, unknown>>, key: string): string[] {
  const value = record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml field ${key} must be a string list`);
  }
  return [...new Set(value.map((item) => (item as string).trim()))];
}

export function parseSkillYaml(raw: string): SkillManifest {
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const result: Record<string, unknown> = {};
  let currentArray: string | null = null;
  let inCompatibility = false;
  const compatibility: Record<string, string> = {};
  const lines = raw.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const lineNumber = index + 1;
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    if (rawLine.includes("\t")) throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: tabs are not allowed`);
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    if (indent === 0) {
      currentArray = null;
      inCompatibility = false;
      const separator = line.indexOf(":");
      if (separator <= 0) throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: expected key: value`);
      const key = line.slice(0, separator).trim();
      const remainder = line.slice(separator + 1).trim();
      if (!TOP_LEVEL_KEYS.has(key)) throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: unknown field ${key}`);
      if (Object.hasOwn(result, key)) throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: duplicate field ${key}`);
      if (ARRAY_KEYS.has(key)) {
        if (remainder) throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: ${key} must use block list syntax`);
        result[key] = [];
        currentArray = key;
      } else if (key === "compatibility") {
        if (remainder) throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: compatibility must use nested mapping syntax`);
        result[key] = compatibility;
        inCompatibility = true;
      } else {
        result[key] = scalar(remainder, lineNumber);
      }
      continue;
    }
    if (indent !== 2) throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: only two-space nesting is supported`);
    if (currentArray) {
      if (!line.startsWith("- ")) throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: expected list item`);
      (result[currentArray] as string[]).push(scalar(line.slice(2), lineNumber));
      continue;
    }
    if (inCompatibility) {
      const separator = line.indexOf(":");
      if (separator <= 0) throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: expected compatibility key: value`);
      const key = line.slice(0, separator).trim();
      if (!COMPATIBILITY_KEYS.has(key)) throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: unknown compatibility field ${key}`);
      if (Object.hasOwn(compatibility, key)) throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: duplicate compatibility field ${key}`);
      compatibility[key] = scalar(line.slice(separator + 1), lineNumber);
      continue;
    }
    throw new SkillError("SKILL_MANIFEST_INVALID", `skill.yaml line ${lineNumber}: unexpected nested content`);
  }

  const parsedCompatibility = result.compatibility as Record<string, string> | undefined;
  const normalizedCompatibility: SkillCompatibility = {
    ...(parsedCompatibility?.minOpenRill ? { minOpenRill: parsedCompatibility.minOpenRill } : {}),
    ...(parsedCompatibility?.maxOpenRillExclusive ? { maxOpenRillExclusive: parsedCompatibility.maxOpenRillExclusive } : {}),
  };
  return {
    id: requiredString(result, "id"),
    version: requiredString(result, "version"),
    description: requiredString(result, "description"),
    activation: stringArray(result, "activation"),
    instructions: requiredString(result, "instructions"),
    tools: stringArray(result, "tools"),
    resources: stringArray(result, "resources"),
    compatibility: normalizedCompatibility,
  };
}
