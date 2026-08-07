import { isIP } from "node:net";
import { ConfigFutureVersionError, ConfigValidationError, type ConfigIssue } from "./errors.js";
import {
  OPENRILL_CONFIG_VERSION,
  OPENRILL_DEFAULT_HOST_BIND,
  OPENRILL_DEFAULT_HOST_PORT,
  type OpenRillConfig,
  type OpenRillConfigSource,
  type SecretReference,
  type SourceModelProviderConfig,
  type SourceWorkspaceConfig,
} from "./types.js";

const ROOT_KEYS = new Set(["version", "include", "host", "modelProviders", "workspaces", "execution", "skills", "automation", "maintenance", "extensions", "browser", "ui"]);
const HOST_KEYS = new Set(["bind", "port"]);
const PROVIDER_KEYS = new Set(["type", "endpoint", "apiKey", "model", "maxOutputTokens", "maxRetries"]);
const WORKSPACE_KEYS = new Set(["id", "path", "readOnly"]);
const EXECUTION_KEYS = new Set(["approvalMode", "defaultTimeoutMs", "approvalTimeoutMs", "backend", "fallback", "mountMode", "networkMode", "docker"]);
const EXECUTION_DOCKER_KEYS = new Set(["image", "executable", "profile", "memoryBytes", "pidsLimit"]);
const SKILLS_KEYS = new Set(["roots", "enabled"]);
const AUTOMATION_KEYS = new Set(["enabled"]);
const MAINTENANCE_KEYS = new Set(["enabled", "sweepIntervalMs", "batchSize", "leaseDurationMs", "taskRetentionMs", "lostTaskRetentionMs", "flowRetentionMs", "lostFlowRetentionMs", "connectorDeliveryRetentionMs"]);
const EXTENSIONS_KEYS = new Set(["roots", "enabled", "settings"]);
const EXTENSION_SETTINGS_KEYS = new Set(["values", "secrets"]);
const BROWSER_KEYS = new Set(["enabled", "headless", "executablePath", "launchTimeoutMs", "actionTimeoutMs", "idleTimeoutMs", "sweepIntervalMs", "maxSessions", "maxPagesPerSession", "allowPrivateNetwork", "allowedHostnames"]);
const UI_KEYS = new Set(["openOnStart"]);
const SECRET_REF_KEYS = new Set(["kind", "key"]);
const PROVIDER_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const WORKSPACE_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const EXTENSION_ID_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/;
const EXTENSION_SETTING_KEY_PATTERN = /^[a-z][a-zA-Z0-9._-]{0,63}$/;
const ENV_SECRET_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const GENERAL_SECRET_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/\\:#-]{0,255}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pushUnknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string, issues: ConfigIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push({ path: path ? `${path}.${key}` : key, code: "UNKNOWN_KEY", message: "unknown configuration key" });
  }
}

function requireRecord(value: unknown, path: string, issues: ConfigIssue[]): Record<string, unknown> | null {
  if (!isRecord(value)) {
    issues.push({ path, code: "TYPE", message: "must be an object" });
    return null;
  }
  return value;
}

function optionalString(value: unknown, path: string, issues: ConfigIssue[], options: { nonEmpty?: boolean; max?: number } = {}): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    issues.push({ path, code: "TYPE", message: "must be a string" });
    return undefined;
  }
  if (options.nonEmpty && value.trim().length === 0) issues.push({ path, code: "EMPTY", message: "must not be empty" });
  if (options.max !== undefined && value.length > options.max) issues.push({ path, code: "LENGTH", message: `must be at most ${options.max} characters` });
  return value;
}

function optionalBoolean(value: unknown, path: string, issues: ConfigIssue[]): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    issues.push({ path, code: "TYPE", message: "must be a boolean" });
    return undefined;
  }
  return value;
}

function optionalInteger(value: unknown, path: string, issues: ConfigIssue[], min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    issues.push({ path, code: "RANGE", message: `must be an integer between ${min} and ${max}` });
    return undefined;
  }
  return value as number;
}

