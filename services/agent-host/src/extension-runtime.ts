import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  OPENRILL_EXTENSION_MANIFEST_FILE,
  extensionCapabilityKey,
  extensionHostCompatible,
  validateExtensionCapability,
  validateExtensionManifest,
  validateExtensionSettings,
  type OpenRillExtensionActivationContext,
  type OpenRillExtensionCapability,
  type OpenRillExtensionIssue,
  type OpenRillExtensionIssueCode,
  type OpenRillExtensionManifest,
  type OpenRillExtensionModule,
  type OpenRillExtensionPublicView,
  type OpenRillExtensionRuntime,
  type OpenRillExtensionSourceSettings,
  type OpenRillExtensionState,
} from "@openrill/extension-sdk";
import { inspectSecretReference, resolveSecretReference, type OsSecretProvider } from "@openrill/config";
import { ConnectorAdapterRegistry, type OpenRillConnectorAdapter } from "@openrill/connectors";

const MAX_MANIFEST_BYTES = 262_144;
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const ACTIVATION_TIMEOUT_MS = 10_000;
const DEACTIVATION_TIMEOUT_MS = 5_000;

export type ExtensionRuntimeErrorCode =
  | "EXTENSION_NOT_FOUND"
  | "EXTENSION_STATE_INVALID"
  | "EXTENSION_ACTIVATION_FAILED"
  | "EXTENSION_CAPABILITY_CONFLICT";

export class ExtensionRuntimeError extends Error {
  public constructor(public readonly code: ExtensionRuntimeErrorCode, message: string) {
    super(message);
    this.name = "ExtensionRuntimeError";
  }
}

interface ExtensionRecord {
  readonly root: string | null;
  readonly entryPath: string | null;
  readonly manifest: OpenRillExtensionManifest | null;
  readonly extensionId: string;
  readonly displayName: string;
  readonly version: string;
  readonly capabilities: readonly OpenRillExtensionCapability[];
  readonly settings: OpenRillExtensionSourceSettings;
  enabled: boolean;
  state: OpenRillExtensionState;
  activationSequence: number | null;
  issue: OpenRillExtensionIssue | null;
  intrinsicIssue: OpenRillExtensionIssue | null;
  runtime: OpenRillExtensionRuntime | null;
  abortController: AbortController | null;
}

export interface LocalExtensionRuntimeRegistryOptions {
  readonly hostVersion: string;
  readonly configRoot: string;
  readonly roots: readonly string[];
  readonly enabled: readonly string[];
  readonly settings: Readonly<Record<string, OpenRillExtensionSourceSettings>>;
  readonly env?: NodeJS.ProcessEnv;
  readonly osSecretProvider?: OsSecretProvider;
  readonly publishNotice?: (topic: string, data: unknown) => void;
  readonly importModule?: (entryUrl: string) => Promise<unknown>;
  readonly activationTimeoutMs?: number;
  readonly deactivationTimeoutMs?: number;
  readonly connectorRegistry?: ConnectorAdapterRegistry;
}

function within(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function boundedMessage(value: unknown, fallback: string): string {
  const text = value instanceof Error ? value.message : typeof value === "string" ? value : fallback;
  return text.replace(/[\r\n\t]+/g, " ").trim().slice(0, 512) || fallback;
}

function issue(code: OpenRillExtensionIssueCode, message: string): OpenRillExtensionIssue {
  return { code, message: boundedMessage(message, code) };
}

class ExtensionModuleContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ExtensionModuleContractError";
  }
}

function moduleInvalid(message: string): ExtensionModuleContractError {
  return new ExtensionModuleContractError(message);
}

function syntheticId(root: string): string {
  return `invalid-${createHash("sha256").update(root).digest("hex").slice(0, 16)}`;
}

function emptySettings(): OpenRillExtensionSourceSettings { return { values: {}, secrets: {} }; }

