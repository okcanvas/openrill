import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { OpenRillConfigError } from "./errors.js";

export type OsSecretProviderKind = "WINDOWS_DPAPI" | "UNAVAILABLE";
export type OsSecretInspectionReason = "AVAILABLE" | "MISSING" | "PROVIDER_UNAVAILABLE" | "UNREADABLE";

export interface OsSecretInspection {
  readonly available: boolean;
  readonly reason: OsSecretInspectionReason;
}

export interface OsSecretProvider {
  readonly kind: OsSecretProviderKind;
  inspect(key: string): Promise<OsSecretInspection>;
  get(key: string): Promise<string>;
  set(key: string, value: string): Promise<void>;
  setInteractive(key: string, prompt?: string): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface OsSecretCommandResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export interface OsSecretCommandExecutor {
  run(
    executable: string,
    args: readonly string[],
    input: string | null,
    timeoutMs: number,
    interactive?: boolean,
    env?: NodeJS.ProcessEnv,
  ): Promise<OsSecretCommandResult>;
}

export interface CreateOsSecretProviderOptions {
  readonly configRoot: string;
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly executor?: OsSecretCommandExecutor;
}

const SECRET_KEY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;
const POWERSHELL_TIMEOUT_MS = 20_000;

function validateKey(key: string): string {
  if (!SECRET_KEY_PATTERN.test(key)) {
    throw new OpenRillConfigError("CONFIG_SECRET_STORE_FAILED", "OS secret key must be 1-128 portable characters");
  }
  return key;
}

function secretPath(configRoot: string, key: string): string {
  const digest = createHash("sha256").update(validateKey(key), "utf8").digest("hex");
  return resolve(configRoot, "os-secrets", `${digest}.dpapi`);
}

class BoundedTextCollector {
  readonly #chunks: Buffer[] = [];
  #bytes = 0;

  public constructor(private readonly maxBytes: number) {}

  public push(chunk: Buffer): void {
    this.#chunks.push(chunk);
    this.#bytes += chunk.length;
    while (this.#bytes > this.maxBytes && this.#chunks.length > 0) {
      const first = this.#chunks[0]!;
      const overflow = this.#bytes - this.maxBytes;
      if (first.length <= overflow) {
        this.#chunks.shift();
        this.#bytes -= first.length;
      } else {
        this.#chunks[0] = first.subarray(overflow);
        this.#bytes -= overflow;
      }
    }
  }