function validateStringArray(value: unknown, path: string, issues: ConfigIssue[]): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issues.push({ path, code: "TYPE", message: "must be an array" });
    return undefined;
  }
  const output: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      issues.push({ path: `${path}[${index}]`, code: "TYPE", message: "must be a non-empty string" });
    } else {
      output.push(entry);
    }
  }
  return output;
}

export function validateSecretReference(value: unknown, path: string, issues: ConfigIssue[]): SecretReference | undefined {
  if (value === undefined) return undefined;
  const record = requireRecord(value, path, issues);
  if (!record) return undefined;
  pushUnknownKeys(record, SECRET_REF_KEYS, path, issues);
  const kind = record.kind;
  const key = record.key;
  if (kind !== "env" && kind !== "file" && kind !== "os") {
    issues.push({ path: `${path}.kind`, code: "ENUM", message: "must be one of env, file, os" });
  }
  if (typeof key !== "string" || key.length === 0) {
    issues.push({ path: `${path}.key`, code: "TYPE", message: "must be a non-empty string" });
  } else if (kind === "env" && !ENV_SECRET_KEY_PATTERN.test(key)) {
    issues.push({ path: `${path}.key`, code: "SECRET_ENV_KEY", message: "invalid environment secret key" });
  } else if ((kind === "file" || kind === "os") && (!GENERAL_SECRET_KEY_PATTERN.test(key) || key.split(/[\\/]/).some((segment) => segment === "." || segment === ".."))) {
    issues.push({ path: `${path}.key`, code: "SECRET_KEY", message: "invalid or traversal-capable secret key" });
  }
  return kind === "env" || kind === "file" || kind === "os"
    ? typeof key === "string" ? { kind, key } : undefined
    : undefined;
}

function validateProvider(name: string, value: unknown, issues: ConfigIssue[]): SourceModelProviderConfig | null {
  const path = `modelProviders.${name}`;
  if (!PROVIDER_NAME_PATTERN.test(name)) issues.push({ path, code: "PROVIDER_NAME", message: "provider name must match /^[a-z][a-z0-9_-]{0,63}$/" });
  const record = requireRecord(value, path, issues);
  if (!record) return null;
  pushUnknownKeys(record, PROVIDER_KEYS, path, issues);
  const type = optionalString(record.type, `${path}.type`, issues, { nonEmpty: true, max: 64 });
  if (type === undefined) issues.push({ path: `${path}.type`, code: "REQUIRED", message: "is required" });
  const endpoint = optionalString(record.endpoint, `${path}.endpoint`, issues, { nonEmpty: true, max: 2048 });
  if (endpoint !== undefined) {
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:" && url.protocol !== "http:") issues.push({ path: `${path}.endpoint`, code: "URL_SCHEME", message: "must use http or https" });
    } catch {
      issues.push({ path: `${path}.endpoint`, code: "URL", message: "must be an absolute URL" });
    }
  }
  const apiKey = validateSecretReference(record.apiKey, `${path}.apiKey`, issues);
  const model = optionalString(record.model, `${path}.model`, issues, { nonEmpty: true, max: 256 });
  const maxOutputTokens = optionalInteger(record.maxOutputTokens, `${path}.maxOutputTokens`, issues, 1, 1_000_000);
  const maxRetries = optionalInteger(record.maxRetries, `${path}.maxRetries`, issues, 0, 10);
  if (type === "openai-responses") {
    if (!endpoint) issues.push({ path: `${path}.endpoint`, code: "REQUIRED", message: "is required for openai-responses" });
    if (!apiKey) issues.push({ path: `${path}.apiKey`, code: "REQUIRED", message: "is required for openai-responses" });
    if (!model) issues.push({ path: `${path}.model`, code: "REQUIRED", message: "is required for openai-responses" });
  }
  if (!type) return null;
  return {
    type,
    ...(endpoint !== undefined ? { endpoint } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(maxRetries !== undefined ? { maxRetries } : {}),
  };
}

