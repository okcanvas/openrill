import type { SecretReference } from "@openrill/config";
import type { OpenRillConnectorAdapter, OpenRillConnectorHostPort } from "@openrill/connectors";

export const OPENRILL_EXTENSION_MANIFEST_FILE = "openrill.extension.json" as const;
export const OPENRILL_EXTENSION_MANIFEST_SCHEMA_VERSION = 1 as const;
export const OPENRILL_EXTENSION_API_VERSION = 1 as const;

export type OpenRillExtensionCapabilityKind = "connector" | "provider" | "skill-source" | "tool";

export interface OpenRillExtensionCapability {
  readonly kind: OpenRillExtensionCapabilityKind;
  readonly id: string;
}

export type OpenRillExtensionConfigFieldKind = "boolean" | "integer" | "secret" | "string";

export interface OpenRillExtensionConfigField {
  readonly key: string;
  readonly kind: OpenRillExtensionConfigFieldKind;
  readonly required: boolean;
  readonly description?: string;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly choices?: readonly string[];
}

export interface OpenRillExtensionConfigSchema {
  readonly additionalProperties: false;
  readonly fields: readonly OpenRillExtensionConfigField[];
}

export interface OpenRillExtensionHostCompatibility {
  readonly minInclusive: string;
  readonly maxExclusive?: string;
}

export interface OpenRillExtensionCompatibility {
  readonly apiVersion: typeof OPENRILL_EXTENSION_API_VERSION;
  readonly host: OpenRillExtensionHostCompatibility;
}

export interface OpenRillExtensionManifest {
  readonly schemaVersion: typeof OPENRILL_EXTENSION_MANIFEST_SCHEMA_VERSION;
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly entry: string;
  readonly compatibility: OpenRillExtensionCompatibility;
  readonly capabilities: readonly OpenRillExtensionCapability[];
  readonly configSchema: OpenRillExtensionConfigSchema;
}

export interface OpenRillExtensionSourceSettings {
  readonly values: Readonly<Record<string, string | number | boolean>>;
  readonly secrets: Readonly<Record<string, SecretReference>>;
}

export interface OpenRillExtensionActivationContext {
  readonly extensionId: string;
  readonly manifest: OpenRillExtensionManifest;
  readonly config: Readonly<Record<string, string | number | boolean>>;
  readonly signal: AbortSignal;
  claimCapability(capability: OpenRillExtensionCapability): void;
  registerConnector?(adapter: OpenRillConnectorAdapter): OpenRillConnectorHostPort;
  resolveSecret(key: string): Promise<string>;
}

export interface OpenRillExtensionRuntime {
  deactivate(reason: string): Promise<void> | void;
}

export interface OpenRillExtensionModule {
  activate(context: OpenRillExtensionActivationContext): Promise<OpenRillExtensionRuntime> | OpenRillExtensionRuntime;
}

export type OpenRillExtensionState =
  | "DISCOVERED"
  | "BLOCKED"
  | "ACTIVATING"
  | "READY"
  | "FAILED"
  | "DEACTIVATING"
  | "DISABLED";

export type OpenRillExtensionIssueCode =
  | "CAPABILITY_CONFLICT"
  | "CONFIG_INVALID"
  | "DUPLICATE_EXTENSION_ID"
  | "ENTRY_INVALID"
  | "HOST_INCOMPATIBLE"
  | "MANIFEST_INVALID"
  | "MODULE_INVALID"
  | "SECRET_UNAVAILABLE"
  | "ACTIVATION_FAILED"
  | "DEACTIVATION_FAILED";

export interface OpenRillExtensionIssue {
  readonly code: OpenRillExtensionIssueCode;
  readonly message: string;
}

export interface OpenRillExtensionPublicView {
  readonly extensionId: string;
  readonly displayName: string;
  readonly version: string;
  readonly state: OpenRillExtensionState;
  readonly enabled: boolean;
  readonly activationSequence: number | null;
  readonly capabilities: readonly OpenRillExtensionCapability[];
  readonly issue: OpenRillExtensionIssue | null;
}
