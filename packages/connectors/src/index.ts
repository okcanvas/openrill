export const PACKAGE_NAME = "@openrill/connectors" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "CONNECTORS" as const;

export interface PackageIdentity {
  readonly name: typeof PACKAGE_NAME;
  readonly version: typeof PACKAGE_VERSION;
  readonly boundary: typeof PACKAGE_BOUNDARY;
}

export function getPackageIdentity(): PackageIdentity {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY };
}

export { ConnectorError, ConnectorDeliveryError, ConnectorIngressError } from "./errors.js";
export type { ConnectorErrorCode, ConnectorDeliveryCertainty } from "./errors.js";
export { ConnectorRuntimeService } from "./service.js";
export type { ConnectorRuntimeServiceOptions } from "./service.js";
export { ConnectorAdapterRegistry } from "./runtime.js";
export type { ConnectorAdapterRegistryOptions } from "./runtime.js";
export type {
  ConnectorAccount, ConnectorConversationBinding, ConnectorIngress, ConnectorDelivery,
  ConnectorDeliveryAttempt, ConnectorDeliveryReceipt, ConnectorDeadLetter,
  ConnectorIngressAdmission, ConnectorIngressAdmissionResult, ConnectorIngressClaim,
  ConnectorIngressRoute, ConnectorIngressDisposition, ConnectorIngressAdoptionResult,
  ConnectorDeliveryRequest, ConnectorDeliveryEnqueueResult, ConnectorDeliveryClaim,
  ConnectorProviderReceipt, ConnectorProviderDeliveryResult, OpenRillConnectorAdapter,
  OpenRillConnectorHostPort, ConnectorAdapterRegistration,
  ConnectorRunOutputProjection, ConnectorRunRecoveryResult,
  ConnectorAdapterPublicStatus, ConnectorAdapterDoctorCheck, ConnectorAdapterDoctorResult,
} from "./types.js";
