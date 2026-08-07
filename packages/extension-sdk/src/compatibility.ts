import type { OpenRillExtensionManifest } from "./types.js";

interface ParsedVersion { readonly major: number; readonly minor: number; readonly patch: number; readonly pre: readonly (string | number)[]; }
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function parse(value: string): ParsedVersion | null {
  const match = VERSION.exec(value);
  if (!match) return null;
  const pre = match[4]?.split(".").map((part) => /^\d+$/.test(part) ? Number(part) : part) ?? [];
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre };
}

export function compareExtensionVersions(left: string, right: string): number {
  const a = parse(left); const b = parse(right);
  if (!a || !b) throw new Error("invalid extension compatibility version");
  for (const key of ["major", "minor", "patch"] as const) if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  if (a.pre.length === 0 || b.pre.length === 0) return a.pre.length === b.pre.length ? 0 : a.pre.length === 0 ? 1 : -1;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    const av = a.pre[index]; const bv = b.pre[index];
    if (av === undefined || bv === undefined) return av === bv ? 0 : av === undefined ? -1 : 1;
    if (av === bv) continue;
    if (typeof av === "number" && typeof bv === "number") return av < bv ? -1 : 1;
    if (typeof av === "number") return -1;
    if (typeof bv === "number") return 1;
    return av.localeCompare(bv);
  }
  return 0;
}

export function extensionHostCompatible(manifest: OpenRillExtensionManifest, hostVersion: string): boolean {
  if (compareExtensionVersions(hostVersion, manifest.compatibility.host.minInclusive) < 0) return false;
  const max = manifest.compatibility.host.maxExclusive;
  return max === undefined || compareExtensionVersions(hostVersion, max) < 0;
}
