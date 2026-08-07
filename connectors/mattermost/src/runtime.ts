import { ConnectorDeliveryError, type ConnectorAdapterPublicStatus, type OpenRillConnectorAdapter, type ConnectorProviderDeliveryResult } from "@openrill/connectors";
import { MattermostClient } from "./client.js";
import { MattermostError } from "./errors.js";
import { normalizeMattermostIngress, parseMattermostDelivery, parseMattermostPost, parsePostedEvent } from "./normalize.js";
import { assertMattermostNetworkAllowed, mattermostWebSocketUrl } from "./url.js";
import {
  MATTERMOST_CONNECTOR_ID,
  MATTERMOST_PAYLOAD_VERSION,
  type MattermostConnectorConfig,
  type MattermostDoctorResult,
  type MattermostRuntimeDependencies,
  type MattermostRuntimeStatus,
  type MattermostWebSocket,
  type MattermostWebSocketCloseEvent,
  type MattermostWebSocketFactory,
  type MattermostWebSocketMessageEvent,
} from "./types.js";

const WS_OPEN = 1;

function sleepDefault(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason ?? new Error("aborted")); return; }
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason ?? new Error("aborted")); }, { once: true });
  });
}

function defaultWebSocketFactory(url: string): MattermostWebSocket {
  const constructor = (globalThis as unknown as { WebSocket?: new (url: string) => MattermostWebSocket }).WebSocket;
  if (!constructor) throw new MattermostError("MATTERMOST_WEBSOCKET_UNAVAILABLE", "Node WebSocket runtime is unavailable", false);
  return new constructor(url);
}

function isMessageEvent(value: unknown): value is MattermostWebSocketMessageEvent {
  return value !== null && typeof value === "object" && "data" in value;
}

function dataText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(value));
  return null;
}

function boundedInteger(value: number, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new MattermostError("MATTERMOST_CONFIG_INVALID", `${label} is invalid`, false);
  return value;
}

export function validateMattermostConfig(input: MattermostConnectorConfig): MattermostConnectorConfig {
  const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  if (!id.test(input.accountId)) throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost accountId is invalid", false);
  if (!/^[a-z][a-z0-9._-]{0,63}$/.test(input.workspaceId)) throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost workspaceId is invalid", false);
  if (input.botUserId !== undefined && (!input.botUserId || input.botUserId.length > 256)) throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost botUserId is invalid", false);
  if (input.botUsername !== undefined && (!input.botUsername || input.botUsername.length > 128)) throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost botUsername is invalid", false);
  boundedInteger(input.requestTimeoutMs, "Mattermost requestTimeoutMs", 1_000, 120_000);
  boundedInteger(input.reconnectMinMs, "Mattermost reconnectMinMs", 100, 60_000);
  boundedInteger(input.reconnectMaxMs, "Mattermost reconnectMaxMs", input.reconnectMinMs, 300_000);
  boundedInteger(input.pumpIntervalMs, "Mattermost pumpIntervalMs", 50, 60_000);
  return Object.freeze({ ...input });
}

export class MattermostConnectorRuntime implements OpenRillConnectorAdapter {
  public readonly connectorId = MATTERMOST_CONNECTOR_ID;
  #config: MattermostConnectorConfig;
  readonly #port: MattermostRuntimeDependencies["port"];
  readonly #client: MattermostClient;
  readonly #websocketFactory: MattermostWebSocketFactory;
  readonly #now: () => number;
  readonly #sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly #controller = new AbortController();
  #socket: MattermostWebSocket | null = null;
  #connectTask: Promise<void> | null = null;
  readonly #firstConnected: Promise<void>;
  #resolveFirstConnected!: () => void;
  #rejectFirstConnected!: (error: unknown) => void;
  #firstConnectionSettled = false;
  #pumpTimer: NodeJS.Timeout | null = null;
  #ingressPersist: Promise<void> = Promise.resolve();
  #ingressDrain: Promise<void> = Promise.resolve();
  #deliveryDrain: Promise<void> = Promise.resolve();
  #status: MattermostRuntimeStatus;

