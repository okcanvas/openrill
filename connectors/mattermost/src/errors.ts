export type MattermostErrorCode =
  | "MATTERMOST_CONFIG_INVALID"
  | "MATTERMOST_AUTH_FAILED"
  | "MATTERMOST_API_REJECTED"
  | "MATTERMOST_API_UNAVAILABLE"
  | "MATTERMOST_RESPONSE_INVALID"
  | "MATTERMOST_RESPONSE_TOO_LARGE"
  | "MATTERMOST_INGRESS_INVALID"
  | "MATTERMOST_DELIVERY_INVALID"
  | "MATTERMOST_WEBSOCKET_UNAVAILABLE";

export class MattermostError extends Error {
  public constructor(
    public readonly code: MattermostErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly deliveryCertainty?: "NOT_SENT" | "MAYBE_ACCEPTED" | "REJECTED",
  ) {
    super(message);
    this.name = "MattermostError";
  }
}