function blockedRecord(input: {
  readonly extensionId: string;
  readonly enabled: boolean;
  readonly code: OpenRillExtensionIssueCode;
  readonly message: string;
}): ExtensionRecord {
  return {
    root: null,
    entryPath: null,
    manifest: null,
    extensionId: input.extensionId,
    displayName: "Invalid local extension",
    version: "0.0.0",
    capabilities: [],
    settings: emptySettings(),
    enabled: input.enabled,
    state: "BLOCKED",
    activationSequence: null,
    issue: issue(input.code, input.message),
    intrinsicIssue: issue(input.code, input.message),
    runtime: null,
    abortController: null,
  };
}

function publicView(record: ExtensionRecord): OpenRillExtensionPublicView {
  return {
    extensionId: record.extensionId,
    displayName: record.displayName,
    version: record.version,
    state: record.state,
    enabled: record.enabled,
    activationSequence: record.activationSequence,
    capabilities: record.capabilities.map((capability) => ({ ...capability })),
    issue: record.issue ? { ...record.issue } : null,
  };
}

function normalizeModule(value: unknown): OpenRillExtensionModule | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const namespace = value as Record<string, unknown>;
  if (namespace.default !== undefined && namespace.extension !== undefined) return null;
  if (!Object.keys(namespace).every((key) => key === "default" || key === "extension")) return null;
  const candidate = namespace.default ?? namespace.extension;
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  return Object.keys(record).length === 1 && typeof record.activate === "function" ? record as unknown as OpenRillExtensionModule : null;
}

function normalizeRuntime(value: unknown): OpenRillExtensionRuntime | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && typeof record.deactivate === "function" ? record as unknown as OpenRillExtensionRuntime : null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function boundedRegularFile(path: string, maximumBytes: number): Promise<boolean> {
  return await stat(path).then((entry) => entry.isFile() && entry.size <= maximumBytes).catch(() => false);
}

export class LocalExtensionRuntimeRegistry {
  readonly #records = new Map<string, ExtensionRecord>();
  readonly #activeCapabilityOwners = new Map<string, string>();
  readonly #activationOrder: string[] = [];
  readonly #importModule: (entryUrl: string) => Promise<unknown>;
  #activationSequence = 0;
  #discovered = false;

  public constructor(private readonly options: LocalExtensionRuntimeRegistryOptions) {
    this.#importModule = options.importModule ?? ((entryUrl) => import(entryUrl));
  }

