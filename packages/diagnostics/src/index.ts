/** STEP001 package boundary for @openrill/diagnostics. */
export const PACKAGE_NAME = "@openrill/diagnostics" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "DIAGNOSTICS" as const;

export interface PackageIdentity {
  readonly name: typeof PACKAGE_NAME;
  readonly version: typeof PACKAGE_VERSION;
  readonly boundary: typeof PACKAGE_BOUNDARY;
}

export function getPackageIdentity(): PackageIdentity {
  return {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    boundary: PACKAGE_BOUNDARY,
  };
}
