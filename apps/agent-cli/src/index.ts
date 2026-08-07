import {
  ConfigRevisionConflictError,
  InvalidProfileNameError,
  createMinimalConfigSource,
  loadOpenRillConfig,
  resolveConfigPaths,
  resolveProfilePaths,
  writeOpenRillConfig,
  OPENRILL_DEFAULT_HOST_BIND,
  OPENRILL_DEFAULT_HOST_PORT,
  type OsSecretProvider,
} from "@openrill/config";
import type { DockerExecutionBackendOptions } from "@openrill/sandbox-docker";
import type { LocalHostHandle, StartLocalHostOptions } from "@openrill/host";
import type { ConversationExecuteOutput } from "@openrill/protocol";
import { randomUUID } from "node:crypto";
import { openConversationSession, type ConversationSession } from "./conversation-session.js";
import { runDoctorCommand, runSetupCommand } from "./operational.js";
import { runSkillCommand, type SkillCommandAction } from "./skill-operations.js";

export const PACKAGE_NAME = "@openrill/cli" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;

export interface CliIo {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

export interface CliRuntime {
  readonly env: NodeJS.ProcessEnv;
  readonly onSignal: (signal: "SIGINT" | "SIGTERM", listener: () => void) => void;
  readonly offSignal: (signal: "SIGINT" | "SIGTERM", listener: () => void) => void;
  readonly cwd?: () => string;
  readonly platform?: NodeJS.Platform;
  readonly readStdin?: () => Promise<string>;
  readonly osSecretProvider?: OsSecretProvider;
  readonly dockerDoctor?: (options: DockerExecutionBackendOptions) => Promise<{ readonly available: boolean; readonly detail: string }>;
  readonly startHost?: (options: StartLocalHostOptions) => Promise<LocalHostHandle>;
}

async function readProcessStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

const defaultRuntime: CliRuntime = {
  env: process.env,
  onSignal: (signal, listener) => process.on(signal, listener),
  offSignal: (signal, listener) => process.off(signal, listener),
  cwd: () => process.cwd(),
  platform: process.platform,
  readStdin: readProcessStdin,
};

type LifecycleCommand = "help" | "version" | "start" | "run" | "status" | "stop";
type ConfigAction = "path" | "validate" | "show" | "init";
type ConversationAction = "list" | "show";
type CliCommand = LifecycleCommand | "config" | "setup" | "doctor" | "ask" | "conversation" | "skill";

export interface ParsedOptions {
  readonly command: CliCommand;
  readonly configAction: ConfigAction | null;
  readonly conversationAction: ConversationAction | null;
  readonly skillAction: SkillCommandAction | null;
  readonly skillId: string | null;
  readonly conversationId: string | null;
  readonly conversationLimit: number;
  readonly providerExplicit: boolean;
  readonly profile: string;
  readonly bind: string;
  readonly bindExplicit: boolean;
  readonly port: number;
  readonly portExplicit: boolean;
  readonly force: boolean;
  readonly json: boolean;
  readonly timeoutMs: number;
  readonly workspacePath: string | null;
  readonly workspaceId: string;
  readonly workspaceReadOnly: boolean;
  readonly provider: string;
  readonly endpoint: string | null;
  readonly model: string | null;
  readonly secretKey: string;
  readonly apiKeyStdin: boolean;
  readonly backend: "host" | "docker";
  readonly fallback: "deny" | "host";
  readonly mountMode: "readOnly" | "readWrite";
  readonly networkMode: "none" | "outbound";
  readonly dockerImage: string | null;
}

class CliUsageError extends Error {}

function readValue(args: readonly string[], index: number, name: string): [string, number] {
  const current = args[index];
  const equals = current?.indexOf("=") ?? -1;
  if (equals >= 0) {
    const value = current!.slice(equals + 1);
    if (!value) throw new CliUsageError(`${name} requires a value`);
    return [value, index];
  }
  const next = args[index + 1];
  if (!next || next.startsWith("--")) throw new CliUsageError(`${name} requires a value`);
  return [next, index + 1];
}

function parseInteger(raw: string, name: string, min: number, max: number): number {
  if (!/^\d+$/.test(raw)) throw new CliUsageError(`${name} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new CliUsageError(`${name} must be between ${min} and ${max}`);
  return value;
}

function parseEnum<T extends string>(raw: string, name: string, allowed: readonly T[]): T {
  if (!allowed.includes(raw as T)) throw new CliUsageError(`${name} must be one of: ${allowed.join(", ")}`);
  return raw as T;
}

export function parseCliOptions(args: readonly string[]): ParsedOptions {
  const first = args[0];
  let command: CliCommand | null;
  let configAction: ConfigAction | null = null;
  let conversationAction: ConversationAction | null = null;
  let skillAction: SkillCommandAction | null = null;
  let skillId: string | null = null;
  let conversationId: string | null = null;
  let optionStart = 1;
  if (first === undefined || first === "help" || first === "--help" || first === "-h") command = "help";
  else if (first === "version" || first === "--version" || first === "-v") command = "version";
  else if (first === "start" || first === "run" || first === "status" || first === "stop" || first === "setup" || first === "doctor" || first === "ask") command = first;
  else if (first === "conversation") {
    command = "conversation";
    const action = args[1];
    if (action !== "list" && action !== "show") throw new CliUsageError("conversation requires one of: list, show");
    conversationAction = action;
    if (action === "show") {
      const id = args[2];
      if (!id || id.startsWith("--")) throw new CliUsageError("conversation show requires a conversation id");
      conversationId = id;
      optionStart = 3;
    } else optionStart = 2;
  }
  else if (first === "skill") {
    command = "skill";
    const action = args[1];
    if (action !== "list" && action !== "show" && action !== "check" && action !== "enable" && action !== "disable") {
      throw new CliUsageError("skill requires one of: list, show, check, enable, disable");
    }
    skillAction = action;
    if (action === "show" || action === "enable" || action === "disable") {
      const id = args[2];
      if (!id || id.startsWith("--")) throw new CliUsageError(`skill ${action} requires a Skill id`);
      skillId = id;
      optionStart = 3;
    } else optionStart = 2;
  }
  else if (first === "config") {
    command = "config";
    const action = args[1];
    if (action !== "path" && action !== "validate" && action !== "show" && action !== "init") {
      throw new CliUsageError("config requires one of: path, validate, show, init");
    }
    configAction = action;
    optionStart = 2;
  } else command = null;
  if (!command) throw new CliUsageError(`unknown command: ${first}`);

  let profile = "default";
  let bind: string = OPENRILL_DEFAULT_HOST_BIND;
  let bindExplicit = false;
  let port: number = OPENRILL_DEFAULT_HOST_PORT;
  let portExplicit = false;
  let force = false;
  let json = false;
  let timeoutMs = command === "ask" ? 120_000 : 5000;
  let workspacePath: string | null = null;
  let workspaceId = "default";
  let workspaceReadOnly = false;
  let provider = "default";
  let providerExplicit = false;
  let conversationLimit = 20;
  let endpoint: string | null = null;
  let model: string | null = null;
  let secretKey = "model.default.api-key";
  let apiKeyStdin = false;
  let backend: "host" | "docker" = "host";
  let fallback: "deny" | "host" = "deny";
  let mountMode: "readOnly" | "readWrite" = "readWrite";
  let networkMode: "none" | "outbound" = "none";
  let dockerImage: string | null = null;

  for (let i = optionStart; i < args.length; i += 1) {
    const token = args[i]!;
    if (token === "--force") { force = true; continue; }
    if (token === "--json") { json = true; continue; }
    if (token === "--read-only") { workspaceReadOnly = true; continue; }
    if (token === "--api-key-stdin") { apiKeyStdin = true; continue; }
    if (token === "--profile" || token.startsWith("--profile=")) { const [v, n] = readValue(args, i, "--profile"); profile = v; i = n; continue; }
    if (token === "--bind" || token.startsWith("--bind=")) { const [v, n] = readValue(args, i, "--bind"); bind = v; bindExplicit = true; i = n; continue; }
    if (token === "--port" || token.startsWith("--port=")) { const [v, n] = readValue(args, i, "--port"); port = parseInteger(v, "--port", 0, 65535); portExplicit = true; i = n; continue; }
    if (token === "--timeout-ms" || token.startsWith("--timeout-ms=")) { const [v, n] = readValue(args, i, "--timeout-ms"); timeoutMs = parseInteger(v, "--timeout-ms", 100, 900000); i = n; continue; }
    if (token === "--workspace" || token.startsWith("--workspace=")) { const [v, n] = readValue(args, i, "--workspace"); workspacePath = v; i = n; continue; }
    if (token === "--workspace-id" || token.startsWith("--workspace-id=")) { const [v, n] = readValue(args, i, "--workspace-id"); workspaceId = v; i = n; continue; }
    if (token === "--provider" || token.startsWith("--provider=")) { const [v, n] = readValue(args, i, "--provider"); provider = v; providerExplicit = true; i = n; continue; }
    if (token === "--conversation-id" || token.startsWith("--conversation-id=")) { const [v, n] = readValue(args, i, "--conversation-id"); conversationId = v; i = n; continue; }
    if (token === "--limit" || token.startsWith("--limit=")) { const [v, n] = readValue(args, i, "--limit"); conversationLimit = parseInteger(v, "--limit", 1, 100); i = n; continue; }
    if (token === "--endpoint" || token.startsWith("--endpoint=")) { const [v, n] = readValue(args, i, "--endpoint"); endpoint = v; i = n; continue; }
    if (token === "--model" || token.startsWith("--model=")) { const [v, n] = readValue(args, i, "--model"); model = v; i = n; continue; }
    if (token === "--secret-key" || token.startsWith("--secret-key=")) { const [v, n] = readValue(args, i, "--secret-key"); secretKey = v; i = n; continue; }
    if (token === "--backend" || token.startsWith("--backend=")) { const [v, n] = readValue(args, i, "--backend"); backend = parseEnum(v, "--backend", ["host", "docker"] as const); i = n; continue; }
    if (token === "--fallback" || token.startsWith("--fallback=")) { const [v, n] = readValue(args, i, "--fallback"); fallback = parseEnum(v, "--fallback", ["deny", "host"] as const); i = n; continue; }
    if (token === "--mount-mode" || token.startsWith("--mount-mode=")) { const [v, n] = readValue(args, i, "--mount-mode"); mountMode = parseEnum(v, "--mount-mode", ["readOnly", "readWrite"] as const); i = n; continue; }
    if (token === "--network-mode" || token.startsWith("--network-mode=")) { const [v, n] = readValue(args, i, "--network-mode"); networkMode = parseEnum(v, "--network-mode", ["none", "outbound"] as const); i = n; continue; }
    if (token === "--docker-image" || token.startsWith("--docker-image=")) { const [v, n] = readValue(args, i, "--docker-image"); dockerImage = v; i = n; continue; }
    throw new CliUsageError(`unknown option: ${token}`);
  }

  const selectorOptionsUsed = workspaceId !== "default" || provider !== "default" || conversationId !== null || conversationLimit !== 20;
  const setupMutationOptionsUsed = workspacePath !== null || workspaceReadOnly || endpoint !== null || model !== null || secretKey !== "model.default.api-key" || apiKeyStdin || backend !== "host" || fallback !== "deny" || mountMode !== "readWrite" || networkMode !== "none" || dockerImage !== null;
  const allSetupOptionsUsed = selectorOptionsUsed || setupMutationOptionsUsed;
  if ((command === "help" || command === "version") && args.length > 1) throw new CliUsageError(`${command} does not accept options`);
  if ((command === "status" || command === "stop") && (bindExplicit || portExplicit || force || allSetupOptionsUsed)) {
    throw new CliUsageError(`${command} accepts only --profile, --json${command === "stop" ? ", and --timeout-ms" : ""}`);
  }
  if (command === "config" && (bindExplicit || portExplicit || force || timeoutMs !== 5000 || allSetupOptionsUsed)) {
    throw new CliUsageError("config commands accept only --profile and --json");
  }
  if (command === "doctor" && (bindExplicit || portExplicit || force || timeoutMs !== 5000 || allSetupOptionsUsed)) {
    throw new CliUsageError("doctor accepts only --profile and --json");
  }
  if (command === "setup" && (bindExplicit || portExplicit || timeoutMs !== 5000)) {
    throw new CliUsageError("setup does not accept --bind, --port, or --timeout-ms");
  }
  if (command === "ask" && (bindExplicit || portExplicit || force || setupMutationOptionsUsed || conversationLimit !== 20)) {
    throw new CliUsageError("ask accepts only --profile, --workspace-id, --provider, --conversation-id, --timeout-ms, and --json");
  }
  if (command === "ask" && conversationId !== null && providerExplicit) {
    throw new CliUsageError("ask --conversation-id uses the Conversation model profile and does not accept --provider");
  }
  if (command === "conversation" && (bindExplicit || portExplicit || force || setupMutationOptionsUsed || providerExplicit || apiKeyStdin)) {
    throw new CliUsageError("conversation commands accept only --profile, --workspace-id, --limit, --timeout-ms, and --json");
  }
  if (command === "conversation" && conversationAction === "show" && conversationLimit !== 20) {
    throw new CliUsageError("conversation show does not accept --limit");
  }
  if (command === "skill" && (bindExplicit || portExplicit || force || setupMutationOptionsUsed || providerExplicit || apiKeyStdin || conversationId !== null || conversationLimit !== 20 || timeoutMs !== 5000)) {
    throw new CliUsageError("skill commands accept only --profile, --workspace-id, and --json");
  }
  if ((command === "start" || command === "run") && allSetupOptionsUsed) {
    throw new CliUsageError(`${command} does not accept setup options`);
  }

  return {
    command, configAction, conversationAction, skillAction, skillId, conversationId, conversationLimit, providerExplicit, profile, bind, bindExplicit, port, portExplicit, force, json, timeoutMs,
    workspacePath, workspaceId, workspaceReadOnly, provider, endpoint, model, secretKey, apiKeyStdin,
    backend, fallback, mountMode, networkMode, dockerImage,
  };
}

function helpText(): string {
  return [
    "OpenRill local autonomous agent",
    "",
    "Usage: openrill <command> [options]",
    "",
    "Commands:",
    "  setup      Configure one local workspace, model profile, OS-protected API key, and execution backend",
    "  doctor     Verify config, OS secret, workspace, and Host/Docker readiness",
    "  ask        Read one prompt from stdin, create or continue a durable Conversation, and print the result",
    "  conversation list       List durable Conversations in one workspace",
    "  conversation show <id>  Show one durable Conversation and its message/run history",
    "  skill list|check         Discover Skills and report eligibility/diagnostics",
    "  skill show <id>          Show one resolved Skill and required tools",
    "  skill enable|disable <id> Atomically update the profile Skill allowlist",
    "  start      Start the foreground local Host",
    "  run        Alias for start",
    "  status     Query the profile Host through the local control endpoint",
    "  stop       Request graceful Host shutdown",
    "  config path       Show profile config and snapshot paths",
    "  config validate   Parse, include-resolve, validate, and snapshot config",
    "  config show       Show the redacted materialized config",
    "  config init       Atomically create the minimal agent.yaml",
    "  help       Show this help",
    "  version    Show the packaged version",
    "",
    "Setup options:",
    "  --workspace <path>       Workspace directory (default: current directory)",
    "  --workspace-id <id>      Workspace id (default: default)",
    "  --read-only              Register the workspace read-only",
    "  --provider <id>          Model profile id for a new Conversation (default: default)",
    "  --endpoint <url>         OpenAI-compatible Responses endpoint (required)",
    "  --model <id>             Model id (required)",
    "  --secret-key <key>       OS secret key (default: model.default.api-key)",
    "  --api-key-stdin          Read one API-key line from stdin instead of secure interactive prompt",
    "  --backend host|docker    Process execution backend (default: host)",
    "  --docker-image <digest>  Digest-pinned image required for Docker",
    "  --fallback deny|host     Docker-unavailable behavior (default: deny)",
    "  --mount-mode <mode>      readOnly or readWrite (default: readWrite)",
    "  --network-mode <mode>    none or outbound (default: none)",
    "  --force                  Replace an existing profile config",
    "",
    "Common options:",
    "  --profile <name>      Profile name (default: default)",
    `  --bind <address>      Loopback bind override for start/run (default config: ${OPENRILL_DEFAULT_HOST_BIND})`,
    `  --port <port>         Port override for start/run; 0 selects an ephemeral port (default config: ${OPENRILL_DEFAULT_HOST_PORT})`,
    "  --conversation-id <id> Continue an existing Conversation with ask",
    "  --limit <n>            Conversation list limit, 1..100 (default: 20)",
    "  --json                Emit machine-readable JSON",
    "  --timeout-ms <ms>     Stop timeout; ask defaults to 120000",
    "",
    "STEP016C attaches to a READY running Host when present; otherwise it owns one ephemeral Host.",
    "Only an ephemeral Host started by the CLI is stopped when the command completes.",
    "Prompt text is read from stdin and is not accepted as a command-line argument.",
    "Secrets are never accepted as command-line arguments and config output remains redacted.",
  ].join("\n");
}

function writeJson(io: CliIo, value: unknown): void { io.stdout(JSON.stringify(value)); }

export async function runCli(args: readonly string[], io: CliIo, runtime: CliRuntime = defaultRuntime): Promise<number> {
  let options: ParsedOptions;
  try { options = parseCliOptions(args); }
  catch (error) { io.stderr(`openrill: ${error instanceof Error ? error.message : String(error)}`); return 2; }

  if (options.command === "version") { io.stdout(`OpenRill ${PACKAGE_VERSION}`); return 0; }
  if (options.command === "help") { io.stdout(helpText()); return 0; }

  const platform = runtime.platform ?? process.platform;
  const cwd = runtime.cwd ?? (() => process.cwd());
  const readStdin = runtime.readStdin ?? readProcessStdin;
  let paths;
  try { paths = resolveProfilePaths({ profile: options.profile, env: runtime.env, platform }); }
  catch (error) {
    io.stderr(`openrill: ${error instanceof InvalidProfileNameError ? error.message : String(error)}`);
    return 10;
  }
  const configPaths = resolveConfigPaths(paths, { platform });

  if (options.command === "setup") {
    return await runSetupCommand(options, configPaths, paths.configRoot, io, {
      env: runtime.env,
      cwd,
      platform,
      readStdin,
      ...(runtime.osSecretProvider ? { osSecretProvider: runtime.osSecretProvider } : {}),
      ...(runtime.dockerDoctor ? { dockerDoctor: runtime.dockerDoctor } : {}),
    });
  }

  if (options.command === "skill") {
    return await runSkillCommand({
      action: options.skillAction!,
      skillId: options.skillId,
      workspaceId: options.workspaceId,
      json: options.json,
    }, configPaths, paths.configRoot, io, {
      env: runtime.env,
      platform,
      ...(runtime.osSecretProvider ? { osSecretProvider: runtime.osSecretProvider } : {}),
    });
  }

  if (options.command === "doctor") {
    return await runDoctorCommand(options, configPaths, paths.configRoot, io, {
      env: runtime.env,
      cwd,
      platform,
      readStdin,
      ...(runtime.osSecretProvider ? { osSecretProvider: runtime.osSecretProvider } : {}),
      ...(runtime.dockerDoctor ? { dockerDoctor: runtime.dockerDoctor } : {}),
    });
  }

  if (options.command === "config") {
    try {
      if (options.configAction === "path") {
        if (options.json) writeJson(io, configPaths);
        else io.stdout(`source=${configPaths.sourcePath}\nmaterialized=${configPaths.materializedPath}\nlastKnownGood=${configPaths.lastKnownGoodPath}\njournal=${configPaths.journalDir}`);
        return 0;
      }
      if (options.configAction === "init") {
        const result = await writeOpenRillConfig({
          paths: configPaths,
          source: createMinimalConfigSource(),
          expectedRevision: null,
          env: runtime.env,
          platform,
          ...(runtime.osSecretProvider ? { osSecretProvider: runtime.osSecretProvider } : {}),
        });
        if (options.json) writeJson(io, { sourcePath: result.sourcePath, sourceRevision: result.sourceRevision, materializedRevision: result.materializedRevision });
        else io.stdout(`OpenRill config initialized: ${result.sourcePath}`);
        return 0;
      }
      const result = await loadOpenRillConfig({
        paths: configPaths,
        env: runtime.env,
        platform,
        ...(runtime.osSecretProvider ? { osSecretProvider: runtime.osSecretProvider } : {}),
      });
      if (options.configAction === "show") {
        if (options.json) writeJson(io, { sourcePath: result.sourcePath, sourceExists: result.sourceExists, sourceRevision: result.sourceRevision, materializedRevision: result.materializedRevision, sourceFiles: result.sourceFiles, warnings: result.warnings, issues: result.issues, recovery: result.recovery, loadedAt: result.loadedAt, redactedConfig: result.redactedConfig, secretStatuses: result.secretStatuses.map((status) => ({ path: status.path, kind: status.reference.kind, available: status.available, reason: status.reason })) });
        else io.stdout(JSON.stringify(result.redactedConfig, null, 2));
      } else if (options.json) {
        writeJson(io, {
          valid: true,
          recovery: result.recovery,
          sourceRevision: result.sourceRevision,
          materializedRevision: result.materializedRevision,
          warnings: result.warnings,
          secretStatuses: result.secretStatuses,
        });
      } else {
        io.stdout(`OpenRill config valid recovery=${result.recovery} sourceRevision=${result.sourceRevision ?? "<missing>"} materializedRevision=${result.materializedRevision}`);
        for (const warning of result.warnings) io.stderr(`openrill config warning: ${warning}`);
      }
      return 0;
    } catch (error) {
      if (error instanceof ConfigRevisionConflictError && options.configAction === "init") {
        io.stderr(`openrill: config source already exists: ${configPaths.sourcePath}`);
        return 21;
      }
      io.stderr(`openrill: ${error instanceof Error ? error.message : String(error)}`);
      return 20;
    }
  }

  if (options.command === "status") {
    const { inspectLocalHost } = await import("@openrill/host/control");
    const result = await inspectLocalHost(paths);
    if (options.json) writeJson(io, result);
    else if (result.running && result.status) io.stdout(`OpenRill Host ${result.status.state} profile=${result.status.profile} pid=${result.status.pid} bind=${result.status.bind} port=${result.status.port} instanceId=${result.status.instanceId}`);
    else io.stdout(`OpenRill Host ${result.reason} profile=${paths.profile}`);
    return result.running ? 0 : result.reason === "UNREACHABLE" ? 4 : 3;
  }

  if (options.command === "stop") {
    const { stopLocalHost } = await import("@openrill/host/control");
    const result = await stopLocalHost(paths, options.timeoutMs);
    if (options.json) writeJson(io, result);
    else io.stdout(`OpenRill Host ${result.reason} profile=${paths.profile}`);
    return result.stopped ? 0 : 4;
  }

  let loadedConfig;
  try {
    loadedConfig = await loadOpenRillConfig({
      paths: configPaths,
      env: runtime.env,
      platform,
      ...(runtime.osSecretProvider ? { osSecretProvider: runtime.osSecretProvider } : {}),
    });
  } catch (error) {
    io.stderr(`openrill: config startup validation failed: ${error instanceof Error ? error.message : String(error)}`);
    return 20;
  }
  const bind = options.bindExplicit ? options.bind : loadedConfig.config.host.bind;
  const port = options.portExplicit ? options.port : loadedConfig.config.host.port;
  if (bind !== "127.0.0.1" && bind !== "::1") {
    io.stderr(`openrill: Host bind must be loopback: ${bind}`);
    return 12;
  }

  if (options.command === "ask" || options.command === "conversation") {
    let prompt = "";
    if (options.command === "ask") {
      prompt = (await readStdin()).trim();
      if (!prompt) {
        io.stderr("openrill: ask requires a non-empty prompt on stdin");
        return 2;
      }
    }
    if (!loadedConfig.config.workspaces.some((workspace) => workspace.id === options.workspaceId)) {
      io.stderr(`openrill: workspace is not configured: ${options.workspaceId}`);
      return 22;
    }
    if (options.command === "ask" && options.conversationId === null && !loadedConfig.config.modelProviders[options.provider]) {
      io.stderr(`openrill: model provider is not configured: ${options.provider}`);
      return 22;
    }

    let session: ConversationSession | null = null;
    let signalAccepted = false;
    const onSignal = () => {
      if (signalAccepted) return;
      signalAccepted = true;
      if (session) void session.close("signal");
    };
    runtime.onSignal("SIGINT", onSignal);
    runtime.onSignal("SIGTERM", onSignal);
    try {
      session = await openConversationSession({
        paths,
        config: loadedConfig.config,
        configRoot: paths.configRoot,
        env: runtime.env,
        platform,
        clientVersion: PACKAGE_VERSION,
        bind,
        ...(runtime.osSecretProvider ? { osSecretProvider: runtime.osSecretProvider } : {}),
        ...(runtime.startHost ? { startHost: runtime.startHost } : {}),
        connectTimeoutMs: Math.min(options.timeoutMs, 10_000),
      });

      if (options.command === "conversation") {
        if (options.conversationAction === "list") {
          const output = await session.client.call<{ readonly items: readonly unknown[] }>(
            "conversation.list",
            { workspaceId: options.workspaceId, limit: options.conversationLimit },
            options.timeoutMs,
          );
          const payload = { profile: paths.profile, workspaceId: options.workspaceId, hostMode: session.mode, items: output.items };
          if (options.json) writeJson(io, payload);
          else if (output.items.length === 0) io.stdout(`No OpenRill Conversations workspace=${options.workspaceId}`);
          else for (const item of output.items as readonly Record<string, unknown>[]) io.stdout(`${item.conversationId} ${item.status} messages=${(item.projection as Record<string, unknown>)?.messageCount ?? 0} ${item.title ?? ""}`.trim());
          return 0;
        }
        const output = await session.client.call<Record<string, unknown>>(
          "conversation.get",
          { workspaceId: options.workspaceId, conversationId: options.conversationId },
          options.timeoutMs,
        );
        const payload = { profile: paths.profile, workspaceId: options.workspaceId, hostMode: session.mode, conversation: output };
        if (options.json) writeJson(io, payload);
        else io.stdout(JSON.stringify(output, null, 2));
        return 0;
      }

      const executionInput = {
        workspaceId: options.workspaceId,
        ...(options.conversationId ? { conversationId: options.conversationId } : { modelProfile: options.provider, title: "OpenRill local conversation" }),
        submissionKey: `cli:${randomUUID()}`,
        text: prompt,
        timeoutMs: options.timeoutMs,
      };
      const result = await session.client.call<ConversationExecuteOutput>("conversation.execute", executionInput, options.timeoutMs + 5000);
      const payload = {
        completed: result.status === "COMPLETED", profile: paths.profile, workspaceId: options.workspaceId,
        modelProfile: options.conversationId ? null : options.provider, conversationId: result.conversationId,
        runId: result.runId, status: result.status, terminalReason: result.terminalReason,
        assistantText: result.assistantText, usage: result.usage, messageCount: result.messageCount,
        lastMessageSequence: result.lastMessageSequence, failure: result.failure, persisted: true,
        hostMode: session.mode, attachedInstanceId: session.instanceId,
      };
      if (options.json) writeJson(io, payload);
      else {
        io.stdout(`OpenRill Conversation ${result.status} conversationId=${result.conversationId} runId=${result.runId} hostMode=${session.mode}`);
        if (result.assistantText) io.stdout(result.assistantText);
        if (result.failure) io.stderr(`openrill: ${result.failure.code}: ${result.failure.message}`);
      }
      return result.status === "COMPLETED" && result.assistantText.length > 0 ? 0 : 31;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr(`openrill: local Conversation command failed: ${message}`);
      const hostModule = await import("@openrill/host");
      if (error instanceof hostModule.HostLifecycleError && (error.code === "HOST_ALREADY_RUNNING" || error.code === "HOST_LOCK_UNVERIFIED")) return 11;
      return 31;
    } finally {
      await session?.close(options.command === "ask" ? "ask-complete" : "conversation-command-complete").catch(() => undefined);
      runtime.offSignal("SIGINT", onSignal);
      runtime.offSignal("SIGTERM", onSignal);
    }
  }

  const hostModule = await import("@openrill/host");
  let host: LocalHostHandle | null = null;
  let signalAccepted = false;
  const onSignal = () => {
    if (signalAccepted) return;
    signalAccepted = true;
    if (host) void host.close("signal");
  };
  runtime.onSignal("SIGINT", onSignal);
  runtime.onSignal("SIGTERM", onSignal);
  try {
    if (signalAccepted) return 0;
    host = await (runtime.startHost ?? hostModule.startLocalHost)({ profile: paths.profile, bind, port, force: options.force, env: runtime.env, config: loadedConfig.config, configRoot: paths.configRoot, workspaceIds: loadedConfig.config.workspaces.length > 0 ? loadedConfig.config.workspaces.map((workspace) => workspace.id) : ["default"], ...(runtime.osSecretProvider ? { osSecretProvider: runtime.osSecretProvider } : {}) });
    if (signalAccepted) void host.close("signal-during-startup");
    let ready;
    try {
      ready = await host.ready;
    } catch (error) {
      await host.closed;
      if (host.status().state === "STOPPED") return 0;
      throw error;
    }
    if (options.json) writeJson(io, { ...ready, configRevision: loadedConfig.materializedRevision, configRecovery: loadedConfig.recovery });
    else io.stdout(`OpenRill Host READY profile=${ready.profile} pid=${ready.pid} bind=${ready.bind} port=${ready.port} instanceId=${ready.instanceId} config=${loadedConfig.materializedRevision.slice(0, 12)}`);
    await host.closed;
    if (!options.json) io.stdout(`OpenRill Host STOPPED profile=${ready.profile} instanceId=${ready.instanceId}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`openrill: ${message}`);
    if (error instanceof hostModule.HostLifecycleError) {
      if (error.code === "HOST_ALREADY_RUNNING" || error.code === "HOST_LOCK_UNVERIFIED") return 11;
      return 12;
    }
    return 12;
  } finally {
    runtime.offSignal("SIGINT", onSignal);
    runtime.offSignal("SIGTERM", onSignal);
  }
}
