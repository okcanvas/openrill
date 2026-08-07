import type { OpenRillConnectorHostPort } from "@openrill/connectors";

export const MATTERMOST_CONNECTOR_ID = "mattermost" as const;
export const MATTERMOST_PAYLOAD_VERSION = 1 as const;

export interface MattermostConnectorConfig {
  readonly accountId: string;
  readonly workspaceId: string;
  readonly baseUrl: string;
  readonly botToken: string;
  readonly botUserId?: string;
  readonly botUsername?: string;
  readonly requireMention: boolean;
  readonly allowPrivateNetwork: boolean;
  readonly requestTimeoutMs: number;
  readonly reconnectMinMs: number;
  readonly reconnectMaxMs: number;
  readonly pumpIntervalMs: number;
}

export interface MattermostPost {
  readonly id: string;
  readonly user_id: string;
  readonly channel_id: string;
  readonly message: string;
  readonly root_id: string;
  readonly type: string;
  readonly create_at: number;
}

export interface MattermostPostedEvent {
  readonly event: "posted";
  readonly data: {
    readonly post: string | MattermostPost;
    readonly channel_type?: string;
    readonly team_id?: string;
    readonly sender_name?: string;
  };
  readonly broadcast?: {
    readonly channel_id?: string;
    readonly user_id?: string;
    readonly team_id?: string;
  };
}

export interface MattermostUser {
  readonly id: string;
  readonly username: string;
}

export interface MattermostCreatePostResponse {
  readonly id: string;
  readonly channel_id: string;
  readonly root_id?: string;
  readonly create_at?: number;
}

export interface MattermostRuntimeStatus {
  readonly state: "STOPPED" | "STARTING" | "CONNECTED" | "RECONNECT_WAIT" | "STOPPING" | "FAILED";
  readonly accountId: string;
  readonly botUserId: string | null;
  readonly botUsername: string | null;
  readonly websocketUrl: string;
  readonly reconnectAttempt: number;
  readonly lastConnectedAt: number | null;
  readonly lastEventAt: number | null;
  readonly lastIngressAt: number | null;
  readonly lastDeliveryAt: number | null;
  readonly lastErrorCode: string | null;
}

export interface MattermostDoctorCheck {
  readonly name: "configuration" | "authentication" | "websocket" | "account";
  readonly state: "PASSED" | "FAILED" | "NOT_RUN";
  readonly code: string | null;
}

export interface MattermostDoctorResult {
  readonly ok: boolean;
  readonly connectorId: typeof MATTERMOST_CONNECTOR_ID;
  readonly accountId: string;
  readonly checks: readonly MattermostDoctorCheck[];
}

export interface MattermostWebSocketMessageEvent { readonly data: unknown; }
export interface MattermostWebSocketCloseEvent { readonly code?: number; readonly reason?: string; }
export type MattermostWebSocketListener = (event: MattermostWebSocketMessageEvent | MattermostWebSocketCloseEvent | Event) => void;

export interface MattermostWebSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open" | "message" | "error" | "close", listener: MattermostWebSocketListener, options?: { readonly once?: boolean }): void;
  removeEventListener(type: "open" | "message" | "error" | "close", listener: MattermostWebSocketListener): void;
}

export type MattermostWebSocketFactory = (url: string) => MattermostWebSocket;
export type MattermostFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface MattermostRuntimeDependencies {
  readonly port: OpenRillConnectorHostPort;
  readonly fetchImpl?: MattermostFetch;
  readonly websocketFactory?: MattermostWebSocketFactory;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}