  public async discover(): Promise<readonly OpenRillExtensionPublicView[]> {
    if (this.#discovered) return this.list();
    this.#discovered = true;
    const discovered: ExtensionRecord[] = [];
    for (const configuredRoot of [...new Set(this.options.roots)].sort()) {
      const rootCandidate = resolve(this.options.configRoot, configuredRoot);
      const extensionId = syntheticId(rootCandidate);
      const root = await realpath(rootCandidate).catch(() => null);
      if (!root) {
        discovered.push(blockedRecord({ extensionId, enabled: false, code: "MANIFEST_INVALID", message: "extension root is unavailable" }));
        continue;
      }
      const manifestCandidate = resolve(root, OPENRILL_EXTENSION_MANIFEST_FILE);
      const manifestPath = await realpath(manifestCandidate).catch(() => null);
      if (!manifestPath || !within(root, manifestPath) || !(await boundedRegularFile(manifestPath, MAX_MANIFEST_BYTES))) {
        discovered.push(blockedRecord({ extensionId, enabled: false, code: "MANIFEST_INVALID", message: "extension manifest is unavailable, outside the extension root, or exceeds the size limit" }));
        continue;
      }
      let raw: unknown;
      try { raw = JSON.parse(await readFile(manifestPath, "utf8")); }
      catch {
        discovered.push(blockedRecord({ extensionId, enabled: false, code: "MANIFEST_INVALID", message: "extension manifest is not valid JSON" }));
        continue;
      }
      const checked = validateExtensionManifest(raw);
      if (!checked.ok) {
        discovered.push(blockedRecord({ extensionId, enabled: false, code: "MANIFEST_INVALID", message: checked.error }));
        continue;
      }
      const manifest = deepFreeze(structuredClone(checked.value));
      const entryCandidate = resolve(root, manifest.entry);
      const entryPath = await realpath(entryCandidate).catch(() => null);
      if (!entryPath || !within(root, entryPath) || !(await boundedRegularFile(entryPath, MAX_ENTRY_BYTES))) {
        discovered.push({
          ...blockedRecord({ extensionId: manifest.id, enabled: this.options.enabled.includes(manifest.id), code: "ENTRY_INVALID", message: "extension entry is unavailable, outside the extension root, or exceeds the size limit" }),
          root,
          manifest,
          displayName: manifest.displayName,
          version: manifest.version,
          capabilities: manifest.capabilities,
          settings: this.options.settings[manifest.id] ?? emptySettings(),
          intrinsicIssue: issue("ENTRY_INVALID", "extension entry is unavailable, outside the extension root, or exceeds the size limit"),
        });
        continue;
      }
      const settings = this.options.settings[manifest.id] ?? emptySettings();
      const settingsCheck = validateExtensionSettings(manifest, settings);
      const compatible = extensionHostCompatible(manifest, this.options.hostVersion);
      discovered.push({
        root,
        entryPath,
        manifest,
        extensionId: manifest.id,
        displayName: manifest.displayName,
        version: manifest.version,
        capabilities: manifest.capabilities,
        settings,
        enabled: this.options.enabled.includes(manifest.id),
        state: settingsCheck.ok && compatible ? "DISCOVERED" : "BLOCKED",
        activationSequence: null,
        issue: !settingsCheck.ok
          ? issue("CONFIG_INVALID", settingsCheck.error)
          : !compatible
            ? issue("HOST_INCOMPATIBLE", "extension is incompatible with this Host version")
            : null,
        intrinsicIssue: !settingsCheck.ok
          ? issue("CONFIG_INVALID", settingsCheck.error)
          : !compatible
            ? issue("HOST_INCOMPATIBLE", "extension is incompatible with this Host version")
            : null,
        runtime: null,
        abortController: null,
      });
    }

    const grouped = new Map<string, ExtensionRecord[]>();
    for (const record of discovered) grouped.set(record.extensionId, [...(grouped.get(record.extensionId) ?? []), record]);
    for (const [extensionId, records] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const representative = records[0]!;
      if (records.length > 1) {
        representative.state = "BLOCKED";
        const duplicateIssue = issue("DUPLICATE_EXTENSION_ID", "multiple local extension roots declare the same extension id");
        representative.issue = duplicateIssue;
        representative.intrinsicIssue = duplicateIssue;
        representative.enabled = this.options.enabled.includes(extensionId);
      }
      this.#records.set(extensionId, representative);
    }
    for (const extensionId of [...this.options.enabled].sort()) {
      if (this.#records.has(extensionId)) continue;
      this.#records.set(extensionId, blockedRecord({
        extensionId,
        enabled: true,
        code: "MANIFEST_INVALID",
        message: "configured extension was not discovered",
      }));
    }
    this.#reconcileCapabilityConflicts();
    const views = this.list();
    if (views.length > 0) this.#publish("extension.discovered", { items: views });
    return views;
  }

  #reconcileCapabilityConflicts(): void {
    for (const record of this.#records.values()) {
      if (record.state === "READY" || record.state === "ACTIVATING" || record.state === "DEACTIVATING") continue;
      if (record.intrinsicIssue) {
        record.state = "BLOCKED";
        record.issue = record.intrinsicIssue;
      } else {
        record.state = record.enabled ? "DISCOVERED" : "DISABLED";
        record.issue = null;
      }
    }

    const candidates = new Map<string, ExtensionRecord[]>();
    for (const record of this.#records.values()) {
      if (!record.enabled || record.intrinsicIssue || record.state === "READY") continue;
      for (const capability of record.capabilities) {
        const key = extensionCapabilityKey(capability);
        candidates.set(key, [...(candidates.get(key) ?? []), record]);
      }
    }
    for (const [key, records] of candidates) {
      const activeOwner = this.#activeCapabilityOwners.get(key);
      const conflicting = activeOwner ? records.filter((record) => record.extensionId !== activeOwner) : records.length > 1 ? records : [];
      for (const record of conflicting) {
        record.state = "BLOCKED";
        record.issue = issue("CAPABILITY_CONFLICT", activeOwner
          ? `capability is already owned by ${activeOwner}`
          : `enabled extensions declare duplicate capability ${key}`);
      }
    }
  }

  async #activateNewlyUnblocked(): Promise<void> {
    for (const extensionId of [...this.#records.keys()].sort()) {
      const record = this.#records.get(extensionId)!;
      if (record.enabled && record.state === "DISCOVERED") await this.#activate(record, false);
    }
  }

  public async startConfigured(): Promise<readonly OpenRillExtensionPublicView[]> {
    await this.discover();
    for (const extensionId of [...this.#records.keys()].sort()) {
      const record = this.#records.get(extensionId)!;
      if (record.enabled && record.state === "DISCOVERED") await this.#activate(record, false);
      else if (!record.enabled && record.state === "DISCOVERED") record.state = "DISABLED";
    }
    return this.list();
  }

  public list(): readonly OpenRillExtensionPublicView[] {
    return [...this.#records.values()].map(publicView).sort((left, right) => left.extensionId.localeCompare(right.extensionId));
  }

  public get(extensionId: string): OpenRillExtensionPublicView {
    const record = this.#records.get(extensionId);
    if (!record) throw new ExtensionRuntimeError("EXTENSION_NOT_FOUND", `extension not found: ${extensionId}`);
    return publicView(record);
  }

  public async enable(extensionId: string): Promise<OpenRillExtensionPublicView> {
    await this.discover();
    const record = this.#records.get(extensionId);
    if (!record) throw new ExtensionRuntimeError("EXTENSION_NOT_FOUND", `extension not found: ${extensionId}`);
    if (record.state === "ACTIVATING" || record.state === "DEACTIVATING") throw new ExtensionRuntimeError("EXTENSION_STATE_INVALID", "extension lifecycle transition is already in progress");
    record.enabled = true;
    this.#reconcileCapabilityConflicts();
    if (record.state === "READY") return publicView(record);
    if (record.state === "BLOCKED") throw new ExtensionRuntimeError("EXTENSION_STATE_INVALID", record.issue?.message ?? "extension is blocked");
    return await this.#activate(record, true);
  }

  public async disable(extensionId: string): Promise<OpenRillExtensionPublicView> {
    await this.discover();
    const record = this.#records.get(extensionId);
    if (!record) throw new ExtensionRuntimeError("EXTENSION_NOT_FOUND", `extension not found: ${extensionId}`);
    if (record.state === "ACTIVATING" || record.state === "DEACTIVATING") throw new ExtensionRuntimeError("EXTENSION_STATE_INVALID", "extension lifecycle transition is already in progress");
    record.enabled = false;
    if (record.state === "READY") await this.#deactivate(record, "runtime-disable");
    this.#reconcileCapabilityConflicts();
    await this.#activateNewlyUnblocked();
    this.#publish("extension.updated", publicView(record));
    return publicView(record);
  }

  async #activate(record: ExtensionRecord, requested: boolean): Promise<OpenRillExtensionPublicView> {
    if (record.state === "ACTIVATING" || record.state === "DEACTIVATING") throw new ExtensionRuntimeError("EXTENSION_STATE_INVALID", "extension lifecycle transition is already in progress");
    if (!record.entryPath || !record.manifest) throw new ExtensionRuntimeError("EXTENSION_STATE_INVALID", record.issue?.message ?? "extension entry is unavailable");
    for (const capability of record.capabilities) {
      const owner = this.#activeCapabilityOwners.get(extensionCapabilityKey(capability));
      if (owner && owner !== record.extensionId) {
        record.state = "BLOCKED";
        record.issue = issue("CAPABILITY_CONFLICT", `capability is already owned by ${owner}`);
        throw new ExtensionRuntimeError("EXTENSION_CAPABILITY_CONFLICT", record.issue.message);
      }
    }
    for (const field of record.manifest.configSchema.fields) {
      if (field.kind !== "secret") continue;
      const reference = record.settings.secrets[field.key];
      if (!reference) continue;
      const status = await inspectSecretReference(reference, {
        env: this.options.env ?? process.env,
        configRoot: this.options.configRoot,
        ...(this.options.osSecretProvider ? { osSecretProvider: this.options.osSecretProvider } : {}),
      });
      if (!status.available) {
        record.state = "BLOCKED";
        record.issue = issue("SECRET_UNAVAILABLE", `extension secret ${field.key} is unavailable: ${status.reason}`);
        if (requested) throw new ExtensionRuntimeError("EXTENSION_ACTIVATION_FAILED", record.issue.message);
        return publicView(record);
      }
    }

    record.state = "ACTIVATING";
    record.issue = null;
    this.#publish("extension.updated", publicView(record));
    const abortController = new AbortController();
    record.abortController = abortController;
    const claimed = new Set<string>();
    let registrationOpen = true;
    const declared = new Map(record.capabilities.map((capability) => [extensionCapabilityKey(capability), capability]));
    const claim = (capability: OpenRillExtensionCapability, connectorRegistration: boolean): OpenRillExtensionCapability => {
      if (!registrationOpen) throw moduleInvalid("extension capability registration is closed");
      const checked = validateExtensionCapability(capability);
      if (!checked.ok) throw moduleInvalid(checked.error);
      const key = extensionCapabilityKey(checked.value);
      if (!declared.has(key)) throw moduleInvalid(`extension claimed undeclared capability ${key}`);
      if (claimed.has(key)) throw moduleInvalid(`extension claimed duplicate capability ${key}`);
      if (checked.value.kind === "connector" && this.options.connectorRegistry && !connectorRegistration) {
        throw moduleInvalid("connector capability must register an adapter with the Host");
      }
      claimed.add(key);
      return checked.value;
    };
    const contextBase = {
      extensionId: record.extensionId,
      manifest: record.manifest,
      config: Object.freeze({ ...record.settings.values }),
      signal: abortController.signal,
      claimCapability: (capability: OpenRillExtensionCapability) => { void claim(capability, false); },
      resolveSecret: async (key: string) => {
        if (!registrationOpen) throw moduleInvalid("extension secret resolution is closed");
        const field = record.manifest!.configSchema.fields.find((candidate) => candidate.key === key && candidate.kind === "secret");
        const reference = record.settings.secrets[key];
        if (!field || !reference) throw moduleInvalid(`extension secret is not declared or configured: ${key}`);
        return await resolveSecretReference(reference, {
          ...(this.options.env ? { env: this.options.env } : {}),
          configRoot: this.options.configRoot,
          ...(this.options.osSecretProvider ? { osSecretProvider: this.options.osSecretProvider } : {}),
        });
      },
    };
    const context: OpenRillExtensionActivationContext = Object.freeze(this.options.connectorRegistry
      ? {
          ...contextBase,
          registerConnector: (adapter: OpenRillConnectorAdapter) => {
            if (!adapter || typeof adapter !== "object") throw moduleInvalid("connector adapter contract is invalid");
            const connectorId = typeof adapter.connectorId === "string" ? adapter.connectorId : "";
            claim({ kind: "connector", id: connectorId }, true);
            try {
              return this.options.connectorRegistry!.register(record.extensionId, adapter, abortController.signal);
            } catch {
              throw moduleInvalid("connector adapter registration failed");
            }
          },
        }
      : contextBase);

    try {
      const activationTimeoutMs = this.options.activationTimeoutMs ?? ACTIVATION_TIMEOUT_MS;
      const imported = await withTimeout(this.#importModule(pathToFileURL(record.entryPath).href), activationTimeoutMs, "extension module import timed out");
      const module = normalizeModule(imported);
      if (!module) throw moduleInvalid("extension module must export one closed default or extension object with activate");
      const runtime = normalizeRuntime(await withTimeout(Promise.resolve(module.activate(context)), activationTimeoutMs, "extension activation timed out"));
      registrationOpen = false;
      if (!runtime) throw moduleInvalid("extension activation must return one closed runtime object with deactivate");
      const missingClaims = [...declared.keys()].filter((key) => !claimed.has(key));
      if (missingClaims.length > 0) {
        await withTimeout(Promise.resolve(runtime.deactivate("activation-contract-failed")), this.options.deactivationTimeoutMs ?? DEACTIVATION_TIMEOUT_MS, "extension cleanup timed out").catch(() => undefined);
        throw moduleInvalid(`extension did not claim declared capabilities: ${missingClaims.join(", ")}`);
      }
      record.runtime = runtime;
      record.state = "READY";
      record.activationSequence = ++this.#activationSequence;
      for (const capability of record.capabilities) this.#activeCapabilityOwners.set(extensionCapabilityKey(capability), record.extensionId);
      this.#activationOrder.push(record.extensionId);
      this.#publish("extension.updated", publicView(record));
      return publicView(record);
    } catch (error) {
      registrationOpen = false;
      abortController.abort();
      record.abortController = null;
      record.runtime = null;
      const invalidModule = error instanceof ExtensionModuleContractError;
      record.state = "FAILED";
      record.issue = invalidModule
        ? issue("MODULE_INVALID", boundedMessage(error, "extension module contract is invalid"))
        : issue("ACTIVATION_FAILED", "extension activation failed or timed out");
      this.#publish("extension.updated", publicView(record));
      if (requested) throw new ExtensionRuntimeError("EXTENSION_ACTIVATION_FAILED", record.issue.message);
      return publicView(record);
    }
  }

  async #deactivate(record: ExtensionRecord, reason: string): Promise<void> {
    const runtime = record.runtime;
    if (!runtime) { record.state = "DISABLED"; return; }
    record.state = "DEACTIVATING";
    this.#publish("extension.updated", publicView(record));
    record.abortController?.abort();
    try {
      await withTimeout(Promise.resolve(runtime.deactivate(reason)), this.options.deactivationTimeoutMs ?? DEACTIVATION_TIMEOUT_MS, "extension deactivation timed out");
      record.state = "DISABLED";
      record.issue = null;
    } catch (error) {
      record.state = "FAILED";
      void error;
      record.issue = issue("DEACTIVATION_FAILED", "extension deactivation failed or timed out");
    } finally {
      record.runtime = null;
      record.abortController = null;
      for (const capability of record.capabilities) {
        const key = extensionCapabilityKey(capability);
        if (this.#activeCapabilityOwners.get(key) === record.extensionId) this.#activeCapabilityOwners.delete(key);
      }
      const index = this.#activationOrder.lastIndexOf(record.extensionId);
      if (index >= 0) this.#activationOrder.splice(index, 1);
    }
  }

  public async close(): Promise<void> {
    for (const extensionId of [...this.#activationOrder].reverse()) {
      const record = this.#records.get(extensionId);
      if (record?.state === "READY") await this.#deactivate(record, "host-stopping");
    }
  }

  #publish(topic: string, data: unknown): void { this.options.publishNotice?.(topic, data); }
}
