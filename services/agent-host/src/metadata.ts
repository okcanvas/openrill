import { chmod, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { HostLifecycleState, HostStatusPayload } from "@openrill/protocol";
import type { OpenRillProfilePaths } from "@openrill/config";

export interface HostPrivateMetadata extends HostStatusPayload {
  readonly schemaVersion: 1;
  readonly controlToken: string;
  readonly protocolToken: string;
}

export interface HostLockPayload {
  readonly schemaVersion: 1;
  readonly product: "OpenRill";
  readonly version: string;
  readonly profile: string;
  readonly pid: number;
  readonly instanceId: string;
  readonly createdAt: string;
}

function isState(value: unknown): value is HostLifecycleState {
  return new Set(["STARTING", "LISTENING", "READY", "STOPPING", "STOPPED", "FAILED"]).has(String(value));
}

export function parseHostLockPayload(raw: string): HostLockPayload | null {
  try {
    const value = JSON.parse(raw) as Partial<HostLockPayload>;
    if (
      value.schemaVersion !== 1 || value.product !== "OpenRill" || typeof value.version !== "string" ||
      typeof value.profile !== "string" || !Number.isInteger(value.pid) || (value.pid ?? 0) <= 0 ||
      typeof value.instanceId !== "string" || value.instanceId.length < 8 || typeof value.createdAt !== "string"
    ) return null;
    return value as HostLockPayload;
  } catch { return null; }
}

export function parseHostPrivateMetadata(raw: string): HostPrivateMetadata | null {
  try {
    const value = JSON.parse(raw) as Partial<HostPrivateMetadata>;
    if (
      value.schemaVersion !== 1 || value.product !== "OpenRill" || typeof value.version !== "string" ||
      typeof value.profile !== "string" || !Number.isInteger(value.pid) || (value.pid ?? 0) <= 0 ||
      typeof value.instanceId !== "string" || typeof value.bind !== "string" ||
      !Number.isInteger(value.port) || (value.port ?? -1) < 0 || (value.port ?? 65536) > 65535 ||
      typeof value.startedAt !== "string" || !isState(value.state) || typeof value.readiness !== "boolean" ||
      typeof value.controlToken !== "string" || value.controlToken.length < 24 ||
      typeof value.protocolToken !== "string" || value.protocolToken.length < 24
    ) return null;
    return value as HostPrivateMetadata;
  } catch { return null; }
}

export function toPublicHostStatus(metadata: HostPrivateMetadata): HostStatusPayload {
  const { controlToken: _controlToken, protocolToken: _protocolToken, schemaVersion: _schemaVersion, ...status } = metadata;
  return status;
}

export async function readHostLock(paths: OpenRillProfilePaths): Promise<HostLockPayload | null> {
  try { return parseHostLockPayload(await readFile(paths.lockPath, "utf8")); } catch { return null; }
}

export async function readHostMetadata(paths: OpenRillProfilePaths): Promise<HostPrivateMetadata | null> {
  try { return parseHostPrivateMetadata(await readFile(paths.metadataPath, "utf8")); } catch { return null; }
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally { await handle.close(); }
  await rm(path, { force: true });
  await rename(temporary, path);
  if (process.platform !== "win32") await chmod(path, 0o600);
}
