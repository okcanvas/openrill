import type { ConfigIssue } from "./errors.js";

export const OPENRILL_CONFIG_VERSION = 1 as const;
export const OPENRILL_DEFAULT_HOST_BIND = "127.0.0.1" as const;
export const OPENRILL_DEFAULT_HOST_PORT = 47117 as const;

export type SecretReferenceKind = "env" | "file" | "os";

export interface SecretReference {
  readonly kind: SecretReferenceKind;
  readonly key: string;
}

export interface SourceHostConfig {
  readonly bind?: string;
  readonly port?: number;
}

export interface SourceModelProviderConfig {
  readonly type: string;
  readonly endpoint?: string;
  readonly apiKey?: SecretReference;
  readonly model?: string;
  readonly maxOutputTokens?: number;
  readonly maxRetries?: number;
}

export interface SourceWorkspaceConfig {
  readonly id: string;
  readonly path: string;
  readonly readOnly?: boolean;
}

export interface SourceExecutionDockerConfig {
  readonly image?: string;
  readonly executable?: string;
  readonly profile?: string;
  readonly memoryBytes?: number;
  readonly pidsLimit?: number;
}

export interface SourceExecutionConfig {
  readonly approvalMode?: "ask" | "allow" | "deny";
  readonly defaultTimeoutMs?: number;
  readonly approvalTimeoutMs?: number;
  readonly backend?: "host" | "docker";
  readonly fallback?: "deny" | "host";
  readonly mountMode?: "readOnly" | "readWrite";
  readonly networkMode?: "none" | "outbound";
  readonly docker?: SourceExecutionDockerConfig;
}

export interface SourceSkillsConfig {
  readonly roots?: readonly string[];
  readonly enabled?: readonly string[];
}

export interface SourceAutomationConfig {
  readonly enabled?: boolean;
}

export interface SourceMaintenanceConfig {
  readonly enabled?: boolean;
  readonly sweepIntervalMs?: number;
  readonly batchSize?: number;
  readonly leaseDurationMs?: number;
  readonly taskRetentionMs?: number;
  readonly lostTaskRetentionMs?: number;
  readonly flowRetentionMs?: number;
  readonly lostFlowRetentionMs?: number;
  readonly connectorDeliveryRetentionMs?: number;
}

export interface SourceExtensionSettings {
  readonly values?: Readonly<Record<string, string | number | boolean>>;
  readonly secrets?: Readonly<Record<string, SecretReference>>;
}

export interface SourceExtensionsConfig {
  readonly roots?: readonly string[];
  readonly enabled?: readonly string[];
  readonly settings?: Readonly<Record<string, SourceExtensionSettings>>;
}

export interface SourceBrowserConfig {
  readonly enabled?: boolean;
  readonly headless?: boolean;
  readonly executablePath?: string;
  readonly launchTimeoutMs?: number;
  readonly actionTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly sweepIntervalMs?: number;
  readonly maxSessions?: number;
  readonly maxPagesPerSession?: number;
  readonly allowPrivateNetwork?: boolean;
  readonly allowedHostnames?: readonly string[];
}

export interface SourceUiConfig {
  readonly openOnStart?: boolean;
}

export interface OpenRillConfigSource {
  readonly version: number;
  readonly include?: string | readonly string[];
  readonly host?: SourceHostConfig;
  readonly modelProviders?: Readonly<Record<string, SourceModelProviderConfig>>;
  readonly workspaces?: readonly SourceWorkspaceConfig[];
  readonly execution?: SourceExecutionConfig;
  readonly skills?: SourceSkillsConfig;
  readonly automation?: SourceAutomationConfig;
  readonly maintenance?: SourceMaintenanceConfig;
  readonly extensions?: SourceExtensionsConfig;
  readonly browser?: SourceBrowserConfig;
  readonly ui?: SourceUiConfig;
}

