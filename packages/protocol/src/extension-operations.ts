export interface ExtensionListInput {}
export interface ExtensionGetInput { readonly extensionId: string; }
export interface ExtensionEnableInput { readonly extensionId: string; }
export interface ExtensionDisableInput { readonly extensionId: string; }

export type ExtensionRuntimeState = "DISCOVERED" | "BLOCKED" | "ACTIVATING" | "READY" | "FAILED" | "DEACTIVATING" | "DISABLED";

export interface PublicExtensionCapability {
  readonly kind: "connector" | "provider" | "skill-source" | "tool";
  readonly id: string;
}

export interface PublicExtensionIssue {
  readonly code: string;
  readonly message: string;
}

export interface PublicExtensionView {
  readonly extensionId: string;
  readonly displayName: string;
  readonly version: string;
  readonly state: ExtensionRuntimeState;
  readonly enabled: boolean;
  readonly activationSequence: number | null;
  readonly capabilities: readonly PublicExtensionCapability[];
  readonly issue: PublicExtensionIssue | null;
}
