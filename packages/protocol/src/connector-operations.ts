export interface ConnectorAccountListInput {
  readonly connectorId?: string;
}

export type ConnectorIngressStatus = "RECEIVED" | "CLAIMED" | "ADOPTED" | "IGNORED" | "DEAD";
export interface ConnectorIngressListInput {
  readonly connectorId?: string;
  readonly accountId?: string;
  readonly status?: ConnectorIngressStatus;
  readonly limit?: number;
}

export type ConnectorDeliveryStatus = "PENDING" | "DELIVERING" | "DELIVERED" | "SUPPRESSED" | "UNCERTAIN" | "DEAD";
export interface ConnectorDeliveryListInput {
  readonly connectorId?: string;
  readonly accountId?: string;
  readonly status?: ConnectorDeliveryStatus;
  readonly limit?: number;
}

export type ConnectorDeadLetterStatus = "OPEN" | "RESOLVED";
export interface ConnectorDeadLetterListInput {
  readonly connectorId?: string;
  readonly accountId?: string;
  readonly status?: ConnectorDeadLetterStatus;
  readonly limit?: number;
}

export interface ConnectorStatusInput {
  readonly connectorId: string;
}

export interface ConnectorDoctorInput {
  readonly connectorId: string;
}

export interface PublicConnectorStatus {
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

export interface PublicConnectorDoctorCheck {
  readonly name: string;
  readonly state: "PASSED" | "FAILED" | "NOT_RUN";
  readonly code: string | null;
}

export interface PublicConnectorDoctorResult {
  readonly connectorId: string;
  readonly accountId: string;
  readonly ok: boolean;
  readonly checks: readonly PublicConnectorDoctorCheck[];
}
