import {
  OPENRILL_EXTENSION_API_VERSION,
  OPENRILL_EXTENSION_MANIFEST_SCHEMA_VERSION,
  type OpenRillExtensionCapability,
  type OpenRillExtensionCapabilityKind,
  type OpenRillExtensionConfigField,
  type OpenRillExtensionConfigFieldKind,
  type OpenRillExtensionManifest,
  type OpenRillExtensionSourceSettings,
} from "./types.js";

export interface ExtensionValidationSuccess<T> { readonly ok: true; readonly value: T; }
export interface ExtensionValidationFailure { readonly ok: false; readonly error: string; }
export type ExtensionValidationResult<T> = ExtensionValidationSuccess<T> | ExtensionValidationFailure;

const EXTENSION_ID_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/;
const CONFIG_KEY_PATTERN = /^[a-z][a-zA-Z0-9._-]{0,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const CAPABILITY_KINDS = new Set<OpenRillExtensionCapabilityKind>(["connector", "provider", "skill-source", "tool"]);
const CONFIG_FIELD_KINDS = new Set<OpenRillExtensionConfigFieldKind>(["boolean", "integer", "secret", "string"]);

function success<T>(value: T): ExtensionValidationSuccess<T> { return { ok: true, value }; }
function failure(error: string): ExtensionValidationFailure { return { ok: false, error }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
function boundedString(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value.length >= min && value.length <= max; }
function boundedInteger(value: unknown, min: number, max: number): value is number { return Number.isInteger(value) && Number(value) >= min && Number(value) <= max; }

export function extensionCapabilityKey(capability: OpenRillExtensionCapability): string {
  return `${capability.kind}:${capability.id}`;
}

export function validateExtensionCapability(value: unknown): ExtensionValidationResult<OpenRillExtensionCapability> {
  if (!isRecord(value) || !exactKeys(value, ["kind", "id"])) return failure("extension capability must be a closed object");
  if (!CAPABILITY_KINDS.has(value.kind as OpenRillExtensionCapabilityKind)) return failure("extension capability kind is invalid");
  if (!EXTENSION_ID_PATTERN.test(String(value.id))) return failure("extension capability id is invalid");
  return success(value as unknown as OpenRillExtensionCapability);
}

function validateConfigField(value: unknown): ExtensionValidationResult<OpenRillExtensionConfigField> {
  if (!isRecord(value) || !exactKeys(value, ["key", "kind", "required"], ["description", "maxLength", "min", "max", "choices"])) {
    return failure("extension config field must be a closed object");
  }
  if (!CONFIG_KEY_PATTERN.test(String(value.key))) return failure("extension config field key is invalid");
  if (!CONFIG_FIELD_KINDS.has(value.kind as OpenRillExtensionConfigFieldKind)) return failure("extension config field kind is invalid");
  if (typeof value.required !== "boolean") return failure("extension config field required must be boolean");
  if (value.description !== undefined && !boundedString(value.description, 1, 512)) return failure("extension config field description is invalid");
  if (value.maxLength !== undefined && !boundedInteger(value.maxLength, 1, 65_536)) return failure("extension config field maxLength is invalid");
  if (value.min !== undefined && !boundedInteger(value.min, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)) return failure("extension config field min is invalid");
  if (value.max !== undefined && !boundedInteger(value.max, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)) return failure("extension config field max is invalid");
  if (value.min !== undefined && value.max !== undefined && Number(value.min) > Number(value.max)) return failure("extension config field min cannot exceed max");
  if (value.choices !== undefined) {
    if (!Array.isArray(value.choices) || value.choices.length < 1 || value.choices.length > 100) return failure("extension config field choices are invalid");
    const choices = new Set<string>();
    for (const choice of value.choices) {
      if (!boundedString(choice, 1, 1024) || choices.has(choice)) return failure("extension config field choices must be unique bounded strings");
      choices.add(choice);
    }
  }
  if (value.kind === "secret" && (value.maxLength !== undefined || value.min !== undefined || value.max !== undefined || value.choices !== undefined)) {
    return failure("secret config fields cannot declare value constraints");
  }
  if (value.kind === "boolean" && (value.maxLength !== undefined || value.min !== undefined || value.max !== undefined || value.choices !== undefined)) {
    return failure("boolean config fields cannot declare value constraints");
  }
  if (value.kind === "integer" && (value.maxLength !== undefined || value.choices !== undefined)) return failure("integer config fields only support min and max");
  if (value.kind === "string" && (value.min !== undefined || value.max !== undefined)) return failure("string config fields only support maxLength and choices");
  return success(value as unknown as OpenRillExtensionConfigField);
}

export function validateExtensionManifest(value: unknown): ExtensionValidationResult<OpenRillExtensionManifest> {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "id", "displayName", "version", "entry", "compatibility", "capabilities", "configSchema"])) {
    return failure("extension manifest must be a closed object");
  }
  if (value.schemaVersion !== OPENRILL_EXTENSION_MANIFEST_SCHEMA_VERSION) return failure("unsupported extension manifest schemaVersion");
  if (!EXTENSION_ID_PATTERN.test(String(value.id))) return failure("extension id is invalid");
  if (!boundedString(value.displayName, 1, 128)) return failure("extension displayName is invalid");
  if (!VERSION_PATTERN.test(String(value.version))) return failure("extension version is invalid");
  if (!boundedString(value.entry, 1, 1024) || value.entry.startsWith("/") || value.entry.startsWith("\\") || value.entry.includes("\0")) return failure("extension entry is invalid");
  const segments = value.entry.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..") || !/\.(?:m?js)$/.test(value.entry)) return failure("extension entry must be a relative JavaScript module path");

  if (!isRecord(value.compatibility) || !exactKeys(value.compatibility, ["apiVersion", "host"])) return failure("extension compatibility must be a closed object");
  if (value.compatibility.apiVersion !== OPENRILL_EXTENSION_API_VERSION) return failure("extension apiVersion is incompatible");
  if (!isRecord(value.compatibility.host) || !exactKeys(value.compatibility.host, ["minInclusive"], ["maxExclusive"])) return failure("extension host compatibility must be a closed object");
  if (!VERSION_PATTERN.test(String(value.compatibility.host.minInclusive))) return failure("extension minInclusive host version is invalid");
  if (value.compatibility.host.maxExclusive !== undefined && !VERSION_PATTERN.test(String(value.compatibility.host.maxExclusive))) return failure("extension maxExclusive host version is invalid");

  if (!Array.isArray(value.capabilities) || value.capabilities.length < 1 || value.capabilities.length > 128) return failure("extension capabilities must contain 1-128 entries");
  const capabilityKeys = new Set<string>();
  for (const candidate of value.capabilities) {
    const checked = validateExtensionCapability(candidate);
    if (!checked.ok) return checked;
    const key = extensionCapabilityKey(checked.value);
    if (capabilityKeys.has(key)) return failure("extension capabilities must be unique");
    capabilityKeys.add(key);
  }

  if (!isRecord(value.configSchema) || !exactKeys(value.configSchema, ["additionalProperties", "fields"])) return failure("extension configSchema must be a closed object");
  if (value.configSchema.additionalProperties !== false || !Array.isArray(value.configSchema.fields) || value.configSchema.fields.length > 128) return failure("extension configSchema is invalid");
  const fieldKeys = new Set<string>();
  for (const candidate of value.configSchema.fields) {
    const checked = validateConfigField(candidate);
    if (!checked.ok) return checked;
    if (fieldKeys.has(checked.value.key)) return failure("extension config field keys must be unique");
    fieldKeys.add(checked.value.key);
  }
  return success(value as unknown as OpenRillExtensionManifest);
}

