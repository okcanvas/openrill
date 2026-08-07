import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) output[key] = normalize(child);
    }
    return output;
  }
  return value;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function materializedRevision(value: unknown): string {
  return sha256Text(stableJson(value));
}

export function deepMergeConfig(base: unknown, overlay: unknown): unknown {
  if (
    base !== null && overlay !== null
    && typeof base === "object" && typeof overlay === "object"
    && !Array.isArray(base) && !Array.isArray(overlay)
  ) {
    const output: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) {
      output[key] = Object.hasOwn(output, key) ? deepMergeConfig(output[key], value) : value;
    }
    return output;
  }
  return overlay;
}

export function collectChangedPaths(before: unknown, after: unknown, path = "", output: string[] = []): string[] {
  if (Object.is(before, after)) return output;
  if (
    before !== null && after !== null
    && typeof before === "object" && typeof after === "object"
    && !Array.isArray(before) && !Array.isArray(after)
  ) {
    const keys = new Set([...Object.keys(before as object), ...Object.keys(after as object)]);
    for (const key of [...keys].sort()) {
      collectChangedPaths(
        (before as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        output,
      );
    }
    return output;
  }
  output.push(path || "<root>");
  return output;
}
