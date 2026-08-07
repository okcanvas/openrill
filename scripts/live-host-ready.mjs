import { readFile } from "node:fs/promises";

function bounded(value, limit = 4000) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

export async function waitForReadyHostMetadata(options) {
  const attempts = options.attempts ?? 480;
  const delayMs = options.delayMs ?? 25;
  let lastMetadata = null;
  let lastReadError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.child.exitCode !== null) {
      throw new Error(`Host exited ${options.child.exitCode} before READY: ${bounded(options.output())}`);
    }
    try {
      const metadata = JSON.parse(await readFile(options.metadataPath, "utf8"));
      lastMetadata = metadata;
      if (
        metadata?.state === "READY"
        && metadata?.readiness === true
        && Number.isInteger(metadata?.port)
        && metadata.port > 0
      ) return metadata;
    } catch (error) {
      lastReadError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, delayMs));
  }
  throw new Error(`Host READY metadata timeout: ${JSON.stringify({ lastMetadata, lastReadError, output: bounded(options.output()) })}`);
}
