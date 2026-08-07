import { existsSync, statSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { PlaywrightAdapterError } from "./errors.js";

export interface ChromiumExecutableResolution {
  readonly executablePath: string;
  readonly source: "explicit" | "path" | "system";
}

export interface ChromiumExecutableOptions {
  readonly executablePath?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}

function usableFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function pathCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const names = platform === "win32"
    ? ["chromium.exe", "chrome.exe", "msedge.exe"]
    : ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge"];
  return (env.PATH ?? "").split(delimiter).filter(Boolean).flatMap((directory) => names.map((name) => join(directory, name)));
}

function systemCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter((value): value is string => Boolean(value));
    return roots.flatMap((root) => [
      join(root, "Google", "Chrome", "Application", "chrome.exe"),
      join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      join(root, "Chromium", "Application", "chrome.exe"),
    ]);
  }
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }
  return [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/microsoft-edge",
    "/snap/bin/chromium",
  ];
}

export function resolveChromiumExecutable(options: ChromiumExecutableOptions = {}): ChromiumExecutableResolution {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  if (options.executablePath !== undefined) {
    const explicit = resolve(options.executablePath);
    if (!usableFile(explicit)) {
      throw new PlaywrightAdapterError(
        "OPENRILL_CHROMIUM_EXECUTABLE_INVALID",
        `configured Chromium executable is not a readable file: ${explicit}`,
      );
    }
    return { executablePath: explicit, source: "explicit" };
  }
  for (const candidate of pathCandidates(env, platform)) {
    if (usableFile(candidate)) return { executablePath: resolve(candidate), source: "path" };
  }
  for (const candidate of systemCandidates(env, platform)) {
    if (usableFile(candidate)) return { executablePath: resolve(candidate), source: "system" };
  }
  throw new PlaywrightAdapterError(
    "OPENRILL_CHROMIUM_EXECUTABLE_NOT_FOUND",
    "no supported Chromium, Chrome, or Edge executable was found; configure browser.executablePath",
  );
}
