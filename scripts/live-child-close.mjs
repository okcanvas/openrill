export async function waitForChildClose(child, {
  label = "child-process",
  timeoutMs = 15_000,
} = {}) {
  if (!child || typeof child.once !== "function") {
    throw new TypeError("OPENRILL_LIVE_CHILD_CLOSE_INVALID_CHILD");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError("OPENRILL_LIVE_CHILD_CLOSE_INVALID_TIMEOUT");
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    let timer;

    const finish = (exitCode, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.off?.("close", onClose);
      resolve({ exitCode, signal });
    };
    const onClose = (exitCode, signal) => finish(exitCode, signal);

    // Register first, then inspect terminal state. This closes both races:
    // already closed before this function was called and close queued between
    // the caller's previous observation and listener registration.
    child.once("close", onClose);
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.off?.("close", onClose);
      reject(new Error(`OPENRILL_LIVE_CHILD_CLOSE_TIMEOUT:${label}:${timeoutMs}`));
    }, timeoutMs);

    if (child.exitCode !== null || child.signalCode !== null) {
      finish(child.exitCode, child.signalCode);
    }
  });
}
