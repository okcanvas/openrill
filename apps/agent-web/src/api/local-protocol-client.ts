import {
  OPENRILL_PROTOCOL_MAX,
  OPENRILL_PROTOCOL_MIN,
  OPENRILL_WEBSOCKET_SUBPROTOCOL,
  type AcceptedFrame,
  type NoticeFrame,
  type RejectedFrame,
  type ResultFrame,
  type ServerProtocolFrame,
  validateServerFrame,
} from "@openrill/protocol";

export interface LocalProtocolClientOptions {
  readonly url: string;
  readonly token: string;
  readonly clientId: string;
  readonly clientVersion: string;
  readonly platform: string;
  readonly cursor?: number;
  readonly createCallId?: () => string;
}

export interface LocalProtocolGap {
  readonly expected: number;
  readonly received: number;
  readonly cursor: number;
}

export type LocalProtocolConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RESYNC_REQUIRED";

export class LocalProtocolClient {
  private socket: WebSocket | null = null;
  private accepted: AcceptedFrame | null = null;
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly noticeListeners = new Set<(notice: NoticeFrame) => void>();
  private readonly gapListeners = new Set<(gap: LocalProtocolGap) => void>();
  private readonly stateListeners = new Set<(state: LocalProtocolConnectionState) => void>();
  private cursor = 0;
  private state: LocalProtocolConnectionState = "DISCONNECTED";

  constructor(private readonly options: LocalProtocolClientOptions) {
    this.cursor = options.cursor ?? 0;
  }

  get currentCursor(): number { return this.cursor; }
  get handshake(): AcceptedFrame | null { return this.accepted; }
  get connectionState(): LocalProtocolConnectionState { return this.state; }

  private setState(state: LocalProtocolConnectionState): void {
    if (state === this.state) return;
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }

  async connect(): Promise<AcceptedFrame> {
    if (this.socket) throw new Error("protocol client is already connected");
    this.setState("CONNECTING");
    return await new Promise<AcceptedFrame>((resolve, reject) => {
      let settled = false;
      const rejectConnect = (error: Error) => {
        if (settled) return;
        settled = true;
        this.setState("DISCONNECTED");
        reject(error);
      };
      const socket = new WebSocket(this.options.url, OPENRILL_WEBSOCKET_SUBPROTOCOL);
      this.socket = socket;
      socket.addEventListener("open", () => socket.send(JSON.stringify({
        type: "open",
        minProtocol: OPENRILL_PROTOCOL_MIN,
        maxProtocol: OPENRILL_PROTOCOL_MAX,
        client: { id: this.options.clientId, version: this.options.clientVersion, platform: this.options.platform, kind: "web" },
        credential: { kind: "profile-token", token: this.options.token },
        ...(this.options.cursor !== undefined ? { cursor: this.options.cursor } : {}),
      })));
      socket.addEventListener("message", (event) => {
        let parsed: unknown;
        try { parsed = JSON.parse(String(event.data)); }
        catch { this.close(); rejectConnect(new Error("invalid protocol JSON")); return; }
        const validated = validateServerFrame(parsed);
        if (!validated.ok) { this.close(); rejectConnect(new Error(validated.error)); return; }
        const frame: ServerProtocolFrame = validated.value;
        if (frame.type === "accepted") {
          this.accepted = frame;
          this.cursor = frame.cursor;
          this.setState(frame.resyncRequired ? "RESYNC_REQUIRED" : "CONNECTED");
          if (!settled) { settled = true; resolve(frame); }
          return;
        }
        if (frame.type === "rejected") {
          this.close();
          rejectConnect(new Error(`${(frame as RejectedFrame).code}: ${(frame as RejectedFrame).message}`));
          return;
        }
        if (frame.type === "notice") {
          if (frame.sequence <= this.cursor) return;
          const expected = this.cursor + 1;
          if (frame.sequence !== expected) {
            this.setState("RESYNC_REQUIRED");
            const gap = { expected, received: frame.sequence, cursor: this.cursor };
            for (const listener of this.gapListeners) listener(gap);
            return;
          }
          this.cursor = frame.sequence;
          for (const listener of this.noticeListeners) listener(frame);
          return;
        }
        if (frame.type === "result") {
          const result = frame as ResultFrame;
          const pending = this.pending.get(result.callId);
          if (!pending) return;
          this.pending.delete(result.callId);
          if (result.ok) pending.resolve(result.output);
          else pending.reject(new Error(`${result.error?.code ?? "INTERNAL_ERROR"}: ${result.error?.message ?? "operation failed"}`));
        }
      });
      socket.addEventListener("error", () => rejectConnect(new Error("local protocol connection failed")), { once: true });
      socket.addEventListener("close", () => {
        for (const pending of this.pending.values()) pending.reject(new Error("local protocol connection closed"));
        this.pending.clear();
        this.socket = null;
        this.accepted = null;
        this.setState("DISCONNECTED");
      });
    });
  }

  call(operation: string, input: unknown, idempotencyKey: string): Promise<unknown> {
    if (!this.socket || !this.accepted || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("protocol client is not connected"));
    }
    const callId = this.options.createCallId?.() ?? crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(callId, { resolve, reject });
      this.socket!.send(JSON.stringify({ type: "call", callId, idempotencyKey, operation, input }));
    });
  }

  onNotice(listener: (notice: NoticeFrame) => void): () => void {
    this.noticeListeners.add(listener);
    return () => this.noticeListeners.delete(listener);
  }
  onGap(listener: (gap: LocalProtocolGap) => void): () => void {
    this.gapListeners.add(listener);
    return () => this.gapListeners.delete(listener);
  }
  onConnectionState(listener: (state: LocalProtocolConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }
  close(): void {
    const socket = this.socket;
    this.socket = null;
    this.accepted = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "client closing");
    this.setState("DISCONNECTED");
  }
}
