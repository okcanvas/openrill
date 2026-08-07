/** OpenRill durable agent memory boundary. */
export const PACKAGE_NAME = "@openrill/memory" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "MEMORY" as const;

export { MemoryError, type MemoryErrorCode } from "./errors.js";
export { MemoryService, DEFAULT_MEMORY_LIMITS, MEMORY_SYSTEM_INSTRUCTIONS } from "./service.js";
export type {
  MemoryKind,
  MemoryRecord,
  MemorySearchHit,
  MemorySearchResult,
  MemoryRememberResult,
  MemoryForgetResult,
  MemoryLimits,
} from "./types.js";

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}
