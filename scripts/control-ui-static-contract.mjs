import { posix } from "node:path";

export const CONTROL_UI_MODULE_ENTRYPOINT = "/assets/web/browser-app.js";

export function controlUiAssetRelativePath(entrypoint = CONTROL_UI_MODULE_ENTRYPOINT) {
  if (typeof entrypoint !== "string" || !entrypoint.startsWith("/assets/") || entrypoint.includes("..") || entrypoint.includes("//") || /[?#]/.test(entrypoint)) {
    throw new Error(`OPENRILL_CONTROL_UI_ENTRYPOINT_INVALID:${String(entrypoint)}`);
  }
  const relative = entrypoint.slice(1);
  if (posix.normalize(relative) !== relative) throw new Error(`OPENRILL_CONTROL_UI_ENTRYPOINT_INVALID:${entrypoint}`);
  return relative;
}

export function controlUiModuleEntrypointFromHtml(html) {
  if (typeof html !== "string") throw new TypeError("Control UI index must be text");
  const matches = [...html.matchAll(/<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*>/gi)].map((match) => match[1]);
  if (matches.length !== 1) throw new Error(`OPENRILL_CONTROL_UI_MODULE_ENTRYPOINT_COUNT:${matches.length}`);
  const [entrypoint] = matches;
  controlUiAssetRelativePath(entrypoint);
  if (entrypoint !== CONTROL_UI_MODULE_ENTRYPOINT) {
    throw new Error(`OPENRILL_CONTROL_UI_MODULE_ENTRYPOINT_MISMATCH:expected=${CONTROL_UI_MODULE_ENTRYPOINT}:actual=${entrypoint}`);
  }
  return entrypoint;
}
