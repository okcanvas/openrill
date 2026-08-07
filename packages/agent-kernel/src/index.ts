/** OpenRill provider-neutral agent execution kernel. */
export const PACKAGE_NAME = "@openrill/agent-kernel" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "AGENT_KERNEL" as const;

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}

export * from "./errors.js";
export * from "./kernel.js";
export * from "./types.js";
