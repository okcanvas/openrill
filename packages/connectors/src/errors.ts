export type ConnectorErrorCode =
  | "CONNECTOR_INVALID_ARGUMENT"
  | "CONNECTOR_NOT_REGISTERED"
  | "CONNECTOR_ALREADY_REGISTERED"
  | "CONNECTOR_ACCOUNT_NOT_FOUND"
  | "CONNECTOR_ACCOUNT_DISABLED"
  | "CONNECTOR_WORKSPACE_ACCESS_DENIED"
  | "CONNECTOR_BINDING_CONFLICT"
  | "CONNECTOR_INGRESS_NOT_FOUND"
  | "CONNECTOR_INGRESS_CONFLICT"
  | "CONNECTOR_INGRESS_STATE_INVALID"
  | "CONNECTOR_INGRESS_CLAIM_LOST"
  | "CONNECTOR_DELIVERY_NOT_FOUND"
  | "CONNECTOR_DELIVERY_CONFLICT"
  | "CONNECTOR_DELIVERY_STATE_INVALID"
  | "CONNECTOR_DELIVERY_CLAIM_LOST"
  | "CONNECTOR_RECEIPT_CONFLICT";

export class ConnectorError extends Error {
  public constructor(public readonly code: ConnectorErrorCode, message: string) {
    super(message);
    this.name = "ConnectorError";
  }
}

export type ConnectorDeliveryCertainty = "NOT_SENT" | "REJECTED" | "MAYBE_ACCEPTED";

export class ConnectorDeliveryError extends Error {
  public constructor(
    public readonly errorCode: string,
    message: string,
    public readonly certainty: ConnectorDeliveryCertainty,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ConnectorDeliveryError";
  }
}

export class ConnectorIngressError extends Error {
  public constructor(
    public readonly errorCode: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ConnectorIngressError";
  }
}
