import { randomUUID, timingSafeEqual } from "node:crypto";
import type http from "node:http";
import type { Socket } from "node:net";
import {
  OPENRILL_PROTOCOL_MAX,
  OPENRILL_PROTOCOL_MIN,
  type CallFrame,
  type HostStatusPayload,
  type NoticeFrame,
  type RejectedFrame,
  type ResultFrame,
  negotiateProtocol,
  parseJsonFrame,
  validateCallFrame,
  validateOpenFrame,
} from "@openrill/protocol";
import { NoticeWindow } from "./notice-window.js";
import { createDefaultOperationRegistry, type ApprovalOperationHooks, type AutomationOperationHooks, type ControlUiOperationHooks, type ConversationRunHooks, type DelegationOperationHooks, type TaskOperationHooks, type TaskFlowOperationHooks, type GoalExecutionOperationHooks, type ExtensionOperationHooks, type ConnectorOperationHooks, type MaintenanceOperationHooks } from "./operation-registry.js";
import type { ConversationService } from "@openrill/conversations";
import { evaluateProtocolUpgrade } from "./upgrade-policy.js";
import { acceptWebSocketUpgrade, rejectUpgrade, type ServerWebSocketPeer } from "./websocket-codec.js";

export const DEFAULT_HANDSHAKE_TIMEOUT_MS = 3000 as const;
export const MAX_PREAUTH_PAYLOAD_BYTES = 16 * 1024;
export const MAX_AUTHENTICATED_PAYLOAD_BYTES = 64 * 1024;
export const MAX_OUTBOUND_BUFFER_BYTES = 256 * 1024;
export const MAX_IDEMPOTENCY_ENTRIES = 128 as const;

interface CachedResult {
  readonly operation: string;
  readonly inputCanonical: string;
  readonly result: ResultFrame;
}

export interface LocalProtocolServerOptions {
  readonly profileToken: string;
  readonly getStatus: () => HostStatusPayload;
  readonly handshakeTimeoutMs?: number;
  readonly noticeWindowSize?: number;
  readonly now?: () => number;
  readonly conversations?: ConversationService;
  readonly runHooks?: ConversationRunHooks;
  readonly approvalHooks?: ApprovalOperationHooks;
  readonly controlUiHooks?: ControlUiOperationHooks;
  readonly automationHooks?: AutomationOperationHooks;
  readonly delegationHooks?: DelegationOperationHooks;
  readonly taskHooks?: TaskOperationHooks;
  readonly taskFlowHooks?: TaskFlowOperationHooks;
  readonly goalExecutionHooks?: GoalExecutionOperationHooks;
  readonly extensionHooks?: ExtensionOperationHooks;
  readonly connectorHooks?: ConnectorOperationHooks;
  readonly maintenanceHooks?: MaintenanceOperationHooks;
}

export interface LocalProtocolServerHandle {
  readonly publishNotice: (topic: string, data: unknown) => NoticeFrame;
  readonly closeAll: () => void;
  readonly connectionCount: () => number;
}