export function validateExtensionSettings(
  manifest: OpenRillExtensionManifest,
  settings: OpenRillExtensionSourceSettings,
): ExtensionValidationResult<OpenRillExtensionSourceSettings> {
  const fields = new Map(manifest.configSchema.fields.map((field) => [field.key, field]));
  for (const key of Object.keys(settings.values)) {
    const field = fields.get(key);
    if (!field || field.kind === "secret") return failure(`unknown extension value setting: ${key}`);
    const value = settings.values[key];
    if (field.kind === "boolean" && typeof value !== "boolean") return failure(`extension setting ${key} must be boolean`);
    if (field.kind === "integer") {
      if (!Number.isSafeInteger(value)) return failure(`extension setting ${key} must be an integer`);
      if (field.min !== undefined && Number(value) < field.min) return failure(`extension setting ${key} is below minimum`);
      if (field.max !== undefined && Number(value) > field.max) return failure(`extension setting ${key} exceeds maximum`);
    }
    if (field.kind === "string") {
      if (typeof value !== "string") return failure(`extension setting ${key} must be a string`);
      if (field.maxLength !== undefined && value.length > field.maxLength) return failure(`extension setting ${key} exceeds maxLength`);
      if (field.choices !== undefined && !field.choices.includes(value)) return failure(`extension setting ${key} is not an allowed choice`);
    }
  }
  for (const key of Object.keys(settings.secrets)) {
    const field = fields.get(key);
    if (!field || field.kind !== "secret") return failure(`unknown extension secret setting: ${key}`);
  }
  for (const field of manifest.configSchema.fields) {
    if (!field.required) continue;
    const present = field.kind === "secret" ? Object.hasOwn(settings.secrets, field.key) : Object.hasOwn(settings.values, field.key);
    if (!present) return failure(`required extension setting is missing: ${field.key}`);
  }
  return success(settings);
}