function validateExtensionScalar(value: unknown, path: string, issues: ConfigIssue[]): string | number | boolean | undefined {
  if (typeof value === "string") {
    if (value.length > 65_536) issues.push({ path, code: "LENGTH", message: "must be at most 65536 characters" });
    return value;
  }
  if (typeof value === "boolean") return value;
  if (Number.isSafeInteger(value)) return value as number;
  issues.push({ path, code: "TYPE", message: "must be a string, boolean, or safe integer" });
  return undefined;
}

function validateExtensionSettings(value: unknown, extensionId: string, issues: ConfigIssue[]): { readonly values: Readonly<Record<string, string | number | boolean>>; readonly secrets: Readonly<Record<string, SecretReference>> } | null {
  const path = `extensions.settings.${extensionId}`;
  if (!EXTENSION_ID_PATTERN.test(extensionId)) issues.push({ path, code: "EXTENSION_ID", message: "extension id is invalid" });
  const record = requireRecord(value, path, issues);
  if (!record) return null;
  pushUnknownKeys(record, EXTENSION_SETTINGS_KEYS, path, issues);
  const values: Record<string, string | number | boolean> = {};
  if (record.values !== undefined) {
    const sourceValues = requireRecord(record.values, `${path}.values`, issues);
    if (sourceValues) {
      if (Object.keys(sourceValues).length > 128) issues.push({ path: `${path}.values`, code: "COUNT", message: "must contain at most 128 settings" });
      for (const [key, raw] of Object.entries(sourceValues)) {
        if (!EXTENSION_SETTING_KEY_PATTERN.test(key)) issues.push({ path: `${path}.values.${key}`, code: "SETTING_KEY", message: "extension setting key is invalid" });
        const checked = validateExtensionScalar(raw, `${path}.values.${key}`, issues);
        if (checked !== undefined) values[key] = checked;
      }
    }
  }
  const secrets: Record<string, SecretReference> = {};
  if (record.secrets !== undefined) {
    const sourceSecrets = requireRecord(record.secrets, `${path}.secrets`, issues);
    if (sourceSecrets) {
      if (Object.keys(sourceSecrets).length > 128) issues.push({ path: `${path}.secrets`, code: "COUNT", message: "must contain at most 128 secret references" });
      for (const [key, raw] of Object.entries(sourceSecrets)) {
        if (!EXTENSION_SETTING_KEY_PATTERN.test(key)) issues.push({ path: `${path}.secrets.${key}`, code: "SETTING_KEY", message: "extension secret key is invalid" });
        const checked = validateSecretReference(raw, `${path}.secrets.${key}`, issues);
        if (checked) secrets[key] = checked;
      }
    }
  }
  return { values, secrets };
}

function validateWorkspace(value: unknown, index: number, issues: ConfigIssue[]): SourceWorkspaceConfig | null {
  const path = `workspaces[${index}]`;
  const record = requireRecord(value, path, issues);
  if (!record) return null;
  pushUnknownKeys(record, WORKSPACE_KEYS, path, issues);
  const id = optionalString(record.id, `${path}.id`, issues, { nonEmpty: true, max: 64 });
  const workspacePath = optionalString(record.path, `${path}.path`, issues, { nonEmpty: true, max: 4096 });
  const readOnly = optionalBoolean(record.readOnly, `${path}.readOnly`, issues) ?? false;
  if (!id) issues.push({ path: `${path}.id`, code: "REQUIRED", message: "is required" });
  else if (!WORKSPACE_ID_PATTERN.test(id)) issues.push({ path: `${path}.id`, code: "WORKSPACE_ID", message: "invalid workspace id" });
  if (!workspacePath) issues.push({ path: `${path}.path`, code: "REQUIRED", message: "is required" });
  if (!id || !workspacePath) return null;
  return { id, path: workspacePath, readOnly };
}

