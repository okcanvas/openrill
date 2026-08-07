import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import type { OpenRillConfigPaths } from "./types.js";

/** OpenRill configuration and profile path ownership boundary. */
export const PACKAGE_NAME = "@openrill/config" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "CONFIG" as const;
export const DEFAULT_PROFILE = "default" as const;

const PROFILE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const WINDOWS_RESERVED_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

type PathSemantics = Pick<typeof posix, "resolve">;

export class InvalidProfileNameError extends Error {
  public constructor(public readonly rawProfile: string) {
    super(`invalid OpenRill profile name: ${rawProfile}`);
    this.name = "InvalidProfileNameError";
  }
}

export interface OpenRillProfilePaths {
  readonly profile: string;
  readonly dataRoot: string;
  readonly configRoot: string;
  readonly runtimeDir: string;
  readonly lockPath: string;
  readonly metadataPath: string;
}

export interface ResolveProfilePathsOptions {
  readonly profile?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
}

export function canonicalizeProfileName(rawProfile: string = DEFAULT_PROFILE): string {
  const profile = rawProfile.trim().toLowerCase();
  if (!PROFILE_PATTERN.test(profile) || profile === "." || profile === ".." || WINDOWS_RESERVED_NAMES.has(profile)) {
    throw new InvalidProfileNameError(rawProfile);
  }
  return profile;
}

function selectPathSemantics(platform: NodeJS.Platform): PathSemantics {
  return platform === "win32" ? win32 : posix;
}

function resolveWindowsBase(
  env: NodeJS.ProcessEnv,
  home: string,
  kind: "data" | "config",
  pathSemantics: PathSemantics,
): string {
  if (kind === "data") {
    return env.OPENRILL_DATA_ROOT
      ?? pathSemantics.resolve(env.LOCALAPPDATA ?? pathSemantics.resolve(home, "AppData", "Local"), "OpenRill");
  }
  return env.OPENRILL_CONFIG_ROOT
    ?? pathSemantics.resolve(env.APPDATA ?? pathSemantics.resolve(home, "AppData", "Roaming"), "OpenRill");
}

function resolveUnixBase(
  env: NodeJS.ProcessEnv,
  home: string,
  kind: "data" | "config",
  pathSemantics: PathSemantics,
): string {
  if (kind === "data") {
    return env.OPENRILL_DATA_ROOT
      ?? pathSemantics.resolve(env.XDG_DATA_HOME ?? pathSemantics.resolve(home, ".local", "share"), "openrill");
  }
  return env.OPENRILL_CONFIG_ROOT
    ?? pathSemantics.resolve(env.XDG_CONFIG_HOME ?? pathSemantics.resolve(home, ".config"), "openrill");
}

export function resolveProfilePaths(options: ResolveProfilePathsOptions = {}): OpenRillProfilePaths {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? homedir();
  const profile = canonicalizeProfileName(options.profile);
  const pathSemantics = selectPathSemantics(platform);
  const dataBase = platform === "win32"
    ? resolveWindowsBase(env, home, "data", pathSemantics)
    : resolveUnixBase(env, home, "data", pathSemantics);
  const configBase = platform === "win32"
    ? resolveWindowsBase(env, home, "config", pathSemantics)
    : resolveUnixBase(env, home, "config", pathSemantics);
  const dataRoot = pathSemantics.resolve(dataBase, profile);
  const configRoot = pathSemantics.resolve(configBase, profile);
  const runtimeDir = pathSemantics.resolve(dataRoot, "runtime");
  return {
    profile,
    dataRoot,
    configRoot,
    runtimeDir,
    lockPath: pathSemantics.resolve(runtimeDir, "host.lock"),
    metadataPath: pathSemantics.resolve(runtimeDir, "host.json"),
  };
}

export function resolveConfigPaths(
  profilePaths: OpenRillProfilePaths,
  options: { readonly platform?: NodeJS.Platform } = {},
): OpenRillConfigPaths {
  const pathSemantics = selectPathSemantics(options.platform ?? process.platform);
  const stateDir = pathSemantics.resolve(profilePaths.dataRoot, "config");
  return {
    sourcePath: pathSemantics.resolve(profilePaths.configRoot, "agent.yaml"),
    stateDir,
    materializedPath: pathSemantics.resolve(stateDir, "materialized.json"),
    lastKnownGoodPath: pathSemantics.resolve(stateDir, "last-known-good.json"),
    journalDir: pathSemantics.resolve(stateDir, "journal"),
    mutationLockPath: pathSemantics.resolve(stateDir, "config.mutation.lock"),
    secretsDir: pathSemantics.resolve(profilePaths.configRoot, "secrets"),
  };
}

export interface PackageIdentity {
  readonly name: typeof PACKAGE_NAME;
  readonly version: typeof PACKAGE_VERSION;
  readonly boundary: typeof PACKAGE_BOUNDARY;
}

export function getPackageIdentity(): PackageIdentity {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY };
}

export * from "./canonical.js";
export * from "./errors.js";
export * from "./includes.js";
export * from "./io.js";
export * from "./os-secrets.js";
export * from "./schema.js";
export * from "./secrets.js";
export * from "./types.js";
export * from "./yaml-subset.js";
