/** OpenRill deterministic Agent task benchmark boundary. */
export const PACKAGE_NAME = "@openrill/agent-benchmark" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "AGENT_BENCHMARK" as const;

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}

export * from "./types.js";
export * from "./catalog.js";
export * from "./runner.js";
export * from "./report.js";