export function validateAndMaterializeConfig(value: unknown): OpenRillConfig {
  const issues: ConfigIssue[] = [];
  const root = requireRecord(value, "<root>", issues);
  if (!root) throw new ConfigValidationError("OpenRill config root must be an object", issues);
  pushUnknownKeys(root, ROOT_KEYS, "", issues);

  if (!Number.isInteger(root.version) || (root.version as number) < 1) {
    issues.push({ path: "version", code: "VERSION", message: "must be a positive integer" });
  } else if ((root.version as number) > OPENRILL_CONFIG_VERSION) {
    throw new ConfigFutureVersionError(root.version as number, OPENRILL_CONFIG_VERSION);
  } else if (root.version !== OPENRILL_CONFIG_VERSION) {
    issues.push({ path: "version", code: "VERSION", message: `must equal ${OPENRILL_CONFIG_VERSION}` });
  }

  if (root.include !== undefined) {
    const includes = typeof root.include === "string" ? [root.include] : root.include;
    if (!Array.isArray(includes) || includes.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
      issues.push({ path: "include", code: "INCLUDE", message: "must be a non-empty string or array of non-empty strings" });
    }
  }

  let bind: string = OPENRILL_DEFAULT_HOST_BIND;
  let port: number = OPENRILL_DEFAULT_HOST_PORT;
  if (root.host !== undefined) {
    const host = requireRecord(root.host, "host", issues);
    if (host) {
      pushUnknownKeys(host, HOST_KEYS, "host", issues);
      const candidateBind = optionalString(host.bind, "host.bind", issues, { nonEmpty: true, max: 255 });
      if (candidateBind !== undefined) {
        const normalized = candidateBind === "localhost" ? "127.0.0.1" : candidateBind;
        if (normalized !== "127.0.0.1" && normalized !== "::1" && isIP(normalized) === 0) {
          issues.push({ path: "host.bind", code: "LOOPBACK", message: "must be 127.0.0.1, ::1, or localhost" });
        } else if (normalized !== "127.0.0.1" && normalized !== "::1") {
          issues.push({ path: "host.bind", code: "LOOPBACK", message: "must be loopback-only" });
        } else {
          bind = normalized;
        }
      }
      port = optionalInteger(host.port, "host.port", issues, 0, 65535) ?? port;
    }
  }

  const modelProviders: Record<string, SourceModelProviderConfig> = {};
  if (root.modelProviders !== undefined) {
    const providers = requireRecord(root.modelProviders, "modelProviders", issues);
    if (providers) {
      for (const [name, provider] of Object.entries(providers)) {
        const validated = validateProvider(name, provider, issues);
        if (validated) modelProviders[name] = validated;
      }
    }
  }

  const workspaces: Required<SourceWorkspaceConfig>[] = [];
  if (root.workspaces !== undefined) {
    if (!Array.isArray(root.workspaces)) {
      issues.push({ path: "workspaces", code: "TYPE", message: "must be an array" });
    } else {
      const ids = new Set<string>();
      for (const [index, workspace] of root.workspaces.entries()) {
        const validated = validateWorkspace(workspace, index, issues);
        if (!validated) continue;
        if (ids.has(validated.id)) issues.push({ path: `workspaces[${index}].id`, code: "DUPLICATE", message: "workspace id must be unique" });
        ids.add(validated.id);
        workspaces.push({ ...validated, readOnly: validated.readOnly ?? false });
      }
    }
  }

  let approvalMode: "ask" | "allow" | "deny" = "ask";
  let defaultTimeoutMs = 120_000;
  let approvalTimeoutMs = 120_000;
  let executionBackend: "host" | "docker" = "host";
  let executionFallback: "deny" | "host" = "deny";
  let executionMountMode: "readOnly" | "readWrite" = "readOnly";
  let executionNetworkMode: "none" | "outbound" = "none";
  let dockerImage: string | undefined;
  let dockerExecutable = "docker";
  let dockerProfile: string | undefined;
  let dockerMemoryBytes = 536_870_912;
  let dockerPidsLimit = 256;
  if (root.execution !== undefined) {
    const execution = requireRecord(root.execution, "execution", issues);
    if (execution) {
      pushUnknownKeys(execution, EXECUTION_KEYS, "execution", issues);
      if (execution.approvalMode !== undefined) {
        if (execution.approvalMode === "ask" || execution.approvalMode === "allow" || execution.approvalMode === "deny") approvalMode = execution.approvalMode;
        else issues.push({ path: "execution.approvalMode", code: "ENUM", message: "must be ask, allow, or deny" });
      }
      defaultTimeoutMs = optionalInteger(execution.defaultTimeoutMs, "execution.defaultTimeoutMs", issues, 100, 3_600_000) ?? defaultTimeoutMs;
      approvalTimeoutMs = optionalInteger(execution.approvalTimeoutMs, "execution.approvalTimeoutMs", issues, 100, 3_600_000) ?? approvalTimeoutMs;
      if (execution.backend !== undefined) {
        if (execution.backend === "host" || execution.backend === "docker") executionBackend = execution.backend;
        else issues.push({ path: "execution.backend", code: "ENUM", message: "must be host or docker" });
      }
      if (execution.fallback !== undefined) {
        if (execution.fallback === "deny" || execution.fallback === "host") executionFallback = execution.fallback;
        else issues.push({ path: "execution.fallback", code: "ENUM", message: "must be deny or host" });
      }
      if (execution.mountMode !== undefined) {
        if (execution.mountMode === "readOnly" || execution.mountMode === "readWrite") executionMountMode = execution.mountMode;
        else issues.push({ path: "execution.mountMode", code: "ENUM", message: "must be readOnly or readWrite" });
      }
      if (execution.networkMode !== undefined) {
        if (execution.networkMode === "none" || execution.networkMode === "outbound") executionNetworkMode = execution.networkMode;
        else issues.push({ path: "execution.networkMode", code: "ENUM", message: "must be none or outbound" });
      }
      if (execution.docker !== undefined) {
        const docker = requireRecord(execution.docker, "execution.docker", issues);
        if (docker) {
          pushUnknownKeys(docker, EXECUTION_DOCKER_KEYS, "execution.docker", issues);
          dockerImage = optionalString(docker.image, "execution.docker.image", issues, { nonEmpty: true, max: 4096 });
          dockerExecutable = optionalString(docker.executable, "execution.docker.executable", issues, { nonEmpty: true, max: 4096 }) ?? dockerExecutable;
          dockerProfile = optionalString(docker.profile, "execution.docker.profile", issues, { nonEmpty: true, max: 64 });
          dockerMemoryBytes = optionalInteger(docker.memoryBytes, "execution.docker.memoryBytes", issues, 16_777_216, 68_719_476_736) ?? dockerMemoryBytes;
          dockerPidsLimit = optionalInteger(docker.pidsLimit, "execution.docker.pidsLimit", issues, 16, 65_536) ?? dockerPidsLimit;
          if (dockerProfile !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(dockerProfile)) issues.push({ path: "execution.docker.profile", code: "PATTERN", message: "must be a valid Docker label value" });
          if (dockerImage !== undefined && !/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(dockerImage)) issues.push({ path: "execution.docker.image", code: "DIGEST", message: "must be pinned by sha256 digest" });
        }
      }
      if (executionBackend === "docker" && dockerImage === undefined) issues.push({ path: "execution.docker.image", code: "REQUIRED", message: "is required when execution.backend is docker" });
    }
  }

  let roots: string[] = [];
  let enabled: string[] = [];
  if (root.skills !== undefined) {
    const skills = requireRecord(root.skills, "skills", issues);
    if (skills) {
      pushUnknownKeys(skills, SKILLS_KEYS, "skills", issues);
      roots = validateStringArray(skills.roots, "skills.roots", issues) ?? roots;
      enabled = validateStringArray(skills.enabled, "skills.enabled", issues) ?? enabled;
    }
  }

  let automationEnabled = false;
  if (root.automation !== undefined) {
    const automation = requireRecord(root.automation, "automation", issues);
    if (automation) {
      pushUnknownKeys(automation, AUTOMATION_KEYS, "automation", issues);
      automationEnabled = optionalBoolean(automation.enabled, "automation.enabled", issues) ?? automationEnabled;
    }
  }

  let maintenanceEnabled = true;
  let maintenanceSweepIntervalMs = 300_000;
  let maintenanceBatchSize = 100;
  let maintenanceLeaseDurationMs = 120_000;
  let maintenanceTaskRetentionMs = 30 * 24 * 60 * 60_000;
  let maintenanceLostTaskRetentionMs = 7 * 24 * 60 * 60_000;
  let maintenanceFlowRetentionMs = 30 * 24 * 60 * 60_000;
  let maintenanceLostFlowRetentionMs = 7 * 24 * 60 * 60_000;
  let maintenanceConnectorDeliveryRetentionMs = 30 * 24 * 60 * 60_000;
  if (root.maintenance !== undefined) {
    const maintenance = requireRecord(root.maintenance, "maintenance", issues);
    if (maintenance) {
      pushUnknownKeys(maintenance, MAINTENANCE_KEYS, "maintenance", issues);
      maintenanceEnabled = optionalBoolean(maintenance.enabled, "maintenance.enabled", issues) ?? maintenanceEnabled;
      maintenanceSweepIntervalMs = optionalInteger(maintenance.sweepIntervalMs, "maintenance.sweepIntervalMs", issues, 1_000, 86_400_000) ?? maintenanceSweepIntervalMs;
      maintenanceBatchSize = optionalInteger(maintenance.batchSize, "maintenance.batchSize", issues, 1, 1_000) ?? maintenanceBatchSize;
      maintenanceLeaseDurationMs = optionalInteger(maintenance.leaseDurationMs, "maintenance.leaseDurationMs", issues, 5_000, 3_600_000) ?? maintenanceLeaseDurationMs;
      maintenanceTaskRetentionMs = optionalInteger(maintenance.taskRetentionMs, "maintenance.taskRetentionMs", issues, 60_000, 31_536_000_000) ?? maintenanceTaskRetentionMs;
      maintenanceLostTaskRetentionMs = optionalInteger(maintenance.lostTaskRetentionMs, "maintenance.lostTaskRetentionMs", issues, 60_000, 31_536_000_000) ?? maintenanceLostTaskRetentionMs;
      maintenanceFlowRetentionMs = optionalInteger(maintenance.flowRetentionMs, "maintenance.flowRetentionMs", issues, 60_000, 31_536_000_000) ?? maintenanceFlowRetentionMs;
      maintenanceLostFlowRetentionMs = optionalInteger(maintenance.lostFlowRetentionMs, "maintenance.lostFlowRetentionMs", issues, 60_000, 31_536_000_000) ?? maintenanceLostFlowRetentionMs;
      maintenanceConnectorDeliveryRetentionMs = optionalInteger(maintenance.connectorDeliveryRetentionMs, "maintenance.connectorDeliveryRetentionMs", issues, 60_000, 31_536_000_000) ?? maintenanceConnectorDeliveryRetentionMs;
    }
  }

  let extensionRoots: string[] = [];
  let enabledExtensions: string[] = [];
  const extensionSettings: Record<string, { readonly values: Readonly<Record<string, string | number | boolean>>; readonly secrets: Readonly<Record<string, SecretReference>> }> = {};
  if (root.extensions !== undefined) {
    const extensions = requireRecord(root.extensions, "extensions", issues);
    if (extensions) {
      pushUnknownKeys(extensions, EXTENSIONS_KEYS, "extensions", issues);
      extensionRoots = validateStringArray(extensions.roots, "extensions.roots", issues) ?? extensionRoots;
      enabledExtensions = validateStringArray(extensions.enabled, "extensions.enabled", issues) ?? enabledExtensions;
      if (extensionRoots.length > 128) issues.push({ path: "extensions.roots", code: "COUNT", message: "must contain at most 128 extension roots" });
      if (enabledExtensions.length > 128) issues.push({ path: "extensions.enabled", code: "COUNT", message: "must contain at most 128 extension ids" });
      const rootSet = new Set<string>();
      extensionRoots = extensionRoots.map((entry) => entry.trim()).filter((normalized, index) => {
        if (normalized.length > 4096 || normalized.includes("\0")) issues.push({ path: `extensions.roots[${index}]`, code: "PATH", message: "extension root must be a bounded path" });
        if (rootSet.has(normalized)) { issues.push({ path: `extensions.roots[${index}]`, code: "DUPLICATE", message: "extension roots must be unique" }); return false; }
        rootSet.add(normalized); return true;
      }).sort();
      const enabledSet = new Set<string>();
      enabledExtensions = enabledExtensions.filter((entry, index) => {
        if (!EXTENSION_ID_PATTERN.test(entry)) issues.push({ path: `extensions.enabled[${index}]`, code: "EXTENSION_ID", message: "extension id is invalid" });
        if (enabledSet.has(entry)) { issues.push({ path: `extensions.enabled[${index}]`, code: "DUPLICATE", message: "enabled extension ids must be unique" }); return false; }
        enabledSet.add(entry); return true;
      }).sort();
      if (extensions.settings !== undefined) {
        const settings = requireRecord(extensions.settings, "extensions.settings", issues);
        if (settings) {
          if (Object.keys(settings).length > 128) issues.push({ path: "extensions.settings", code: "COUNT", message: "must contain at most 128 extensions" });
          for (const [extensionId, raw] of Object.entries(settings)) {
            const checked = validateExtensionSettings(raw, extensionId, issues);
            if (checked) extensionSettings[extensionId] = checked;
          }
        }
      }
    }
  }

  let browserEnabled = false;
  let browserHeadless = true;
  let browserExecutablePath: string | undefined;
  let browserLaunchTimeoutMs = 30_000;
  let browserActionTimeoutMs = 15_000;
  let browserIdleTimeoutMs = 300_000;
  let browserSweepIntervalMs = 30_000;
  let browserMaxSessions = 4;
  let browserMaxPagesPerSession = 8;
  let browserAllowPrivateNetwork = false;
  let browserAllowedHostnames: string[] = [];
  if (root.browser !== undefined) {
    const browser = requireRecord(root.browser, "browser", issues);
    if (browser) {
      pushUnknownKeys(browser, BROWSER_KEYS, "browser", issues);
      browserEnabled = optionalBoolean(browser.enabled, "browser.enabled", issues) ?? browserEnabled;
      browserHeadless = optionalBoolean(browser.headless, "browser.headless", issues) ?? browserHeadless;
      browserExecutablePath = optionalString(browser.executablePath, "browser.executablePath", issues, { nonEmpty: true, max: 4096 });
      browserLaunchTimeoutMs = optionalInteger(browser.launchTimeoutMs, "browser.launchTimeoutMs", issues, 100, 300_000) ?? browserLaunchTimeoutMs;
      browserActionTimeoutMs = optionalInteger(browser.actionTimeoutMs, "browser.actionTimeoutMs", issues, 100, 300_000) ?? browserActionTimeoutMs;
      browserIdleTimeoutMs = optionalInteger(browser.idleTimeoutMs, "browser.idleTimeoutMs", issues, 1_000, 3_600_000) ?? browserIdleTimeoutMs;
      browserSweepIntervalMs = optionalInteger(browser.sweepIntervalMs, "browser.sweepIntervalMs", issues, 100, 600_000) ?? browserSweepIntervalMs;
      browserMaxSessions = optionalInteger(browser.maxSessions, "browser.maxSessions", issues, 1, 32) ?? browserMaxSessions;
      browserMaxPagesPerSession = optionalInteger(browser.maxPagesPerSession, "browser.maxPagesPerSession", issues, 1, 64) ?? browserMaxPagesPerSession;
      browserAllowPrivateNetwork = optionalBoolean(browser.allowPrivateNetwork, "browser.allowPrivateNetwork", issues) ?? browserAllowPrivateNetwork;
      browserAllowedHostnames = validateStringArray(browser.allowedHostnames, "browser.allowedHostnames", issues) ?? browserAllowedHostnames;
      const unique = new Set<string>();
      for (const [index, raw] of browserAllowedHostnames.entries()) {
        const normalized = raw.trim().toLowerCase().replace(/\.$/, "");
        if (!/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(normalized) && isIP(normalized) === 0) {
          issues.push({ path: `browser.allowedHostnames[${index}]`, code: "HOSTNAME", message: "must be an exact hostname, IP literal, or *.suffix pattern" });
        }
        if (unique.has(normalized)) issues.push({ path: `browser.allowedHostnames[${index}]`, code: "DUPLICATE", message: "browser hostname allowlist entries must be unique" });
        unique.add(normalized);
      }
      browserAllowedHostnames = [...unique].sort();
    }
  }

  let openOnStart = false;
  if (root.ui !== undefined) {
    const ui = requireRecord(root.ui, "ui", issues);
    if (ui) {
      pushUnknownKeys(ui, UI_KEYS, "ui", issues);
      openOnStart = optionalBoolean(ui.openOnStart, "ui.openOnStart", issues) ?? openOnStart;
    }
  }

  if (issues.length > 0) throw new ConfigValidationError("OpenRill config validation failed", issues);

  return {
    version: OPENRILL_CONFIG_VERSION,
    host: { bind, port },
    modelProviders,
    workspaces,
    execution: {
      approvalMode,
      defaultTimeoutMs,
      approvalTimeoutMs,
      backend: executionBackend,
      fallback: executionFallback,
      mountMode: executionMountMode,
      networkMode: executionNetworkMode,
      docker: {
        ...(dockerImage !== undefined ? { image: dockerImage } : {}),
        executable: dockerExecutable,
        ...(dockerProfile !== undefined ? { profile: dockerProfile } : {}),
        memoryBytes: dockerMemoryBytes,
        pidsLimit: dockerPidsLimit,
      },
    },
    skills: { roots, enabled },
    automation: { enabled: automationEnabled },
    maintenance: {
      enabled: maintenanceEnabled,
      sweepIntervalMs: maintenanceSweepIntervalMs,
      batchSize: maintenanceBatchSize,
      leaseDurationMs: maintenanceLeaseDurationMs,
      taskRetentionMs: maintenanceTaskRetentionMs,
      lostTaskRetentionMs: maintenanceLostTaskRetentionMs,
      flowRetentionMs: maintenanceFlowRetentionMs,
      lostFlowRetentionMs: maintenanceLostFlowRetentionMs,
      connectorDeliveryRetentionMs: maintenanceConnectorDeliveryRetentionMs,
    },
    extensions: { roots: extensionRoots, enabled: enabledExtensions, settings: extensionSettings },
    browser: {
      enabled: browserEnabled,
      headless: browserHeadless,
      ...(browserExecutablePath !== undefined ? { executablePath: browserExecutablePath } : {}),
      launchTimeoutMs: browserLaunchTimeoutMs,
      actionTimeoutMs: browserActionTimeoutMs,
      idleTimeoutMs: browserIdleTimeoutMs,
      sweepIntervalMs: browserSweepIntervalMs,
      maxSessions: browserMaxSessions,
      maxPagesPerSession: browserMaxPagesPerSession,
      allowPrivateNetwork: browserAllowPrivateNetwork,
      allowedHostnames: browserAllowedHostnames,
    },
    ui: { openOnStart },
  };
}

export function createMinimalConfigSource(): OpenRillConfigSource {
  return {
    version: OPENRILL_CONFIG_VERSION,
    host: { bind: OPENRILL_DEFAULT_HOST_BIND, port: OPENRILL_DEFAULT_HOST_PORT },
    execution: { approvalMode: "ask", defaultTimeoutMs: 120_000, approvalTimeoutMs: 120_000 },
    automation: { enabled: false },
    maintenance: { enabled: true },
    extensions: { roots: [], enabled: [], settings: {} },
    browser: { enabled: false },
    ui: { openOnStart: false },
  };
}
