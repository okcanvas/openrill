import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

export const CHROMIUM_EXECUTABLE_OVERRIDE_ENV = "OPENRILL_CHROMIUM_EXECUTABLE";
export const CHROMIUM_EXECUTABLE_NOT_FOUND = "OPENRILL_CHROMIUM_EXECUTABLE_NOT_FOUND";

function envValue(env, ...keys) {
  for (const key of keys) {
    const direct = env[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const match = Object.entries(env).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase());
    if (match && typeof match[1] === "string" && match[1].trim()) return match[1].trim();
  }
  return "";
}

function addCandidate(entries, seen, executable, source) {
  if (typeof executable !== "string" || !executable.trim()) return;
  const normalized = executable.trim();
  const key = normalized.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  entries.push({ executable: normalized, source });
}

function pathApi(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function pathCandidates({ platform, env }) {
  const targetPath = pathApi(platform);
  const pathValue = envValue(env, "PATH");
  if (!pathValue) return [];
  const separator = platform === "win32" ? ";" : path.delimiter;
  const commands = platform === "win32"
    ? ["chrome.exe", "msedge.exe", "chromium.exe", "chromium-browser.exe"]
    : ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge"];
  const entries = [];
  for (const directory of pathValue.split(separator).map((value) => value.trim()).filter(Boolean)) {
    for (const command of commands) entries.push(targetPath.join(directory, command));
  }
  return entries;
}

export function chromiumExecutableCandidates({ platform = process.platform, env = process.env, cwd = process.cwd() } = {}) {
  const entries = [];
  const seen = new Set();
  const targetPath = pathApi(platform);
  const override = envValue(env, CHROMIUM_EXECUTABLE_OVERRIDE_ENV);
  if (override) addCandidate(entries, seen, targetPath.isAbsolute(override) ? override : targetPath.resolve(cwd, override), "ENV_OVERRIDE");

  for (const executable of pathCandidates({ platform, env })) addCandidate(entries, seen, executable, "PATH");

  if (platform === "win32") {
    const programRoots = [
      envValue(env, "PROGRAMFILES"),
      envValue(env, "PROGRAMFILES(X86)"),
      envValue(env, "PROGRAMW6432"),
    ].filter(Boolean);
    const localAppData = envValue(env, "LOCALAPPDATA");
    for (const root of programRoots) {
      addCandidate(entries, seen, targetPath.join(root, "Google", "Chrome", "Application", "chrome.exe"), "WINDOWS_STANDARD");
      addCandidate(entries, seen, targetPath.join(root, "Microsoft", "Edge", "Application", "msedge.exe"), "WINDOWS_STANDARD");
      addCandidate(entries, seen, targetPath.join(root, "Chromium", "Application", "chrome.exe"), "WINDOWS_STANDARD");
    }
    if (localAppData) {
      addCandidate(entries, seen, targetPath.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"), "WINDOWS_USER");
      addCandidate(entries, seen, targetPath.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"), "WINDOWS_USER");
      addCandidate(entries, seen, targetPath.join(localAppData, "Chromium", "Application", "chrome.exe"), "WINDOWS_USER");
    }
  } else if (platform === "darwin") {
    const home = envValue(env, "HOME");
    for (const root of ["/Applications", home ? targetPath.join(home, "Applications") : ""].filter(Boolean)) {
      addCandidate(entries, seen, targetPath.join(root, "Google Chrome.app", "Contents", "MacOS", "Google Chrome"), "MACOS_STANDARD");
      addCandidate(entries, seen, targetPath.join(root, "Chromium.app", "Contents", "MacOS", "Chromium"), "MACOS_STANDARD");
      addCandidate(entries, seen, targetPath.join(root, "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"), "MACOS_STANDARD");
    }
  } else {
    for (const executable of [
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/microsoft-edge",
      "/snap/bin/chromium",
    ]) addCandidate(entries, seen, executable, "POSIX_STANDARD");
  }
  return entries;
}

export async function resolveChromiumExecutable({
  platform = process.platform,
  env = process.env,
  cwd = process.cwd(),
  accessFile = access,
} = {}) {
  const candidates = chromiumExecutableCandidates({ platform, env, cwd });
  for (const candidate of candidates) {
    try {
      await accessFile(candidate.executable, platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
      return { ...candidate, platform };
    } catch {
      // Try the next deterministic candidate.
    }
  }
  const error = new Error(`No Chromium-family browser executable found; set ${CHROMIUM_EXECUTABLE_OVERRIDE_ENV}`);
  error.code = CHROMIUM_EXECUTABLE_NOT_FOUND;
  error.platform = platform;
  const targetPath = pathApi(platform);
  const supportedBasenames = platform === "win32"
    ? ["chrome.exe", "msedge.exe", "chromium.exe", "chromium-browser.exe"]
    : ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge"];
  error.candidateBasenames = [...new Set([...candidates.map((candidate) => targetPath.basename(candidate.executable)), ...supportedBasenames])];
  throw error;
}


export function captureChildSpawnFailure(child, { executable, onDiagnostic = () => {} } = {}) {
  if (!child || typeof child.once !== "function") throw new TypeError("child process is required");
  const state = { failure: null };
  child.once("error", (error) => {
    state.failure = error;
    onDiagnostic(describeChromiumSpawnFailure(error, executable));
  });
  return state;
}

export function describeChromiumSpawnFailure(error, executable) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
  const message = error instanceof Error ? error.message : String(error);
  return `Chromium launch failed code=${code} executable=${JSON.stringify(executable)} message=${JSON.stringify(message)}`;
}
