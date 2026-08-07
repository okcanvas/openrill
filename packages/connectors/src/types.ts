import type {
  LedgerConnectorAccountRow,
  LedgerConnectorBindingRow,
  LedgerConnectorDeadLetterRow,
  LedgerConnectorDeliveryAttemptRow,
  LedgerConnectorDeliveryReceiptRow,
  LedgerConnectorDeliveryRow,
  LedgerConnectorIngressRow,
} from "@openrill/state";

export type ConnectorAccount = LedgerConnectorAccountRow;
export type ConnectorConversationBinding = LedgerConnectorBindingRow;
export type ConnectorIngress = LedgerConnectorIngressRow;
export type ConnectorDelivery = LedgerConnectorDeliveryRow;
export type ConnectorDeliveryAttempt = LedgerConnectorDeliveryAttemptRow;
export type ConnectorDeliveryReceipt = LedgerConnectorDeliveryReceiptRow;
export type ConnectorDeadLetter = LedgerConnectorDeadLetterRow;

export interface ConnectorIngressAdmission {
  readonly accountId: string;
  readonly externalEventId: string;
  readonly laneKey: string;
  readonly payloadVersion: number;
  readonly payload: unknown;
  readonly receivedAt?: number;
}

export interface ConnectorIngressAdmissionResult {
  readonly ingress: ConnectorIngress;
  readonly replayed: boolean;
  readonly acknowledge: true;
}

export interface ConnectorIngressClaim {
  readonly ingress: ConnectorIngress;
  readonly claimToken: string;
  readonly claimDeadlineAt: number;
}

export interface ConnectorIngressRoute {
  readonly workspaceId: string;
  readonly externalScopeId: string;
  readonly externalConversationId: string;
  readonly externalThreadId?: string;
  readonly modelProfile?: string;
  readonly title?: string;
}

export type ConnectorIngressDisposition =
  | {
      readonly kind: "message";
      readonly route: ConnectorIngressRoute;
      readonly text: string;
    }
  | {
      readonly kind: "ignored";
      readonly reason: string;
    };

export interface ConnectorIngressAdoptionResult {
  readonly ingress: ConnectorIngress;
  readonly binding: ConnectorConversationBinding;
  readonly conversationId: string;
  readonly messageId: string;
  readonly runId: string;
  readonly replayed: boolean;
}

export interface ConnectorDeliveryRequest {
  readonly accountId: string;
  readonly conversationId: string;
  readonly runId?: string;
  readonly sourceMessageId?: string;
  readonly targetKey: string;
  readonly threadKey?: string;
  readonly payloadVersion: number;
  readonly payload: unknown;
  readonly idempotencyKey: string;
  readonly availableAt?: number;
}

export interface ConnectorDeliveryEnqueueResult {
  readonly delivery: ConnectorDelivery;
  readonly replayed: boolean;
}

export interface ConnectorDeliveryClaim {
  readonly delivery: ConnectorDelivery;
  readonly attempt: ConnectorDeliveryAttempt;
  readonly claimToken: string;
  readonly claimDeadlineAt: number;
}

export interface ConnectorProviderReceipt {
  readonly providerMessageId: string;
  readonly providerConversationId?: string;
  readonly providerThreadId?: string;
  readonly receipt: unknown;
}

export type ConnectorProviderDeliveryResult =
  | { readonly kind: "accepted"; readonly receipt: ConnectorProviderReceipt }
  | { readonly kind: "suppressed"; readonly reason: string }
  | {
      readonly kind: "rejected";
      readonly errorCode: string;
      readonly summary: string;
      readonly retryable: boolean;
    }
  | {
      readonly kind: "uncertain";
      readonly errorCode: string;
      readonly summary: string;
    };

export interface ConnectorAdapterPublicStatus {
  readonly connectorId: string;
  readonly accountId: string;
  readonly state: string;
  readonly healthy: boolean;
  readonly reconnectAttempt: number;
  readonly lastConnectedAt: number | null;
  readonly lastEventAt: number | null;
  readonly lastIngressAt: number | null;
  readonly lastDeliveryAt: number | null;
  readonly lastErrorCode: string | null;
}

export interface ConnectorAdapterDoctorCheck {
  readonly name: string;
  readonly state: "PASSED" | "FAILED" | "NOT_RUN";
  readonly code: string | null;
}

export interface ConnectorAdapterDoctorResult {
  readonly connectorId: string;
  readonly accountId: string;
  readonly ok: boolean;
  readonly checks: readonly ConnectorAdapterDoctorCheck[];
}

export interface OpenRillConnectorAdapter {
  readonly connectorId: string;
  normalizeIngress(claim: ConnectorIngressClaim, signal: AbortSignal): Promise<ConnectorIngressDisposition> | ConnectorIngressDisposition;
  deliver(claim: ConnectorDeliveryClaim, signal: AbortSignal): Promise<ConnectorProviderDeliveryResult> | ConnectorProviderDeliveryResult;
  status?(): ConnectorAdapterPublicStatus;
  doctor?(signal: AbortSignal): Promise<ConnectorAdapterDoctorResult> | ConnectorAdapterDoctorResult;
}

export interface OpenRillConnectorHostPort {
  readonly connectorId: string;
  registerAccount(input: { readonly accountId: string; readonly workspaceId: string; readonly enabled?: boolean }): ConnectorAccount;
  receiveIngress(input: ConnectorIngressAdmission): ConnectorIngressAdmissionResult;
  drainIngress(input: { readonly accountId: string; readonly limit?: number }): Promise<{ readonly processed: number; readonly adopted: number; readonly ignored: number; readonly retried: number; readonly dead: number }>;
  enqueueDelivery(input: ConnectorDeliveryRequest): ConnectorDeliveryEnqueueResult;
  drainDeliveries(input: { readonly accountId: string; readonly limit?: number }): Promise<{ readonly processed: number; readonly delivered: number; readonly suppressed: number; readonly retried: number; readonly uncertain: number; readonly dead: number }>;
}

export interface ConnectorAdapterRegistration {
  readonly extensionId: string;
  readonly adapter: OpenRillConnectorAdapter;
  readonly port: OpenRillConnectorHostPort;
  readonly registeredAt: number;
}

export type ConnectorRunOutputProjection =
  | { readonly kind: "not-connector-run"; readonly runId: string }
  | { readonly kind: "not-deliverable"; readonly runId: string; readonly reason: string }
  | {
      readonly kind: "delivery";
      readonly runId: string;
      readonly connectorId: string;
      readonly accountId: string;
      readonly delivery: ConnectorDelivery;
      readonly replayed: boolean;
    };

export interface ConnectorRunRecoveryResult {
  readonly scanned: number;
  readonly projected: number;
  readonly replayed: number;
  readonly skipped: number;
  readonly deliveries: readonly {
    readonly connectorId: string;
    readonly accountId: string;
    readonly deliveryId: string;
  }[];
}
