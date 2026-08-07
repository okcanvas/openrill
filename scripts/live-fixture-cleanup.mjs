import { rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

export const WINDOWS_RETRYABLE_CLEANUP_CODES = new Set(["EBUSY", "EPERM", "ENOTEMPTY"]);
export const DEFAULT_CLEANUP_ATTEMPTS = 40;
export const DEFAULT_CLEANUP_RETRY_DELAY_MS = 100;
export const DEFAULT_CHILD_EXIT_TIMEOUT_MS = 5_000;

function errorCode(error) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}

export async function removeTreeWithRetries(
  target,
  {
    remove = rm,
    attempts = DEFAULT_CLEANUP_ATTEMPTS,
    retryDelayMs = DEFAULT_CLEANUP_RETRY_DELAY_MS,
    sleep = delay,
  } = {},
) {
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new TypeError("cleanup attempts must be a positive integer");
  if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0) throw new TypeError("cleanup retry delay must be a non-negative integer");
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await remove(target, { recursive: true, force: true });
      return { attempts: attempt };
    } catch (error) {
      lastError = error;
      if (!WINDOWS_RETRYABLE_CLEANUP_CODES.has(errorCode(error)) || attempt === attempts) throw error;
      await sleep(retryDelayMs * attempt);
    }
  }
  throw lastError;
}

export async function terminateChildAndWait(
  child,
  {
    label = "child",
    timeoutMs = DEFAULT_CHILD_EXIT_TIMEOUT_MS,
    sleep = delay,
  } = {},
) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return { state: "ALREADY_EXITED" };
  let exited = false;
  const exitPromise = new Promise((resolveExit) => {
    child.once("exit", () => {
      exited = true;
      resolveExit();
    });
  });
  child.kill();
  await Promise.race([exitPromise, sleep(timeoutMs)]);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exitPromise, sleep(timeoutMs)]);
  }
  if (!exited && child.exitCode === null && child.signalCode === null) {
    throw new Error(`${label} exit timeout`);
  }
  return { state: "EXITED" };
}

export async function closeServerAndWait(server) {
  if (!server?.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

export function describeCleanupFailure(error) {
  const code = errorCode(error) || "UNKNOWN";
  const message = error instanceof Error ? error.message : String(error);
  return `${code}:${message}`;
}