  public constructor(config: MattermostConnectorConfig, dependencies: MattermostRuntimeDependencies) {
    this.#config = validateMattermostConfig(config);
    this.#port = dependencies.port;
    this.#client = new MattermostClient({
      baseUrl: config.baseUrl,
      token: config.botToken,
      allowPrivateNetwork: config.allowPrivateNetwork,
      timeoutMs: config.requestTimeoutMs,
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    });
    this.#websocketFactory = dependencies.websocketFactory ?? defaultWebSocketFactory;
    this.#now = dependencies.now ?? Date.now;
    this.#sleep = dependencies.sleep ?? sleepDefault;
    this.#firstConnected = new Promise<void>((resolve, reject) => { this.#resolveFirstConnected = resolve; this.#rejectFirstConnected = reject; });
    void this.#firstConnected.catch(() => undefined);
    this.#status = {
      state: "STOPPED", accountId: config.accountId,
      botUserId: config.botUserId ?? null, botUsername: config.botUsername ?? null,
      websocketUrl: mattermostWebSocketUrl(config.baseUrl), reconnectAttempt: 0,
      lastConnectedAt: null, lastEventAt: null, lastIngressAt: null, lastDeliveryAt: null, lastErrorCode: null,
    };
  }

  public status(): ConnectorAdapterPublicStatus {
    return {
      connectorId: MATTERMOST_CONNECTOR_ID,
      accountId: this.#status.accountId,
      state: this.#status.state,
      healthy: this.#status.state === "CONNECTED",
      reconnectAttempt: this.#status.reconnectAttempt,
      lastConnectedAt: this.#status.lastConnectedAt,
      lastEventAt: this.#status.lastEventAt,
      lastIngressAt: this.#status.lastIngressAt,
      lastDeliveryAt: this.#status.lastDeliveryAt,
      lastErrorCode: this.#status.lastErrorCode,
    };
  }

  #setStatus(patch: Partial<MattermostRuntimeStatus>): void { this.#status = { ...this.#status, ...patch }; }

  async #probeWebSocket(signal: AbortSignal): Promise<void> {
    await assertMattermostNetworkAllowed(this.#status.websocketUrl, this.#config.allowPrivateNetwork);
    await new Promise<void>((resolve, reject) => {
      const socket = this.#websocketFactory(this.#status.websocketUrl);
      let settled = false;
      const timer = setTimeout(() => finish(new MattermostError("MATTERMOST_WEBSOCKET_UNAVAILABLE", "Mattermost WebSocket probe timed out", true)), Math.min(this.#config.requestTimeoutMs, 5_000));
      timer.unref();
      const cleanup = () => {
        clearTimeout(timer);
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("close", onClose);
        signal.removeEventListener("abort", onAbort);
      };
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        try { socket.close(1000, "doctor-complete"); } catch { /* best effort */ }
        error ? reject(error) : resolve();
      };
      const onOpen = () => {
        try {
          socket.send(JSON.stringify({ seq: 1, action: "authentication_challenge", data: { token: this.#config.botToken } }));
          finish();
        } catch {
          finish(new MattermostError("MATTERMOST_WEBSOCKET_UNAVAILABLE", "Mattermost WebSocket probe authentication failed", true));
        }
      };
      const onError = () => finish(new MattermostError("MATTERMOST_WEBSOCKET_UNAVAILABLE", "Mattermost WebSocket probe failed", true));
      const onClose = () => { if (!settled) finish(new MattermostError("MATTERMOST_WEBSOCKET_UNAVAILABLE", "Mattermost WebSocket probe closed before authentication", true)); };
      const onAbort = () => finish(signal.reason ?? new MattermostError("MATTERMOST_WEBSOCKET_UNAVAILABLE", "Mattermost WebSocket probe aborted", true));
      socket.addEventListener("open", onOpen);
      socket.addEventListener("error", onError);
      socket.addEventListener("close", onClose);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }

  public async doctor(signal: AbortSignal = new AbortController().signal): Promise<MattermostDoctorResult> {
    const checks: MattermostDoctorResult["checks"][number][] = [
      { name: "configuration", state: "PASSED", code: null },
      { name: "authentication", state: "NOT_RUN", code: null },
      { name: "websocket", state: "NOT_RUN", code: null },
      { name: "account", state: "NOT_RUN", code: null },
    ];
    try {
      const user = await this.#client.getMe(signal);
      checks[1] = { name: "authentication", state: "PASSED", code: null };
      checks[3] = { name: "account", state: "PASSED", code: null };
      await this.#probeWebSocket(signal);
      checks[2] = { name: "websocket", state: "PASSED", code: null };
      void user;
    } catch (error) {
      const code = error instanceof MattermostError ? error.code : "MATTERMOST_API_UNAVAILABLE";
      const index = checks[1]?.state === "NOT_RUN" ? 1 : checks[2]?.state === "NOT_RUN" ? 2 : 3;
      const name = checks[index]?.name ?? "account";
      checks[index] = { name, state: "FAILED", code };
    }
    return { ok: checks.every((check) => check.state === "PASSED"), connectorId: MATTERMOST_CONNECTOR_ID, accountId: this.#config.accountId, checks };
  }

  public async start(): Promise<void> {
    if (this.#connectTask) return this.#firstConnected;
    this.#setStatus({ state: "STARTING", lastErrorCode: null });
    const me = await this.#client.getMe(this.#controller.signal);
    const configuredId = this.#config.botUserId;
    const configuredUsername = this.#config.botUsername;
    if (configuredId && configuredId !== me.id) throw new MattermostError("MATTERMOST_AUTH_FAILED", "Mattermost configured botUserId does not match /users/me", false);
    if (configuredUsername && configuredUsername.toLowerCase() !== me.username.toLowerCase()) throw new MattermostError("MATTERMOST_AUTH_FAILED", "Mattermost configured botUsername does not match /users/me", false);
    this.#config = Object.freeze({ ...this.#config, botUserId: me.id, botUsername: me.username });
    this.#setStatus({ botUserId: me.id, botUsername: me.username });
    this.#port.registerAccount({ accountId: this.#config.accountId, workspaceId: this.#config.workspaceId });
    this.#startPump();
    this.#connectTask = this.#connectLoop().catch((error) => {
      if (!this.#controller.signal.aborted) {
        this.#setStatus({ state: "FAILED", lastErrorCode: error instanceof MattermostError ? error.code : "MATTERMOST_WEBSOCKET_UNAVAILABLE" });
        if (!this.#firstConnectionSettled) { this.#firstConnectionSettled = true; this.#rejectFirstConnected(error); }
      }
    });
    let timer: NodeJS.Timeout | null = null;
    try {
      await Promise.race([
        this.#firstConnected,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new MattermostError("MATTERMOST_WEBSOCKET_UNAVAILABLE", "Mattermost WebSocket did not connect before the startup deadline", true)), Math.min(this.#config.requestTimeoutMs, 8_000));
          timer.unref();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  #startPump(): void {
    if (this.#pumpTimer) return;
    this.#pumpTimer = setInterval(() => { this.#scheduleIngressDrain(); this.#scheduleDeliveryDrain(); }, this.#config.pumpIntervalMs);
    this.#pumpTimer.unref();
  }

  #scheduleIngressDrain(): void {
    this.#ingressDrain = this.#ingressDrain.then(async () => {
      if (this.#controller.signal.aborted) return;
      const result = await this.#port.drainIngress({ accountId: this.#config.accountId, limit: 100 });
      if (result.processed > 0) this.#setStatus({ lastIngressAt: this.#now() });
    }).catch(() => undefined);
  }

  #scheduleDeliveryDrain(): void {
    this.#deliveryDrain = this.#deliveryDrain.then(async () => {
      if (this.#controller.signal.aborted) return;
      const result = await this.#port.drainDeliveries({ accountId: this.#config.accountId, limit: 100 });
      if (result.processed > 0) this.#setStatus({ lastDeliveryAt: this.#now() });
    }).catch(() => undefined);
  }

  async #connectLoop(): Promise<void> {
    let attempt = 0;
    while (!this.#controller.signal.aborted) {
      try {
        await assertMattermostNetworkAllowed(this.#status.websocketUrl, this.#config.allowPrivateNetwork);
        await this.#connectOnce();
        attempt = 0;
      } catch (error) {
        if (this.#controller.signal.aborted) break;
        attempt += 1;
        const code = error instanceof MattermostError ? error.code : "MATTERMOST_WEBSOCKET_UNAVAILABLE";
        const delay = Math.min(this.#config.reconnectMaxMs, this.#config.reconnectMinMs * (2 ** Math.min(attempt - 1, 10)));
        this.#setStatus({ state: "RECONNECT_WAIT", reconnectAttempt: attempt, lastErrorCode: code });
        await this.#sleep(delay, this.#controller.signal).catch(() => undefined);
      }
    }
  }

  #connectOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = this.#websocketFactory(this.#status.websocketUrl);
      this.#socket = socket;
      const cleanup = () => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("close", onClose);
        this.#controller.signal.removeEventListener("abort", onAbort);
        if (this.#socket === socket) this.#socket = null;
      };
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        error ? reject(error) : resolve();
      };
      const onOpen = () => {
        try {
          socket.send(JSON.stringify({ seq: 1, action: "authentication_challenge", data: { token: this.#config.botToken } }));
          this.#setStatus({ state: "CONNECTED", reconnectAttempt: 0, lastConnectedAt: this.#now(), lastErrorCode: null });
          if (!this.#firstConnectionSettled) { this.#firstConnectionSettled = true; this.#resolveFirstConnected(); }
        } catch { finish(new MattermostError("MATTERMOST_WEBSOCKET_UNAVAILABLE", "Mattermost WebSocket authentication challenge failed", true)); }
      };
      const onMessage = (event: Event | MattermostWebSocketMessageEvent | MattermostWebSocketCloseEvent) => {
        if (!isMessageEvent(event)) return;
        const text = dataText(event.data);
        if (!text) return;
        let payload: unknown;
        try { payload = JSON.parse(text); }
        catch { return; }
        this.#setStatus({ lastEventAt: this.#now() });
        const posted = parsePostedEvent(payload);
        if (!posted) return;
        this.#ingressPersist = this.#ingressPersist.then(async () => {
          const post = parseMattermostPost(posted.data.post);
          let lastError: unknown;
          for (let attempt = 1; attempt <= 3; attempt += 1) {
            if (this.#controller.signal.aborted) return;
            try {
              const result = this.#port.receiveIngress({
                accountId: this.#config.accountId,
                externalEventId: post.id,
                laneKey: `${post.channel_id}:${post.root_id || "root"}`,
                payloadVersion: MATTERMOST_PAYLOAD_VERSION,
                payload: posted,
                receivedAt: post.create_at || this.#now(),
              });
              if (result.acknowledge) this.#scheduleIngressDrain();
              return;
            } catch (error) {
              lastError = error;
              if (attempt < 3) await this.#sleep(25 * attempt, this.#controller.signal).catch(() => undefined);
            }
          }
          this.#setStatus({ lastErrorCode: "MATTERMOST_INGRESS_PERSIST_FAILED" });
          try { socket.close(1011, "ingress-persist-failed"); } catch { /* reconnect loop owns recovery */ }
          void lastError;
        }).catch(() => undefined);
      };
      const onError = () => { if (socket.readyState !== WS_OPEN) finish(new MattermostError("MATTERMOST_WEBSOCKET_UNAVAILABLE", "Mattermost WebSocket connection failed", true)); };
      const onClose = (event: Event | MattermostWebSocketMessageEvent | MattermostWebSocketCloseEvent) => {
        const close = event as MattermostWebSocketCloseEvent;
        finish(this.#controller.signal.aborted ? undefined : new MattermostError("MATTERMOST_WEBSOCKET_UNAVAILABLE", `Mattermost WebSocket closed (${close.code ?? 0})`, true));
      };
      const onAbort = () => { try { socket.close(1000, "host-stopping"); } finally { finish(); } };
      socket.addEventListener("open", onOpen);
      socket.addEventListener("message", onMessage);
      socket.addEventListener("error", onError);
      socket.addEventListener("close", onClose);
      this.#controller.signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  public normalizeIngress(claim: Parameters<OpenRillConnectorAdapter["normalizeIngress"]>[0]): ReturnType<OpenRillConnectorAdapter["normalizeIngress"]> {
    return normalizeMattermostIngress(claim, this.#config);
  }

  public async deliver(claim: Parameters<OpenRillConnectorAdapter["deliver"]>[0], signal: AbortSignal): Promise<ConnectorProviderDeliveryResult> {
    try {
      const request = parseMattermostDelivery(claim);
      const response = await this.#client.createPost(request, signal);
      return { kind: "accepted", receipt: {
        providerMessageId: response.id,
        providerConversationId: response.channel_id,
        ...(response.root_id ? { providerThreadId: response.root_id } : {}),
        receipt: { id: response.id, channelId: response.channel_id, rootId: response.root_id ?? "", createAt: response.create_at ?? 0 },
      } };
    } catch (error) {
      if (error instanceof ConnectorDeliveryError) throw error;
      if (error instanceof MattermostError) throw new ConnectorDeliveryError(error.code, error.message, "NOT_SENT", error.retryable);
      throw new ConnectorDeliveryError("MATTERMOST_API_UNAVAILABLE", "Mattermost delivery failed before request dispatch", "NOT_SENT", true);
    }
  }

  public async close(): Promise<void> {
    if (this.#controller.signal.aborted) return;
    this.#setStatus({ state: "STOPPING" });
    this.#controller.abort(new Error("Mattermost connector stopping"));
    if (this.#pumpTimer) clearInterval(this.#pumpTimer);
    this.#pumpTimer = null;
    try { this.#socket?.close(1000, "host-stopping"); } catch { /* best effort */ }
    await Promise.allSettled([this.#connectTask ?? Promise.resolve(), this.#ingressPersist, this.#ingressDrain, this.#deliveryDrain]);
    this.#setStatus({ state: "STOPPED" });
  }
}
