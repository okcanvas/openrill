import type { OpenRillConnectorAdapter, OpenRillConnectorHostPort } from "@openrill/connectors";
import type { OpenRillExtensionModule } from "@openrill/extension-sdk";
import { MattermostConnectorRuntime } from "./runtime.js";

function string(config: Readonly<Record<string, string | number | boolean>>, key: string, fallback?: string): string {
  const value = config[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`Mattermost extension config ${key} is required`);
}

function boolean(config: Readonly<Record<string, string | number | boolean>>, key: string, fallback: boolean): boolean {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}

function integer(config: Readonly<Record<string, string | number | boolean>>, key: string, fallback: number): number {
  const value = config[key];
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

const extension: OpenRillExtensionModule = {
  async activate(context) {
    if (!context.registerConnector) throw new Error("Host connector registry is unavailable");
    const token = await context.resolveSecret("botToken");
    let runtime: MattermostConnectorRuntime | null = null;
    const delegate: OpenRillConnectorAdapter = {
      connectorId: "mattermost",
      normalizeIngress(claim, signal) {
        if (!runtime) return { kind: "ignored", reason: "Mattermost runtime is starting" };
        return runtime.normalizeIngress(claim);
      },
      deliver(claim, signal) {
        if (!runtime) return { kind: "rejected", errorCode: "MATTERMOST_NOT_READY", summary: "Mattermost runtime is starting", retryable: true };
        return runtime.deliver(claim, signal);
      },
      status() {
        if (!runtime) return { connectorId: "mattermost", accountId: string(context.config, "accountId", "main"), state: "STARTING", healthy: false, reconnectAttempt: 0, lastConnectedAt: null, lastEventAt: null, lastIngressAt: null, lastDeliveryAt: null, lastErrorCode: null };
        return runtime.status();
      },
      doctor(signal) {
        if (!runtime) return { connectorId: "mattermost", accountId: string(context.config, "accountId", "main"), ok: false, checks: [{ name: "runtime", state: "NOT_RUN", code: "MATTERMOST_NOT_READY" }] };
        return runtime.doctor(signal);
      },
    };
    const port: OpenRillConnectorHostPort = context.registerConnector(delegate);
    runtime = new MattermostConnectorRuntime({
      accountId: string(context.config, "accountId", "main"),
      workspaceId: string(context.config, "workspaceId"),
      baseUrl: string(context.config, "baseUrl"),
      botToken: token,
      ...(typeof context.config.botUserId === "string" ? { botUserId: context.config.botUserId } : {}),
      ...(typeof context.config.botUsername === "string" ? { botUsername: context.config.botUsername } : {}),
      requireMention: boolean(context.config, "requireMention", true),
      allowPrivateNetwork: boolean(context.config, "allowPrivateNetwork", false),
      requestTimeoutMs: integer(context.config, "requestTimeoutMs", 30_000),
      reconnectMinMs: integer(context.config, "reconnectMinMs", 1_000),
      reconnectMaxMs: integer(context.config, "reconnectMaxMs", 30_000),
      pumpIntervalMs: integer(context.config, "pumpIntervalMs", 250),
    }, { port });
    try {
      await runtime.start();
      return { deactivate: async () => { await runtime?.close(); } };
    } catch (error) {
      await runtime.close().catch(() => undefined);
      throw error;
    }
  },
};

export default extension;
