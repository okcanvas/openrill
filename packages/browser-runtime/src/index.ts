/** OpenRill Browser Runtime lifecycle and policy foundation. */
export const PACKAGE_NAME = "@openrill/browser-runtime" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "BROWSER_RUNTIME" as const;

export interface PackageIdentity {
  readonly name: typeof PACKAGE_NAME;
  readonly version: typeof PACKAGE_VERSION;
  readonly boundary: typeof PACKAGE_BOUNDARY;
}

export function getPackageIdentity(): PackageIdentity {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY };
}

export { BrowserRuntimeError } from "./errors.js";
export type { BrowserRuntimeErrorCode } from "./errors.js";
export {
  assertBrowserNavigationAllowed,
  assertBrowserNavigationResultAllowed,
  defaultBrowserHostnameLookup,
  isPrivateNetworkAddress,
  parseBrowserNavigationUrl,
} from "./policy.js";
export { BrowserRuntime } from "./runtime.js";
export { registerBrowserTools, type BrowserToolLedger, type BrowserToolLedgerStart, type BrowserToolLedgerComplete, type RegisterBrowserToolsOptions } from "./tools.js";
export type {
  BrowserContextHandle,
  BrowserContextOptions,
  BrowserDialogObservation,
  BrowserDialogType,
  BrowserDocumentNavigation,
  BrowserArtifactKind,
  BrowserArtifactReference,
  BrowserArtifactStore,
  BrowserDownloadResult,
  BrowserEvidenceEvent,
  BrowserEvidenceLocation,
  BrowserDownloadHandle,
  BrowserDriver,
  BrowserHostnameLookup,
  BrowserHostnameLookupResult,
  BrowserLaunchOptions,
  BrowserNavigationPolicy,
  BrowserNavigationResult,
  BrowserPageAction,
  BrowserPageActionObservation,
  BrowserPageActionResult,
  BrowserPageDownloadObservation,
  BrowserPageEvidence,
  BrowserPageEvidenceObservation,
  BrowserPageObservation,
  BrowserPageObservationElement,
  BrowserPageSnapshot,
  BrowserPageSnapshotElement,
  BrowserPageScreenshotObservation,
  BrowserOutputLimits,
  BrowserOwner,
  BrowserPageHandle,
  BrowserPageState,
  BrowserPageView,
  BrowserProcessHandle,
  BrowserRuntimeEvent,
  BrowserRuntimeEventKind,
  BrowserRuntimeLimits,
  BrowserRuntimeOptions,
  BrowserRuntimePolicy,
  BrowserRuntimeSnapshot,
  BrowserRuntimeState,
  BrowserSessionState,
  BrowserScreenshotFormat,
  BrowserScreenshotResult,
  BrowserSessionView,
} from "./types.js";
