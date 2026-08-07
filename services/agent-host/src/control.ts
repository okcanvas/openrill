import { rm } from "node:fs/promises";
import type { OpenRillProfilePaths } from "@openrill/config";
import type { HostStatusPayload } from "@openrill/protocol";
import { probeHostStatus, requestHostStop } from "./control-client.js";
import { defaultIsPidAlive } from "./lock.js";
import { readHostLock, readHostMetadata, toPublicHostStatus } from "./metadata.js";

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface InspectLocalHostResult {
  readonly running: boolean;
  readonly status: HostStatusPayload | null;
  readonly reason: "READY" | "STARTING" | "STOPPED" | "UNREACHABLE" | "STALE_CLEANED";
}

export async function inspectLocalHost(
  paths: OpenRillProfilePaths,
  timeoutMs = 500,
): Promise<InspectLocalHostResult> {
  const metadata = await readHostMetadata(paths);
  if (metadata) {
    const status = await probeHostStatus(metadata, timeoutMs);
    if (status) return { running: true, status, reason: status.readiness ? "READY" : "STARTING" };
  }
  const lock = await readHostLock(paths);
  const metadataOwnerDead = metadata !== null && !defaultIsPidAlive(metadata.pid);
  const lockOwnerDead = lock !== null && !defaultIsPidAlive(lock.pid);
  if (metadataOwnerDead) await rm(paths.metadataPath, { force: true });
  if (lockOwnerDead) await rm(paths.lockPath, { force: true });
  if (metadataOwnerDead || lockOwnerDead) {
    const remainingLock = lock !== null && !lockOwnerDead;
    if (!remainingLock) return { running: false, status: null, reason: "STALE_CLEANED" };
  }
  if (lock || metadata) {
    return {
      running: false,
      status: metadata ? toPublicHostStatus(metadata) : null,
      reason: "UNREACHABLE",
    };
  }
  return { running: false, status: null, reason: "STOPPED" };
}

export interface StopLocalHostResult {
  readonly stopped: boolean;
  readonly alreadyStopped: boolean;
  readonly reason: "STOPPED" | "ALREADY_STOPPED" | "UNREACHABLE";
}

export async function stopLocalHost(
  paths: OpenRillProfilePaths,
  timeoutMs = 5000,
): Promise<StopLocalHostResult> {
  const metadata = await readHostMetadata(paths);
  if (!metadata) {
    const inspected = await inspectLocalHost(paths);
    return inspected.reason === "UNREACHABLE"
      ? { stopped: false, alreadyStopped: false, reason: "UNREACHABLE" }
      : { stopped: true, alreadyStopped: true, reason: "ALREADY_STOPPED" };
  }
  const response = await requestHostStop(metadata, Math.min(timeoutMs, 1000));
  if (!response) {
    const inspected = await inspectLocalHost(paths);
    if (!inspected.running && inspected.reason !== "UNREACHABLE") {
      return { stopped: true, alreadyStopped: true, reason: "ALREADY_STOPPED" };
    }
    return { stopped: false, alreadyStopped: false, reason: "UNREACHABLE" };
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await readHostMetadata(paths);
    if (!current || current.instanceId !== metadata.instanceId) {
      return { stopped: true, alreadyStopped: false, reason: "STOPPED" };
    }
    await delay(50);
  }
  return { stopped: false, alreadyStopped: false, reason: "UNREACHABLE" };
}
