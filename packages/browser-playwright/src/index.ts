/** OpenRill concrete Playwright Browser adapter. */
export const PACKAGE_NAME = "@openrill/browser-playwright" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "BROWSER_PLAYWRIGHT_ADAPTER" as const;

export { PlaywrightAdapterError } from "./errors.js";
export type { PlaywrightAdapterErrorCode } from "./errors.js";
export { resolveChromiumExecutable } from "./executable.js";
export type { ChromiumExecutableOptions, ChromiumExecutableResolution } from "./executable.js";
export { createPlaywrightBrowserDriver, PlaywrightBrowserDriver } from "./driver.js";
export type { PlaywrightBrowserDriverOptions } from "./driver.js";

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}