  public text(): string {
    return Buffer.concat(this.#chunks).toString("utf8");
  }
}

export function createNodeOsSecretCommandExecutor(): OsSecretCommandExecutor {
  return {
    async run(executable, args, input, timeoutMs, interactive = false, env) {
      return await new Promise<OsSecretCommandResult>((resolveResult, reject) => {
        const stdout = new BoundedTextCollector(1_048_576);
        const stderr = new BoundedTextCollector(65_536);
        let timedOut = false;
        let settled = false;
        const child = spawn(executable, [...args], {
          shell: false,
          windowsHide: true,
          env: env ?? process.env,
          stdio: [interactive ? "inherit" : input === null ? "ignore" : "pipe", "pipe", "pipe"],
        });
        child.stdout?.on("data", (chunk: Buffer | string) => stdout.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        child.stderr?.on("data", (chunk: Buffer | string) => stderr.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill();
        }, timeoutMs);
        child.once("error", (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
        child.once("close", (exitCode, signal) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolveResult({ exitCode, signal, timedOut, stdout: stdout.text(), stderr: stderr.text() });
        });
        if (input !== null) child.stdin?.end(input, "utf8");
      });
    },
  };
}

const POWERSHELL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Security
$operation = [Environment]::GetEnvironmentVariable('OPENRILL_DPAPI_OPERATION', 'Process')
$path = [Environment]::GetEnvironmentVariable('OPENRILL_DPAPI_PATH', 'Process')
if ([string]::IsNullOrWhiteSpace($operation) -or [string]::IsNullOrWhiteSpace($path)) { throw 'missing operation or path' }
if ($operation -eq 'inspect') {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { [Console]::Out.Write('MISSING'); exit 0 }
  try {
    $protected = [IO.File]::ReadAllBytes($path)
    $plain = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ($plain.Length -eq 0) { throw 'empty secret' }
    [Array]::Clear($plain, 0, $plain.Length)
    [Console]::Out.Write('AVAILABLE')
  } catch {
    [Console]::Out.Write('UNREADABLE')
  }
  exit 0
}
if ($operation -eq 'get') {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'secret not found' }
  $protected = [IO.File]::ReadAllBytes($path)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  try { [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain)) }
  finally { [Array]::Clear($plain, 0, $plain.Length) }
  exit 0
}
if ($operation -eq 'set' -or $operation -eq 'set-interactive') {
  $directory = [IO.Path]::GetDirectoryName($path)
  [IO.Directory]::CreateDirectory($directory) | Out-Null
  $text = $null
  if ($operation -eq 'set-interactive') {
    $configuredPrompt = [Environment]::GetEnvironmentVariable('OPENRILL_DPAPI_PROMPT', 'Process')
    $prompt = if (-not [string]::IsNullOrWhiteSpace($configuredPrompt)) { $configuredPrompt } else { 'OpenRill secret' }
    $secure = Read-Host -Prompt $prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $text = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  } else {
    $text = [Console]::In.ReadToEnd()
  }
  if ([string]::IsNullOrEmpty($text)) { throw 'secret is empty' }
  $plain = [Text.Encoding]::UTF8.GetBytes($text)
  try {
    $protected = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $temporary = "$path.$PID.$([Guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::WriteAllBytes($temporary, $protected)
    Move-Item -LiteralPath $temporary -Destination $path -Force
  } finally {
    [Array]::Clear($plain, 0, $plain.Length)
    $text = $null
  }
  [Console]::Out.Write('STORED')
  exit 0
}
if ($operation -eq 'delete') {
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    Remove-Item -LiteralPath $path -Force
    [Console]::Out.Write('DELETED')
  } else {
    [Console]::Out.Write('MISSING')
  }
  exit 0
}
throw 'unsupported operation'
`.trim();

const POWERSHELL_ENCODED_COMMAND = Buffer.from(POWERSHELL_SCRIPT, "utf16le").toString("base64");

function commandFailureDetail(operation: string, result: OsSecretCommandResult): string {
  const stderr = result.stderr.replace(/\s+/g, " ").trim().slice(0, 1024);
  return [
    `operation=${operation}`,
    `exitCode=${result.exitCode ?? "null"}`,
    `signal=${result.signal ?? "none"}`,
    `timedOut=${result.timedOut}`,
    ...(stderr ? [`stderr=${stderr}`] : []),
  ].join(" ");
}

class UnavailableOsSecretProvider implements OsSecretProvider {
  public readonly kind = "UNAVAILABLE" as const;

  public async inspect(key: string): Promise<OsSecretInspection> {
    validateKey(key);
    return { available: false, reason: "PROVIDER_UNAVAILABLE" };
  }

  public async get(key: string): Promise<string> {
    validateKey(key);
    throw new OpenRillConfigError("CONFIG_SECRET_UNRESOLVED", "OS secret provider is unavailable on this platform");
  }

  public async set(key: string, _value: string): Promise<void> {
    validateKey(key);
    throw new OpenRillConfigError("CONFIG_SECRET_STORE_FAILED", "OS secret provider is unavailable on this platform");
  }

  public async setInteractive(key: string): Promise<void> {
    validateKey(key);
    throw new OpenRillConfigError("CONFIG_SECRET_STORE_FAILED", "interactive OS secret storage is unavailable on this platform");
  }

  public async delete(key: string): Promise<boolean> {
    validateKey(key);
    return false;
  }
}

export class WindowsDpapiSecretProvider implements OsSecretProvider {
  public readonly kind = "WINDOWS_DPAPI" as const;
  readonly #executor: OsSecretCommandExecutor;
  readonly #executable: string;

  public constructor(private readonly options: CreateOsSecretProviderOptions) {
    this.#executor = options.executor ?? createNodeOsSecretCommandExecutor();
    this.#executable = options.env?.OPENRILL_POWERSHELL_PATH?.trim() || "powershell.exe";
  }

  async #run(operation: "inspect" | "get" | "set" | "set-interactive" | "delete", key: string, input: string | null, prompt?: string): Promise<OsSecretCommandResult> {
    const interactive = operation === "set-interactive";
    const path = secretPath(this.options.configRoot, key);
    await mkdir(resolve(this.options.configRoot, "os-secrets"), { recursive: true, mode: 0o700 });
    const args = [
      "-NoLogo",
      "-NoProfile",
      ...(interactive ? [] : ["-NonInteractive"]),
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      POWERSHELL_ENCODED_COMMAND,
    ];
    const env = {
      ...(this.options.env ?? process.env),
      OPENRILL_DPAPI_OPERATION: operation,
      OPENRILL_DPAPI_PATH: path,
      OPENRILL_DPAPI_PROMPT: prompt ?? "",
    };
    try {
      return await this.#executor.run(this.#executable, args, input, POWERSHELL_TIMEOUT_MS, interactive, env);
    } catch (error) {
      throw new OpenRillConfigError("CONFIG_SECRET_STORE_FAILED", "Windows DPAPI command could not be started", { cause: error });
    }
  }

  public async inspect(key: string): Promise<OsSecretInspection> {
    validateKey(key);
    const path = secretPath(this.options.configRoot, key);
    const exists = await stat(path).then((entry) => entry.isFile()).catch(() => false);
    if (!exists) return { available: false, reason: "MISSING" };
    const result = await this.#run("inspect", key, null);
    if (result.timedOut || result.exitCode !== 0) return { available: false, reason: "UNREADABLE" };
    if (result.stdout.trim() === "AVAILABLE") return { available: true, reason: "AVAILABLE" };
    if (result.stdout.trim() === "MISSING") return { available: false, reason: "MISSING" };
    return { available: false, reason: "UNREADABLE" };
  }

  public async get(key: string): Promise<string> {
    validateKey(key);
    const result = await this.#run("get", key, null);
    if (result.timedOut || result.exitCode !== 0 || result.stdout.length === 0) {
      throw new OpenRillConfigError(
        "CONFIG_SECRET_UNRESOLVED",
        `Windows DPAPI secret is unavailable or unreadable (${commandFailureDetail("get", result)})`,
      );
    }
    return result.stdout;
  }

  public async set(key: string, value: string): Promise<void> {
    validateKey(key);
    if (!value) throw new OpenRillConfigError("CONFIG_SECRET_STORE_FAILED", "OS secret value must not be empty");
    const result = await this.#run("set", key, value);
    if (result.timedOut || result.exitCode !== 0 || result.stdout.trim() !== "STORED") {
      throw new OpenRillConfigError(
        "CONFIG_SECRET_STORE_FAILED",
        `Windows DPAPI secret storage failed (${commandFailureDetail("set", result)})`,
      );
    }
  }

  public async setInteractive(key: string, prompt = "OpenRill API key"): Promise<void> {
    validateKey(key);
    const result = await this.#run("set-interactive", key, null, prompt);
    if (result.timedOut || result.exitCode !== 0 || result.stdout.trim() !== "STORED") {
      throw new OpenRillConfigError(
        "CONFIG_SECRET_STORE_FAILED",
        `interactive Windows DPAPI secret storage failed (${commandFailureDetail("set-interactive", result)})`,
      );
    }
  }

  public async delete(key: string): Promise<boolean> {
    validateKey(key);
    const result = await this.#run("delete", key, null);
    if (result.timedOut || result.exitCode !== 0) {
      throw new OpenRillConfigError(
        "CONFIG_SECRET_STORE_FAILED",
        `Windows DPAPI secret deletion failed (${commandFailureDetail("delete", result)})`,
      );
    }
    return result.stdout.trim() === "DELETED";
  }
}

export function createOsSecretProvider(options: CreateOsSecretProviderOptions): OsSecretProvider {
  return (options.platform ?? process.platform) === "win32"
    ? new WindowsDpapiSecretProvider(options)
    : new UnavailableOsSecretProvider();
}

export function createEphemeralOsSecretProviderForTests(initial: Readonly<Record<string, string>> = {}): OsSecretProvider {
  const values = new Map(Object.entries(initial));
  return {
    kind: "WINDOWS_DPAPI",
    async inspect(key) {
      validateKey(key);
      return values.has(key) ? { available: true, reason: "AVAILABLE" } : { available: false, reason: "MISSING" };
    },
    async get(key) {
      validateKey(key);
      const value = values.get(key);
      if (value === undefined) throw new OpenRillConfigError("CONFIG_SECRET_UNRESOLVED", "test OS secret is unavailable");
      return value;
    },
    async set(key, value) {
      validateKey(key);
      if (!value) throw new OpenRillConfigError("CONFIG_SECRET_STORE_FAILED", "test OS secret value must not be empty");
      values.set(key, value);
    },
    async setInteractive(key) {
      validateKey(key);
      throw new OpenRillConfigError("CONFIG_SECRET_STORE_FAILED", "interactive test secret input was not supplied");
    },
    async delete(key) {
      validateKey(key);
      return values.delete(key);
    },
  };
}
