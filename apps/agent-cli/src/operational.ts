import { resolve } from "node:path";
import {
  OPENRILL_CONFIG_VERSION,
  createOsSecretProvider,
  loadOpenRillConfig,
  writeOpenRillConfig,
  type OpenRillConfigSource,
  type OpenRillConfigPaths,
  type OsSecretProvider,
} from "@openrill/config";
import { createDockerExecutionBackend, type DockerExecutionBackendOptions } from "@openrill/sandbox-docker";
import { createWorkspaceCatalog } from "@openrill/workspace";

export interface OperationalIo {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

export interface OperationalRuntime {
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: () => string;
  readonly platform: NodeJS.Platform;
  readonly readStdin: () => Promise<string>;
  readonly osSecretProvider?: OsSecretProvider;
  readonly dockerDoctor?: (options: DockerExecutionBackendOptions) => Promise<{ readonly available: boolean; readonly detail: string }>;
}

export interface SetupCommandOptions {
  readonly profile: string;
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
  readonly force: boolean;
  readonly json: boolean;
}

export interface DoctorCommandOptions {
  readonly profile: string;
  readonly json: boolean;
}

export interface DoctorCheck {
  readonly name: string;
  readonly state: "PASS" | "WARN" | "FAIL";
  readonly detail: string;
}

function writeJson(io: OperationalIo, value: unknown): void {
  io.stdout(JSON.stringify(value));
}

function cleanSecretInput(raw: string): string {
  const value = raw.replace(/\r?\n$/, "");
  if (!value || /[\r\n]/.test(value)) throw new Error("API key stdin must contain exactly one non-empty line");
  return value;
}

function providerFor(runtime: OperationalRuntime, configRoot: string): OsSecretProvider {
  return runtime.osSecretProvider ?? createOsSecretProvider({
    configRoot,
    platform: runtime.platform,
    env: runtime.env,
  });
}

export async function runSetupCommand(
  options: SetupCommandOptions,
  paths: OpenRillConfigPaths,
  configRoot: string,
  io: OperationalIo,
  runtime: OperationalRuntime,
): Promise<number> {
  if (!options.endpoint) {
    io.stderr("openrill: setup requires --endpoint");
    return 2;
  }
  if (!options.model) {
    io.stderr("openrill: setup requires --model");
    return 2;
  }
  if (options.backend === "docker" && !options.dockerImage) {
    io.stderr("openrill: Docker setup requires --docker-image pinned by sha256 digest");
    return 2;
  }

  const current = await loadOpenRillConfig({
    paths,
    env: runtime.env,
    platform: runtime.platform,
    ...(runtime.osSecretProvider ? { osSecretProvider: runtime.osSecretProvider } : {}),
  });
  if (current.sourceExists && !options.force) {
    io.stderr(`openrill: config source already exists: ${paths.sourcePath}; use --force to replace it`);
    return 21;
  }

  const configuredWorkspace = resolve(runtime.cwd(), options.workspacePath ?? runtime.cwd());
  let catalog;
  try {
    catalog = await createWorkspaceCatalog([{ id: options.workspaceId, path: configuredWorkspace, readOnly: options.workspaceReadOnly }]);
  } catch (error) {
    io.stderr(`openrill: workspace validation failed: ${error instanceof Error ? error.message : String(error)}`);
    return 31;
  }
  const canonicalWorkspace = catalog.internal(options.workspaceId).canonicalRoot;

  const secretProvider = providerFor(runtime, configRoot);
  if (secretProvider.kind === "UNAVAILABLE") {
    io.stderr("openrill: setup requires an available OS secret provider; Windows DPAPI is supported in STEP016A");
    return 32;
  }

  const priorInspection = await secretProvider.inspect(options.secretKey);
  if (priorInspection.reason === "UNREADABLE") {
    io.stderr(`openrill: existing OS secret is unreadable and will not be overwritten: ${options.secretKey}`);
    return 32;
  }
  const priorValue = priorInspection.available ? await secretProvider.get(options.secretKey) : null;

  try {
    if (options.apiKeyStdin) {
      await secretProvider.set(options.secretKey, cleanSecretInput(await runtime.readStdin()));
    } else {
      await secretProvider.setInteractive(options.secretKey, `OpenRill API key for ${options.provider}`);
    }
  } catch (error) {
    io.stderr(`openrill: OS secret storage failed: ${error instanceof Error ? error.message : String(error)}`);
    return 32;
  }

  const source: OpenRillConfigSource = {
    version: OPENRILL_CONFIG_VERSION,
    host: { bind: "127.0.0.1", port: 47117 },
    modelProviders: {
      [options.provider]: {
        type: "openai-responses",
        endpoint: options.endpoint,
        apiKey: { kind: "os", key: options.secretKey },
        model: options.model,
        maxOutputTokens: 4096,
        maxRetries: 2,
      },
    },
    workspaces: [{ id: options.workspaceId, path: canonicalWorkspace, readOnly: options.workspaceReadOnly }],
    execution: {
      approvalMode: "ask",
      defaultTimeoutMs: 120_000,
      approvalTimeoutMs: 120_000,
      backend: options.backend,
      fallback: options.fallback,
      mountMode: options.mountMode,
      networkMode: options.networkMode,
      ...(options.backend === "docker" && options.dockerImage ? {
        docker: {
          image: options.dockerImage,
          profile: options.profile,
          executable: "docker",
          memoryBytes: 536_870_912,
          pidsLimit: 256,
        },
      } : {}),
    },
    skills: { roots: [], enabled: [] },
    automation: { enabled: false },
    browser: { enabled: false },
    ui: { openOnStart: false },
  };

  try {
    const result = await writeOpenRillConfig({
      paths,
      source,
      expectedRevision: current.sourceExists ? current.sourceRevision : null,
      env: runtime.env,
      platform: runtime.platform,
      osSecretProvider: secretProvider,
    });
    const inspection = await secretProvider.inspect(options.secretKey);
    if (!inspection.available) throw new Error(`OS secret verification failed: ${inspection.reason}`);
    const payload = {
      configured: true,
      profile: options.profile,
      sourcePath: result.sourcePath,
      sourceRevision: result.sourceRevision,
      materializedRevision: result.materializedRevision,
      workspace: { id: options.workspaceId, path: canonicalWorkspace, readOnly: options.workspaceReadOnly },
      modelProvider: { id: options.provider, type: "openai-responses", endpoint: options.endpoint, model: options.model, secret: { kind: "os", key: options.secretKey } },
      execution: { backend: options.backend, fallback: options.fallback, mountMode: options.mountMode, networkMode: options.networkMode },
      next: `openrill doctor --profile ${options.profile}`,
    };
    if (options.json) writeJson(io, payload);
    else {
      io.stdout(`OpenRill setup complete profile=${options.profile}`);
      io.stdout(`config=${result.sourcePath}`);
      io.stdout(`workspace=${options.workspaceId}:${canonicalWorkspace}`);
      io.stdout(`model=${options.provider}:${options.model}`);
      io.stdout(`execution=${options.backend}`);
      io.stdout(`next=${payload.next}`);
    }
    return 0;
  } catch (error) {
    try {
      if (priorValue === null) await secretProvider.delete(options.secretKey);
      else await secretProvider.set(options.secretKey, priorValue);
    } catch {
      io.stderr("openrill: setup rollback warning: OS secret rollback could not be completed");
    }
    io.stderr(`openrill: setup failed: ${error instanceof Error ? error.message : String(error)}`);
    return 20;
  }
}

function push(checks: DoctorCheck[], name: string, state: DoctorCheck["state"], detail: string): void {
  checks.push({ name, state, detail });
}

export async function runDoctorCommand(
  options: DoctorCommandOptions,
  paths: OpenRillConfigPaths,
  configRoot: string,
  io: OperationalIo,
  runtime: OperationalRuntime,
): Promise<number> {
  const checks: DoctorCheck[] = [];
  const secretProvider = providerFor(runtime, configRoot);
  let loaded;
  try {
    loaded = await loadOpenRillConfig({
      paths,
      env: runtime.env,
      platform: runtime.platform,
      osSecretProvider: secretProvider,
    });
    push(checks, "config.source", loaded.sourceExists ? "PASS" : "FAIL", loaded.sourceExists ? paths.sourcePath : "agent.yaml is missing; run openrill setup");
    push(checks, "config.recovery", loaded.recovery === "SOURCE" ? "PASS" : "FAIL", loaded.recovery);
  } catch (error) {
    push(checks, "config.load", "FAIL", error instanceof Error ? error.message : String(error));
    const payload = { profile: options.profile, ready: false, checks };
    if (options.json) writeJson(io, payload);
    else for (const check of checks) io.stdout(`${check.state} ${check.name} ${check.detail}`);
    return 30;
  }

  const providerEntries = Object.entries(loaded.config.modelProviders);
  push(checks, "model.providers", providerEntries.length > 0 ? "PASS" : "FAIL", providerEntries.length > 0 ? providerEntries.map(([id, item]) => `${id}:${item.type}:${item.model ?? "<missing>"}`).join(",") : "no model provider configured");
  if (loaded.secretStatuses.length === 0 && providerEntries.length > 0) {
    push(checks, "secrets", "FAIL", "configured providers have no secret status");
  } else {
    for (const status of loaded.secretStatuses) {
      push(checks, `secret.${status.path}`, status.available ? "PASS" : "FAIL", `${status.reference.kind}:${status.reason}`);
    }
  }
  const requiresOsProvider = loaded.secretStatuses.some((status) => status.reference.kind === "os");
  push(
    checks,
    "secret.provider",
    requiresOsProvider ? (secretProvider.kind === "UNAVAILABLE" ? "FAIL" : "PASS") : "PASS",
    requiresOsProvider ? secretProvider.kind : "NOT_REQUIRED",
  );

  try {
    const catalog = await createWorkspaceCatalog(loaded.config.workspaces);
    const listed = catalog.list();
    push(checks, "workspaces", listed.length > 0 ? "PASS" : "FAIL", listed.length > 0 ? listed.map((item) => `${item.workspaceId}:${item.accessMode}`).join(",") : "no workspace configured");
  } catch (error) {
    push(checks, "workspaces", "FAIL", error instanceof Error ? error.message : String(error));
  }

  if (loaded.config.execution.backend === "host") {
    push(checks, "execution.backend", "PASS", "HOST available; sandboxed=false");
  } else {
    const docker = loaded.config.execution.docker;
    if (!docker.image) {
      push(checks, "execution.backend", "FAIL", "Docker image is not configured");
    } else {
      const doctorOptions: DockerExecutionBackendOptions = {
        image: docker.image,
        profile: docker.profile ?? options.profile,
        memoryBytes: docker.memoryBytes,
        pidsLimit: docker.pidsLimit,
      };
      const availability = runtime.dockerDoctor
        ? await runtime.dockerDoctor(doctorOptions)
        : await createDockerExecutionBackend(doctorOptions).doctor();
      push(checks, "execution.backend", availability.available ? "PASS" : "FAIL", `DOCKER ${availability.detail}`);
    }
  }

  const ready = checks.every((check) => check.state !== "FAIL");
  const payload = {
    profile: options.profile,
    ready,
    configRevision: loaded.materializedRevision,
    recovery: loaded.recovery,
    checks,
    next: ready ? `openrill start --profile ${options.profile}` : "fix failed checks and rerun openrill doctor",
  };
  if (options.json) writeJson(io, payload);
  else {
    for (const check of checks) io.stdout(`${check.state} ${check.name} ${check.detail}`);
    io.stdout(`OpenRill doctor ${ready ? "READY" : "NOT_READY"} profile=${options.profile}`);
    io.stdout(`next=${payload.next}`);
  }
  return ready ? 0 : 30;
}
