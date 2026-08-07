import type { OpenRillConfig, OsSecretProvider, OpenRillProfilePaths } from "@openrill/config";
import {
  HostLifecycleError,
  inspectLocalHost,
  readHostMetadata,
  startLocalHost,
  type LocalHostHandle,
  type StartLocalHostOptions,
} from "@openrill/host";
import { LocalCliProtocolClient } from "./local-protocol-client.js";

export type ConversationHostMode = "EPHEMERAL" | "RUNNING_ATTACHED";

export interface ConversationSession {
  readonly mode: ConversationHostMode;
  readonly instanceId: string;
  readonly client: LocalCliProtocolClient;
  readonly close: (reason?: string) => Promise<void>;
}

export interface OpenConversationSessionOptions {
  readonly paths: OpenRillProfilePaths;
  readonly config: OpenRillConfig;
  readonly configRoot: string;
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
  readonly clientVersion: string;
  readonly bind: string;
  readonly osSecretProvider?: OsSecretProvider;
  readonly startHost?: (options: StartLocalHostOptions) => Promise<LocalHostHandle>;
  readonly connectTimeoutMs?: number;
}

async function attach(
  options: OpenConversationSessionOptions,
  ownedHost: LocalHostHandle | null,
  mode: ConversationHostMode,
): Promise<ConversationSession> {
  const metadata = await readHostMetadata(options.paths);
  if (!metadata) {
    await ownedHost?.close("missing-metadata").catch(() => undefined);
    throw new HostLifecycleError("HOST_STARTUP_FAILED", "Host private metadata is unavailable for local protocol attachment");
  }
  if (ownedHost && metadata.instanceId !== ownedHost.status().instanceId) {
    await ownedHost.close("metadata-mismatch").catch(() => undefined);
    throw new HostLifecycleError("HOST_STARTUP_FAILED", "Host private metadata identity did not match the owned Host");
  }
  const client = new LocalCliProtocolClient(metadata, options.clientVersion, options.platform);
  try {
    const accepted = await client.connect(options.connectTimeoutMs ?? 5000);
    if (!accepted.capabilities.operations.some((operation) => operation.name === "conversation.execute")) {
      client.close();
      await ownedHost?.close("protocol-capability-missing").catch(() => undefined);
      throw new HostLifecycleError("HOST_STARTUP_FAILED", "running Host does not support STEP016C conversation.execute; restart it with the current OpenRill version");
    }
  } catch (error) {
    await ownedHost?.close("protocol-connect-failed").catch(() => undefined);
    throw error;
  }
  let closed = false;
  return {
    mode,
    instanceId: metadata.instanceId,
    client,
    close: async (reason = "conversation-session-complete") => {
      if (closed) return;
      closed = true;
      client.close();
      await ownedHost?.close(reason);
    },
  };
}

export async function openConversationSession(options: OpenConversationSessionOptions): Promise<ConversationSession> {
  const inspected = await inspectLocalHost(options.paths, Math.min(options.connectTimeoutMs ?? 5000, 1000));
  if (inspected.running) {
    if (!inspected.status?.readiness) throw new HostLifecycleError("HOST_STARTUP_FAILED", `Host is not READY for profile ${options.paths.profile}`);
    return await attach(options, null, "RUNNING_ATTACHED");
  }
  if (inspected.reason === "UNREACHABLE") {
    throw new HostLifecycleError("HOST_LOCK_UNVERIFIED", `Host metadata or lock is present but unreachable for profile ${options.paths.profile}`);
  }

  const starter = options.startHost ?? startLocalHost;
  try {
    const host = await starter({
      profile: options.paths.profile,
      bind: options.bind,
      port: 0,
      env: options.env,
      config: options.config,
      configRoot: options.configRoot,
      workspaceIds: options.config.workspaces.map((workspace) => workspace.id),
      ...(options.osSecretProvider ? { osSecretProvider: options.osSecretProvider } : {}),
    });
    await host.ready;
    return await attach(options, host, "EPHEMERAL");
  } catch (error) {
    if (error instanceof HostLifecycleError && error.code === "HOST_ALREADY_RUNNING") {
      const raced = await inspectLocalHost(options.paths, Math.min(options.connectTimeoutMs ?? 5000, 1000));
      if (raced.running && raced.status?.readiness) return await attach(options, null, "RUNNING_ATTACHED");
    }
    throw error;
  }
}
