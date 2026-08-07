export const PACKAGE_NAME = "@openrill/connector-mattermost" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "CONNECTOR_MATTERMOST" as const;

export interface PackageIdentity {
  readonly name: typeof PACKAGE_NAME;
  readonly version: typeof PACKAGE_VERSION;
  readonly boundary: typeof PACKAGE_BOUNDARY;
}

export function getPackageIdentity(): PackageIdentity {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY };
}

export * from "./client.js";
export * from "./errors.js";
export * from "./normalize.js";
export * from "./runtime.js";
export * from "./types.js";
export * from "./url.js";
