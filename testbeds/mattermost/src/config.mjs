import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaults = Object.freeze({
  MATTERMOST_IMAGE: "mattermost/mattermost-team-edition:11.7.7",
  POSTGRES_IMAGE: "postgres:18-alpine",
  MATTERMOST_PORT: "8065",
  POSTGRES_USER: "mmuser",
  POSTGRES_PASSWORD: "openrill_mm_local_db_password",
  POSTGRES_DB: "mattermost",
  MATTERMOST_ADMIN_EMAIL: "openrill-admin@example.test",
  MATTERMOST_ADMIN_USERNAME: "openrill-admin",
  MATTERMOST_ADMIN_PASSWORD: "OpenRill-Admin-Local-Only-2026!",
  MATTERMOST_USER_EMAIL: "openrill-user@example.test",
  MATTERMOST_USER_USERNAME: "openrill-user",
  MATTERMOST_USER_PASSWORD: "OpenRill-User-Local-Only-2026!",
  MATTERMOST_TEAM_NAME: "openrill-live",
  MATTERMOST_TEAM_DISPLAY_NAME: "OpenRill Live",
  MATTERMOST_CHANNEL_NAME: "openrill-agent-live",
  MATTERMOST_CHANNEL_DISPLAY_NAME: "OpenRill Agent Live"
});

function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) throw new Error("MATTERMOST_TESTBED_ENV_LINE_INVALID");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key)) throw new Error("MATTERMOST_TESTBED_ENV_KEY_INVALID");
    values[key] = value;
  }
  return values;
}

export async function loadTestbedConfig(root, env = process.env) {
  let fileValues = {};
  try { fileValues = parseEnv(await readFile(resolve(root, ".env"), "utf8")); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const value = { ...defaults, ...fileValues };
  for (const key of Object.keys(defaults)) if (typeof env[key] === "string" && env[key].trim()) value[key] = env[key].trim();
  const port = Number(value.MATTERMOST_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("MATTERMOST_TESTBED_PORT_INVALID");
  for (const key of ["MATTERMOST_ADMIN_USERNAME", "MATTERMOST_USER_USERNAME", "MATTERMOST_TEAM_NAME", "MATTERMOST_CHANNEL_NAME"])
    if (!/^[a-z][a-z0-9-]{2,63}$/u.test(value[key])) throw new Error(`MATTERMOST_TESTBED_IDENTIFIER_INVALID:${key}`);
  for (const key of ["MATTERMOST_ADMIN_PASSWORD", "MATTERMOST_USER_PASSWORD", "POSTGRES_PASSWORD"])
    if (value[key].length < 12) throw new Error(`MATTERMOST_TESTBED_SECRET_TOO_SHORT:${key}`);
  return Object.freeze({ ...value, baseUrl: `http://127.0.0.1:${port}`, apiBase: `http://127.0.0.1:${port}/api/v4` });
}

export function composeEnv(config) {
  return Object.fromEntries(Object.entries(config).filter(([key, value]) => /^[A-Z]/u.test(key) && typeof value === "string"));
}

export { parseEnv };