function tokenMatches(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
function rejected(code: RejectedFrame["code"], message: string, retryable = false): RejectedFrame {
  return { type: "rejected", code, message, retryable };
}
function invalidResult(callId: string, code: "INVALID_FRAME" | "IDEMPOTENCY_CONFLICT", message: string): ResultFrame {
  return { type: "result", callId, ok: false, error: { code, message, retryable: false } };
}

export function attachLocalProtocolServer(server: http.Server, options: LocalProtocolServerOptions): LocalProtocolServerHandle {
  const now = options.now ?? Date.now;
  const notices = new NoticeWindow(options.noticeWindowSize ?? 128, now);
  const peers = new Set<ServerWebSocketPeer>();
  const allPeers = new Set<ServerWebSocketPeer>();

  const broadcast = (notice: NoticeFrame) => {
    for (const peer of peers) {
      if (peer.bufferedBytes > MAX_OUTBOUND_BUFFER_BYTES) { peer.close(1013, "slow consumer"); peers.delete(peer); continue; }
      peer.sendJson(notice);
    }
  };
  const publishNotice = (topic: string, data: unknown) => { const notice = notices.publish(topic, data); broadcast(notice); return notice; };
  const controlUiHooks = options.controlUiHooks ? { ...options.controlUiHooks, snapshot: () => ({ cursor: notices.cursor }) } : undefined;
  const registry = createDefaultOperationRegistry(options.getStatus, options.conversations, publishNotice, options.runHooks, options.approvalHooks, controlUiHooks, options.automationHooks, options.delegationHooks, options.taskHooks, options.taskFlowHooks, options.goalExecutionHooks, options.extensionHooks, options.connectorHooks, options.maintenanceHooks);

  server.on("upgrade", (request, rawSocket, head) => {
    const socket = rawSocket as Socket;
    const policy = evaluateProtocolUpgrade(request, options.getStatus().port);
    if (!policy.accepted) { rejectUpgrade(socket, policy.statusCode, policy.code); return; }

    let peer!: ServerWebSocketPeer;
    let authenticated = false;
    let preauthFrames = 0;
    let preauthBytes = 0;
    let processing = Promise.resolve();
    const cache = new Map<string, CachedResult>();
    const handshakeTimer = setTimeout(() => {
      if (!authenticated) { peer?.sendJson(rejected("INVALID_HANDSHAKE", "handshake timeout")); peer?.close(1008, "handshake timeout"); }
    }, options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS);

    const send = (frame: unknown) => {
      if (peer.bufferedBytes > MAX_OUTBOUND_BUFFER_BYTES) { peer.close(1013, "slow consumer"); peers.delete(peer); return false; }
      return peer.sendJson(frame);
    };
    const failHandshake = (frame: RejectedFrame, closeCode = 1008) => {
      clearTimeout(handshakeTimer); send(frame); queueMicrotask(() => peer.close(closeCode, frame.code.toLowerCase()));
    };
    const handleCall = async (frame: CallFrame) => {
      const inputCanonical = canonical(frame.input);
      const existing = cache.get(frame.idempotencyKey);
      if (existing) {
        if (existing.operation !== frame.operation || existing.inputCanonical !== inputCanonical) {
          send(invalidResult(frame.callId, "IDEMPOTENCY_CONFLICT", "idempotency key was already used with different input")); return;
        }
        send({ ...existing.result, callId: frame.callId, replayed: true }); return;
      }
      const result = await registry.invoke(frame.callId, frame.operation, frame.input);
      cache.set(frame.idempotencyKey, { operation: frame.operation, inputCanonical, result });
      while (cache.size > MAX_IDEMPOTENCY_ENTRIES) cache.delete(cache.keys().next().value as string);
      send(result);
    };
    const handleText = async (text: string, bytes: number) => {
      if (!authenticated) {
        preauthFrames += 1; preauthBytes += bytes;
        if (preauthFrames > 1) return failHandshake(rejected("INVALID_HANDSHAKE", "only one pre-auth frame is allowed"));
        if (preauthBytes > MAX_PREAUTH_PAYLOAD_BYTES) return failHandshake(rejected("INVALID_HANDSHAKE", "pre-auth payload is too large"), 1009);
        const parsed = parseJsonFrame(text);
        if (!parsed.ok) return failHandshake(rejected("INVALID_HANDSHAKE", parsed.error));
        const opened = validateOpenFrame(parsed.value);
        if (!opened.ok) return failHandshake(rejected("INVALID_HANDSHAKE", opened.error));
        const protocol = negotiateProtocol(opened.value.minProtocol, opened.value.maxProtocol, OPENRILL_PROTOCOL_MIN, OPENRILL_PROTOCOL_MAX);
        if (protocol === null) return failHandshake(rejected("PROTOCOL_MISMATCH", "no compatible protocol version"), 1002);
        if (!tokenMatches(opened.value.credential.token, options.profileToken)) return failHandshake(rejected("AUTH_FAILED", "profile authentication failed"));
        authenticated = true; clearTimeout(handshakeTimer); peers.add(peer);
        const replay = notices.replayAfter(opened.value.cursor);
        send({
          type: "accepted", protocol, connectionId: randomUUID(),
          server: { product: "OpenRill", version: options.getStatus().version, profile: options.getStatus().profile, instanceId: options.getStatus().instanceId },
          capabilities: { operations: registry.capabilities(), notices: ["approval.updated", "artifact.created", "automation.job.updated", "automation.run.updated", "connector.recovered", "conversation.updated", "delegation.updated", "extension.discovered", "extension.updated", "host.lifecycle", "process.updated", "run.event", "run.updated"] },
          snapshot: { host: options.getStatus() }, cursor: replay.cursor, resyncRequired: replay.resyncRequired,
        });
        if (!replay.resyncRequired) for (const notice of replay.notices) send(notice);
        return;
      }
      if (bytes > MAX_AUTHENTICATED_PAYLOAD_BYTES) { peer.close(1009, "payload too large"); return; }
      const parsed = parseJsonFrame(text);
      if (!parsed.ok) { send(invalidResult("unknown", "INVALID_FRAME", parsed.error)); return; }
      const call = validateCallFrame(parsed.value);
      if (!call.ok) { send(invalidResult("unknown", "INVALID_FRAME", call.error)); return; }
      await handleCall(call.value);
    };

    const accepted = acceptWebSocketUpgrade(request, socket, head, {
      onText: (text, bytes) => { processing = processing.then(() => handleText(text, bytes)).catch(() => { peer.close(1011, "internal error"); }); },
      onClose: () => { clearTimeout(handshakeTimer); peers.delete(peer); allPeers.delete(peer); },
      onProtocolError: () => { clearTimeout(handshakeTimer); peers.delete(peer); allPeers.delete(peer); },
    });
    if (!accepted) { clearTimeout(handshakeTimer); rejectUpgrade(socket, 400, "UPGRADE_INVALID"); return; }
    peer = accepted;
    allPeers.add(peer);
  });

  return {
    publishNotice,
    closeAll: () => { for (const peer of allPeers) { peer.close(1001, "host stopping"); peer.terminate(); } peers.clear(); allPeers.clear(); },
    connectionCount: () => allPeers.size,
  };
}
