import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { OPENRILL_WEBSOCKET_SUBPROTOCOL } from "@openrill/protocol";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_SAFE_PAYLOAD = 1024 * 1024;

export interface WebSocketPeerHandlers {
  readonly onText: (text: string, bytes: number) => void;
  readonly onClose: (code: number, reason: string) => void;
  readonly onProtocolError: (message: string) => void;
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const header: number[] = [0x80 | opcode];
  if (payload.length < 126) header.push(payload.length);
  else if (payload.length <= 0xffff) header.push(126, (payload.length >>> 8) & 0xff, payload.length & 0xff);
  else {
    const length = BigInt(payload.length);
    header.push(127, 0, 0, 0, 0, Number((length >> 24n) & 0xffn), Number((length >> 16n) & 0xffn), Number((length >> 8n) & 0xffn), Number(length & 0xffn));
  }
  return Buffer.concat([Buffer.from(header), payload]);
}

export class ServerWebSocketPeer {
  private buffer = Buffer.alloc(0);
  private closing = false;
  private closed = false;
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });

  constructor(private readonly socket: Socket, head: Buffer, private readonly handlers: WebSocketPeerHandlers) {
    socket.setNoDelay(true);
    socket.on("data", (chunk: Buffer) => this.accept(chunk));
    socket.on("error", () => this.finish(1006, "socket error"));
    socket.on("close", () => this.finish(1006, "socket closed"));
    if (head.length > 0) this.accept(head);
  }

  get bufferedBytes(): number { return this.socket.writableLength; }
  get isClosed(): boolean { return this.closed || this.closing; }

  sendJson(value: unknown): boolean {
    if (this.closed || this.closing) return false;
    return this.socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(value), "utf8")));
  }

  close(code = 1000, reason = ""): void {
    if (this.closed || this.closing) return;
    this.closing = true;
    const reasonBytes = Buffer.from(reason, "utf8").subarray(0, 123);
    const payload = Buffer.alloc(2 + reasonBytes.length);
    payload.writeUInt16BE(code, 0);
    reasonBytes.copy(payload, 2);
    this.socket.write(encodeFrame(0x8, payload), () => this.socket.end());
    const forceClose = setTimeout(() => this.socket.destroy(), 50);
    forceClose.unref();
  }

  terminate(): void {
    if (this.closed && this.socket.destroyed) return;
    this.socket.destroy();
  }

  private finish(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.closing = false;
    this.handlers.onClose(code, reason);
  }

  private fail(message: string, code = 1002): void {
    this.handlers.onProtocolError(message);
    this.close(code, message);
  }

  private accept(chunk: Buffer): void {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (!this.closed) {
      if (this.buffer.length < 2) return;
      const first = this.buffer[0]!;
      const second = this.buffer[1]!;
      const fin = (first & 0x80) !== 0;
      const rsv = first & 0x70;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (!fin || rsv !== 0) return this.fail("fragmented or extended frames are not supported", 1003);
      if (opcode >= 0x8 && length > 125) return this.fail("control frame payload is too large");
      if (!masked) return this.fail("client frames must be masked");
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2); offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const high = this.buffer.readUInt32BE(2);
        const low = this.buffer.readUInt32BE(6);
        if (high !== 0) return this.fail("frame payload is too large", 1009);
        length = low; offset = 10;
      }
      if (length > MAX_SAFE_PAYLOAD) return this.fail("frame payload is too large", 1009);
      const total = offset + 4 + length;
      if (this.buffer.length < total) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buffer.subarray(offset + 4, total));
      this.buffer = this.buffer.subarray(total);
      for (let index = 0; index < payload.length; index += 1) payload[index] = payload[index]! ^ mask[index % 4]!;

      if (opcode === 0x8) {
        if (payload.length === 1) return this.fail("invalid close frame payload");
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
        let reason = "";
        try { reason = payload.length > 2 ? this.decoder.decode(payload.subarray(2)) : ""; } catch { reason = "invalid close reason"; }
        this.close(code, reason); return;
      }
      if (opcode === 0x9) { this.socket.write(encodeFrame(0xA, payload)); continue; }
      if (opcode === 0xA) continue;
      if (opcode !== 0x1) return this.fail("only UTF-8 text frames are supported", 1003);
      try { this.handlers.onText(this.decoder.decode(payload), payload.length); }
      catch { return this.fail("text frame is not valid UTF-8", 1007); }
    }
  }
}

function validWebSocketKey(value: string | undefined): value is string {
  if (!value || !/^[A-Za-z0-9+/]{22}==$/.test(value)) return false;
  try { return Buffer.from(value, "base64").length === 16; } catch { return false; }
}

export function acceptWebSocketUpgrade(request: IncomingMessage, socket: Socket, head: Buffer, handlers: WebSocketPeerHandlers): ServerWebSocketPeer | null {
  const key = typeof request.headers["sec-websocket-key"] === "string" ? request.headers["sec-websocket-key"] : undefined;
  if (!validWebSocketKey(key)) return null;
  const accept = createHash("sha1").update(`${key}${WEBSOCKET_GUID}`).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    `Sec-WebSocket-Protocol: ${OPENRILL_WEBSOCKET_SUBPROTOCOL}`,
    "\r\n",
  ].join("\r\n"));
  return new ServerWebSocketPeer(socket, head, handlers);
}

export function rejectUpgrade(socket: Socket, statusCode: number, code: string): void {
  const reason = statusCode === 404 ? "Not Found" : statusCode === 403 ? "Forbidden" : "Bad Request";
  const body = Buffer.from(`${JSON.stringify({ error: code })}\n`, "utf8");
  socket.end([
    `HTTP/1.1 ${statusCode} ${reason}`,
    "Connection: close",
    "Content-Type: application/json; charset=utf-8",
    `Content-Length: ${body.length}`,
    "\r\n",
  ].join("\r\n") + body.toString("utf8"));
}