export interface OpenRillConfig {
  readonly version: typeof OPENRILL_CONFIG_VERSION;
  readonly host: {
    readonly bind: string;
    readonly port: number;
  };
  readonly modelProviders: Readonly<Record<string, SourceModelProviderConfig>>;
  readonly workspaces: readonly Required<SourceWorkspaceConfig>[];
  readonly execution: {
    readonly approvalMode: "ask" | "allow" | "deny";
    readonly defaultTimeoutMs: number;
    readonly approvalTimeoutMs: number;
    readonly backend: "host" | "docker";
    readonly fallback: "deny" | "host";
    readonly mountMode: "readOnly" | "readWrite";
    readonly networkMode: "none" | "outbound";
    readonly docker: {
      readonly image?: string;
      readonly executable: string;
      readonly profile?: string;
      readonly memoryBytes: number;
      readonly pidsLimit: number;
    };
  };
  readonly skills: {
    readonly roots: readonly string[];
    readonly enabled: readonly string[];
  };
  readonly automation: {
    readonly enabled: boolean;
  };
  readonly maintenance: {
    readonly enabled: boolean;
    readonly sweepIntervalMs: number;
    readonly batchSize: number;
    readonly leaseDurationMs: number;
    readonly taskRetentionMs: number;
    readonly lostTaskRetentionMs: number;
    readonly flowRetentionMs: number;
    readonly lostFlowRetentionMs: number;
    readonly connectorDeliveryRetentionMs: number;
  };
  readonly extensions: {
    readonly roots: readonly string[];
    readonly enabled: readonly string[];
    readonly settings: Readonly<Record<string, {
      readonly values: Readonly<Record<string, string | number | boolean>>;
      readonly secrets: Readonly<Record<string, SecretReference>>;
    }>>;
  };
  readonly browser: {
    readonly enabled: boolean;
    readonly headless: boolean;
    readonly executablePath?: string;
    readonly launchTimeoutMs: number;
    readonly actionTimeoutMs: number;
    readonly idleTimeoutMs: number;
    readonly sweepIntervalMs: number;
    readonly maxSessions: number;
    readonly maxPagesPerSession: number;
    readonly allowPrivateNetwork: boolean;
    readonly allowedHostnames: readonly string[];
  };
  readonly ui: {
    readonly openOnStart: boolean;
  };
}

export interface SecretReferenceStatus {
  readonly path: string;
  readonly reference: SecretReference;
  readonly available: boolean;
  readonly reason: "AVAILABLE" | "MISSING_ENV" | "MISSING_FILE" | "MISSING_OS_SECRET" | "OS_SECRET_UNREADABLE" | "OS_PROVIDER_UNAVAILABLE";
}

export type ConfigRecoveryMode = "SOURCE" | "LAST_KNOWN_GOOD" | "DEFAULTS";

export interface OpenRillConfigReadResult {
  readonly config: OpenRillConfig;
  readonly redactedConfig: unknown;
  readonly sourcePath: string;
  readonly sourceExists: boolean;
  readonly sourceRevision: string | null;
  readonly materializedRevision: string;
  readonly sourceFiles: readonly string[];
  readonly warnings: readonly string[];
  readonly issues: readonly ConfigIssue[];
  readonly secretStatuses: readonly SecretReferenceStatus[];
  readonly recovery: ConfigRecoveryMode;
  readonly loadedAt: string;
}

export interface OpenRillConfigPaths {
  readonly sourcePath: string;
  readonly stateDir: string;
  readonly materializedPath: string;
  readonly lastKnownGoodPath: string;
  readonly journalDir: string;
  readonly mutationLockPath: string;
  readonly secretsDir: string;
}

export interface PersistedConfigSnapshot {
  readonly schemaVersion: 1;
  readonly product: "OpenRill";
  readonly configVersion: typeof OPENRILL_CONFIG_VERSION;
  readonly sourcePath: string;
  readonly sourceRevision: string;
  readonly materializedRevision: string;
  readonly sourceFiles: readonly string[];
  readonly loadedAt: string;
  readonly config: OpenRillConfig;
  readonly redactedConfig: unknown;
  readonly warnings: readonly string[];
  readonly secretStatuses: readonly SecretReferenceStatus[];
}

export interface ConfigMutationJournalRecord {
  readonly schemaVersion: 1;
  readonly product: "OpenRill";
  readonly event: "config.write";
  readonly changedAt: string;
  readonly sourceRevisionBefore: string | null;
  readonly sourceRevisionAfter: string;
  readonly materializedRevision: string;
  readonly changedPaths: readonly string[];
}
