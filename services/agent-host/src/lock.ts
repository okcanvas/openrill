import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import type { OpenRillProfilePaths } from "@openrill/config";
import { HostLifecycleError } from "./errors.js";
import { probeHostStatus } from "./control-client.js";
import { parseHostLockPayload, readHostMetadata, type HostLockPayload } from "./metadata.js";

export interface HostLockHandle {
  readonly payload: HostLockPayload;
  readonly release: () => Promise<void>;
}

export interface AcquireHostLockOptions {
  readonly paths: OpenRillProfilePaths;
  readonly payload: HostLockPayload;
  readonly force?: boolean;
  readonly forceMinimumAgeMs?: number;
  readonly now?: () => number;
  readonly isPidAlive?: (pid: number) => boolean;
}

export function defaultIsPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

async function readRawLock(path: string): Promise<string | null> {
  try { return await readFile(path, "utf8"); } catch { return null; }
}

async function lockAgeMs(path: string, payload: HostLockPayload | null, now: () => number): Promise<number> {
  const parsed = payload ? Date.parse(payload.createdAt) : Number.NaN;
  if (Number.isFinite(parsed)) return Math.max(0, now() - parsed);
  try { return Math.max(0, now() - (await stat(path)).mtimeMs); } catch { return 0; }
}

export async function acquireHostLock(options: AcquireHostLockOptions): Promise<HostLockHandle> {
  const { paths, payload } = options;
  const now = options.now ?? Date.now;
  const isPidAlive = options.isPidAlive ?? defaultIsPidAlive;
  const forceMinimumAgeMs = options.forceMinimumAgeMs ?? 30_000;
  await mkdir(paths.runtimeDir, { recursive: true });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const handle = await open(paths.lockPath, "wx", 0o600);
      try { await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`, "utf8"); await handle.sync(); }
      finally { await handle.close(); }
      return {
        payload,
        release: async () => {
          const current = parseHostLockPayload((await readRawLock(paths.lockPath)) ?? "");
          if (current?.instanceId === payload.instanceId) await rm(paths.lockPath, { force: true });
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new HostLifecycleError("HOST_STARTUP_FAILED", `failed to acquire Host lock: ${paths.lockPath}`, error);
      }
    }

    const existingRaw = await readRawLock(paths.lockPath);
    const existing = existingRaw ? parseHostLockPayload(existingRaw) : null;
    const metadata = await readHostMetadata(paths);
    if (metadata && existing && metadata.instanceId === existing.instanceId) {
      const status = await probeHostStatus(metadata, 400);
      if (status) {
        throw new HostLifecycleError(
          "HOST_ALREADY_RUNNING",
          `OpenRill Host is already running for profile ${paths.profile} (pid=${status.pid}, port=${status.port})`,
        );
      }
    }

    const alive = existing ? isPidAlive(existing.pid) : false;
    const age = await lockAgeMs(paths.lockPath, existing, now);
    const automaticallyReclaimable = existing !== null && !alive;
    const forceReclaimable = options.force === true && age >= forceMinimumAgeMs;
    if (automaticallyReclaimable || forceReclaimable) {
      await rm(paths.metadataPath, { force: true });
      await rm(paths.lockPath, { force: true });
      continue;
    }

    const detail = existing ? `pid=${existing.pid} alive=${alive} ageMs=${Math.floor(age)}` : `invalid lock ageMs=${Math.floor(age)}`;
    throw new HostLifecycleError(
      "HOST_LOCK_UNVERIFIED",
      `OpenRill Host lock cannot be safely reclaimed for profile ${paths.profile}; ${detail}${options.force ? "" : "; retry with --force only after verifying no Host is running"}`,
    );
  }
  throw new HostLifecycleError("HOST_STARTUP_FAILED", `could not acquire Host lock after retries: ${paths.lockPath}`);
}
