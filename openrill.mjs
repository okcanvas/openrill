#!/usr/bin/env node

import { isBuiltin } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SUPPORTED_RANGE = ">=22.16.0 <23 or >=24.0.0";
const MINIMUM_NODE_22 = { major: 22, minor: 16, patch: 0 };

export function parseVersion(raw) {
  const [major = "0", minor = "0", patch = "0"] = raw.split(".");
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

function atLeast(current, minimum) {
  if (current.major !== minimum.major) return current.major > minimum.major;
  if (current.minor !== minimum.minor) return current.minor > minimum.minor;
  return current.patch >= minimum.patch;
}

export function inspectRuntime(nodeVersion = process.versions.node) {
  const parsed = parseVersion(nodeVersion);
  const versionSupported = parsed.major === 22 ? atLeast(parsed, MINIMUM_NODE_22) : parsed.major >= 24;
  const sqliteAvailable = isBuiltin("node:sqlite");
  return { versionSupported, sqliteAvailable, supportedRange: SUPPORTED_RANGE };
}

export function ensureSupportedRuntime() {
  const result = inspectRuntime();
  if (result.versionSupported && result.sqliteAvailable) return;
  process.stderr.write(
    `openrill: Node.js ${result.supportedRange} with node:sqlite is required ` +
      `(current: v${process.versions.node}, sqlite: ${result.sqliteAvailable}).\n`,
  );
  process.exit(1);
}

async function main() {
  ensureSupportedRuntime();
  const cli = await import("./apps/agent-cli/dist/index.js");
  const exitCode = await cli.runCli(process.argv.slice(2), {
    stdout: (message) => process.stdout.write(`${message}\n`),
    stderr: (message) => process.stderr.write(`${message}\n`),
  });
  process.exitCode = exitCode;
}

export function isDirectExecution(moduleUrl = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) return false;
  return moduleUrl === pathToFileURL(resolve(argv1)).href;
}

if (isDirectExecution()) await main();
