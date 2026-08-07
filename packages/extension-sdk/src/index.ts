/** OpenRill-owned local extension package contract. Runtime activation remains Host-owned. */
export const PACKAGE_NAME = "@openrill/extension-sdk" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "EXTENSION_SDK" as const;

export interface PackageIdentity {
  readonly name: typeof PACKAGE_NAME;
  readonly version: typeof PACKAGE_VERSION;
  readonly boundary: typeof PACKAGE_BOUNDARY;
}

export function getPackageIdentity(): PackageIdentity {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY };
}

export * from "./compatibility.js";
export * from "./types.js";
export * from "./validation.js";
