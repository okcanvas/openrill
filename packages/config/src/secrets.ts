import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { OpenRillConfigError } from "./errors.js";
import { createOsSecretProvider, type OsSecretProvider } from "./os-secrets.js";
import type { OpenRillConfig, SecretReference, SecretReferenceStatus } from "./types.js";

function within(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function secretFilePath(configRoot: string, key: string): string {
  const secretsRoot = resolve(configRoot, "secrets");
  const candidate = resolve(secretsRoot, key);
  if (!within(secretsRoot, candidate)) {
    throw new OpenRillConfigError("CONFIG_SECRET_UNRESOLVED", `file secret reference escapes secrets root: ${key}`);
  }
  return candidate;
}

function osProvider(options: {
  readonly configRoot: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly osSecretProvider?: OsSecretProvider;
}): OsSecretProvider {
  return options.osSecretProvider ?? createOsSecretProvider({
    configRoot: options.configRoot,
    ...(options.env ? { env: options.env } : {}),
    ...(options.platform ? { platform: options.platform } : {}),
  });
}

export async function inspectSecretReference(
  reference: SecretReference,
  options: {
    readonly env: NodeJS.ProcessEnv;
    readonly configRoot: string;
    readonly platform?: NodeJS.Platform;
    readonly osSecretProvider?: OsSecretProvider;
  },
): Promise<Omit<SecretReferenceStatus, "path">> {
  if (reference.kind === "env") {
    return {
      reference,
      available: typeof options.env[reference.key] === "string" && options.env[reference.key]!.length > 0,
      reason: typeof options.env[reference.key] === "string" && options.env[reference.key]!.length > 0 ? "AVAILABLE" : "MISSING_ENV",
    };
  }
  if (reference.kind === "file") {
    const path = secretFilePath(options.configRoot, reference.key);
    const available = await stat(path).then((entry) => entry.isFile()).catch(() => false);
    return { reference, available, reason: available ? "AVAILABLE" : "MISSING_FILE" };
  }
  const inspection = await osProvider(options).inspect(reference.key);
  const reason = inspection.reason === "AVAILABLE"
    ? "AVAILABLE"
    : inspection.reason === "MISSING"
      ? "MISSING_OS_SECRET"
      : inspection.reason === "UNREADABLE"
        ? "OS_SECRET_UNREADABLE"
        : "OS_PROVIDER_UNAVAILABLE";
  return { reference, available: inspection.available, reason };
}

export async function resolveSecretReference(
  reference: SecretReference,
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly configRoot: string;
    readonly platform?: NodeJS.Platform;
    readonly osSecretProvider?: OsSecretProvider;
  },
): Promise<string> {
  const env = options.env ?? process.env;
  if (reference.kind === "env") {
    const value = env[reference.key];
    if (!value) throw new OpenRillConfigError("CONFIG_SECRET_UNRESOLVED", `environment secret is unavailable: ${reference.key}`);
    return value;
  }
  if (reference.kind === "file") {
    const path = secretFilePath(options.configRoot, reference.key);
    const value = (await readFile(path, "utf8")).trimEnd();
    if (!value) throw new OpenRillConfigError("CONFIG_SECRET_UNRESOLVED", `file secret is empty: ${reference.key}`);
    return value;
  }
  return await osProvider({ ...options, env }).get(reference.key);
}

export async function collectSecretStatuses(
  config: OpenRillConfig,
  options: {
    readonly env: NodeJS.ProcessEnv;
    readonly configRoot: string;
    readonly platform?: NodeJS.Platform;
    readonly osSecretProvider?: OsSecretProvider;
  },
): Promise<SecretReferenceStatus[]> {
  const output: SecretReferenceStatus[] = [];
  for (const [provider, declaration] of Object.entries(config.modelProviders)) {
    if (!declaration.apiKey) continue;
    const status = await inspectSecretReference(declaration.apiKey, options);
    output.push({ path: `modelProviders.${provider}.apiKey`, ...status });
  }
  for (const [extensionId, settings] of Object.entries(config.extensions.settings)) {
    for (const [key, reference] of Object.entries(settings.secrets)) {
      const status = await inspectSecretReference(reference, options);
      output.push({ path: `extensions.settings.${extensionId}.secrets.${key}`, ...status });
    }
  }
  return output.sort((left, right) => left.path.localeCompare(right.path));
}

export function redactSecretReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecretReferences);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      (record.kind === "env" || record.kind === "file" || record.kind === "os")
      && typeof record.key === "string"
      && Object.keys(record).every((key) => key === "kind" || key === "key")
    ) {
      return { kind: record.kind, key: "<redacted>" };
    }
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) output[key] = redactSecretReferences(child);
    return output;
  }
  return value;
}
