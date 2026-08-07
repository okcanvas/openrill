export const OPENRILL_PROTOCOL_FAMILY = "openrill.local" as const;
export const OPENRILL_PROTOCOL_MIN = 1 as const;
export const OPENRILL_PROTOCOL_MAX = 1 as const;
export const OPENRILL_WEBSOCKET_PATH = "/protocol" as const;
export const OPENRILL_WEBSOCKET_SUBPROTOCOL = "openrill.local.v1" as const;

export type OpenRillClientKind = "cli" | "web" | "desktop" | "test";

export interface ProtocolClientMetadata {
  readonly id: string;
  readonly version: string;
  readonly platform: string;
  readonly kind: OpenRillClientKind;
  readonly instanceId?: string;
}

export interface OpenFrame {
  readonly type: "open";
  readonly minProtocol: number;
  readonly maxProtocol: number;
  readonly client: ProtocolClientMetadata;
  readonly credential: {
    readonly kind: "profile-token";
    readonly token: string;
  };
  readonly cursor?: number;
}

export interface ProtocolOperationCapability {
  readonly name: string;
  readonly permission: string;
}

export interface AcceptedFrame {
  readonly type: "accepted";
  readonly protocol: number;
  readonly connectionId: string;
  readonly server: {
    readonly product: "OpenRill";
    readonly version: string;
    readonly profile: string;
    readonly instanceId: string;
  };
  readonly capabilities: {
    readonly operations: readonly ProtocolOperationCapability[];
    readonly notices: readonly string[];
  };
  readonly snapshot: unknown;
  readonly cursor: number;
  readonly resyncRequired: boolean;
}

export type ProtocolRejectCode =
  | "INVALID_HANDSHAKE"
  | "PROTOCOL_MISMATCH"
  | "AUTH_FAILED"
  | "RESYNC_REQUIRED";

export interface RejectedFrame {
  readonly type: "rejected";
  readonly code: ProtocolRejectCode;
  readonly message: string;
  readonly retryable: boolean;
}

export interface CallFrame {
  readonly type: "call";
  readonly callId: string;
  readonly idempotencyKey: string;
  readonly operation: string;
  readonly input: unknown;
}

export type ProtocolOperationErrorCode =
  | "INVALID_FRAME"
  | "OPERATION_NOT_FOUND"
  | "INVALID_INPUT"
  | "IDEMPOTENCY_CONFLICT"
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "CONFLICT"
  | "INVALID_STATE";

export interface ProtocolOperationError {
  readonly code: ProtocolOperationErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ResultFrame {
  readonly type: "result";
  readonly callId: string;
  readonly ok: boolean;
  readonly output?: unknown;
  readonly error?: ProtocolOperationError;
  readonly replayed?: boolean;
}

export interface NoticeFrame {
  readonly type: "notice";
  readonly topic: string;
  readonly sequence: number;
  readonly emittedAt: string;
  readonly data: unknown;
}

export type ClientProtocolFrame = OpenFrame | CallFrame;
export type ServerProtocolFrame = AcceptedFrame | RejectedFrame | ResultFrame | NoticeFrame;
export type LocalProtocolFrame = ClientProtocolFrame | ServerProtocolFrame;
