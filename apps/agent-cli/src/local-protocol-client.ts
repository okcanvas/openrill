import { randomUUID } from "node:crypto";
import {
  OPENRILL_PROTOCOL_MAX,
  OPENRILL_PROTOCOL_MIN,
  OPENRILL_WEBSOCKET_SUBPROTOCOL,
  type AcceptedFrame,
  type ResultFrame,
  type ServerProtocolFrame,
  validateServerFrame,
} from "@openrill/protocol";
import type { HostPrivateMetadata } from "@openrill/host";

const MAX_PROTOCOL_FRAME_BYTES = 4 * 1024 * 1024;

export class LocalCliProtocolError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false) {
    super(message);
    this.name = "LocalCliProtocolError";
  }
}

function boundedText(data: unknown): string {
  const text = typeof data === "string" ? data : String(data);
  if (Buffer.byteLength(text, "utf8") > MAX_PROTOCOL_FRAME_BYTES) {
    throw new LocalCliProtocolError("PROTOCOL_FRAME_TOO_LARGE", "local protocol frame exceeded the bounded CLI limit");
  }
  return text;
}

export class LocalCliProtocolClient {
  #socket: WebSocket | null = null;
  #accepted: AcceptedFrame | null = null;
  readonly #pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

  constructor(
    private readonly metadata: HostPrivateMetadata,
    private readonly clientVersion: string,
    private readonly platform: string,
  ) {}

  async connect(timeoutMs = 5000): Promise<AcceptedFrame> {
    if (this.#socket) throw new LocalCliProtocolError("PROTOCOL_ALREADY_CONNECTED", "local protocol client is already connected");
    if (this.metadata.bind !== "127.0.0.1" && this.metadata.bind !== "::1") {
      throw new LocalCliProtocolError("PROTOCOL_REMOTE_HOST_DENIED", `Host metadata bind is not loopback: ${this.metadata.bind}`);
    }
    const deadline = Date.now() + timeoutMs;
    let retryIndex = 0;
    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new LocalCliProtocolError("PROTOCOL_CONNECT_TIMEOUT", `local protocol connection timed out after ${timeoutMs}ms`, true);
      }
      try {
        return await this.#connectOnce(remainingMs);
      } catch (error) {
        const retryableTransportFailure = error instanceof LocalCliProtocolError
          && error.retryable
          && (error.code === "PROTOCOL_CONNECT_FAILED" || error.code === "PROTOCOL_CONNECTION_CLOSED");
        if (!retryableTransportFailure) throw error;
        const delayMs = Math.min(25 * (2 ** Math.min(retryIndex, 3)), 200);
        const remainingDelayMs = deadline - Date.now();
        retryIndex += 1;
        await new Promise<void>((resolve) => setTimeout(resolve, Math.min(delayMs, Math.max(1, remainingDelayMs))));
      }
    }
  }

  async #connectOnce(timeoutMs: number): Promise<AcceptedFrame> {
    return await new Promise<AcceptedFrame>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(
        `ws://${this.metadata.bind === "::1" ? "[::1]" : this.metadata.bind}:${this.metadata.port}/protocol`,
        OPENRILL_WEBSOCKET_SUBPROTOCOL,
      );
      this.#socket = socket;
      const timer = setTimeout(() => fail(new LocalCliProtocolError("PROTOCOL_CONNECT_TIMEOUT", `local protocol connection timed out after ${timeoutMs}ms`, true)), timeoutMs);
      timer.unref();
      const releaseFailedSocket = () => {
        if (this.#socket === socket) {
          this.#socket = null;
          this.#accepted = null;
        }
        try {
          if (socket.readyState < WebSocket.CLOSING) socket.close(1000, "connection attempt failed");
        } catch {
          // The transport may already be closing after a failed TCP/WebSocket attempt.
        }
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        releaseFailedSocket();
        reject(error);
      };
      socket.addEventListener("open", () => socket.send(JSON.stringify({
        type: "open",
        minProtocol: OPENRILL_PROTOCOL_MIN,
        maxProtocol: OPENRILL_PROTOCOL_MAX,
        client: { id: `openrill-cli-${randomUUID()}`, version: this.clientVersion, platform: this.platform, kind: "cli" },
        credential: { kind: "profile-token", token: this.metadata.protocolToken },
      })));
      socket.addEventListener("message", (event) => {
        let frame: ServerProtocolFrame;
        try {
          const validation = validateServerFrame(JSON.parse(boundedText(event.data)));
          if (!validation.ok) throw new LocalCliProtocolError("PROTOCOL_INVALID_FRAME", validation.error);
          frame = validation.value;
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        if (frame.type === "accepted") {
          if (frame.server.instanceId !== this.metadata.instanceId || frame.server.profile !== this.metadata.profile) {
            fail(new LocalCliProtocolError("PROTOCOL_HOST_IDENTITY_MISMATCH", "connected Host identity did not match private metadata"));
            return;
          }
          this.#accepted = frame;
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(frame);
          }
          return;
        }
        if (frame.type === "rejected") {
          fail(new LocalCliProtocolError(frame.code, frame.message, frame.retryable));
          return;
        }
        if (frame.type !== "result") return;
        const pending = this.#pending.get(frame.callId);
        if (!pending) return;
        this.#pending.delete(frame.callId);
        clearTimeout(pending.timer);
        const result = frame as ResultFrame;
        if (result.ok) pending.resolve(result.output);
        else pending.reject(new LocalCliProtocolError(result.error?.code ?? "INTERNAL_ERROR", result.error?.message ?? "operation failed", result.error?.retryable ?? false));
      });
      socket.addEventListener("error", () => fail(new LocalCliProtocolError("PROTOCOL_CONNECT_FAILED", "local protocol connection failed", true)), { once: true });
      socket.addEventListener("close", () => {
        if (!settled) {
          fail(new LocalCliProtocolError("PROTOCOL_CONNECTION_CLOSED", "local protocol connection closed before handshake acceptance", true));
          return;
        }
        if (this.#socket !== socket) return;
        for (const pending of this.#pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(new LocalCliProtocolError("PROTOCOL_CONNECTION_CLOSED", "local protocol connection closed", true));
        }
        this.#pending.clear();
        this.#socket = null;
        this.#accepted = null;
      });
    });
  }

  call<T>(operation: string, input: unknown, timeoutMs: number, idempotencyKey = `cli:${randomUUID()}`): Promise<T> {
    const socket = this.#socket;
    if (!socket || !this.#accepted || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new LocalCliProtocolError("PROTOCOL_NOT_CONNECTED", "local protocol client is not connected"));
    }
    const callId = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(callId);
        reject(new LocalCliProtocolError("PROTOCOL_CALL_TIMEOUT", `${operation} timed out after ${timeoutMs}ms`, true));
      }, timeoutMs);
      timer.unref();
      this.#pending.set(callId, { resolve: (value) => resolve(value as T), reject, timer });
      socket.send(JSON.stringify({ type: "call", callId, idempotencyKey, operation, input }));
    });
  }

  close(): void {
    const socket = this.#socket;
    this.#socket = null;
    this.#accepted = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "CLI complete");
  }
}
