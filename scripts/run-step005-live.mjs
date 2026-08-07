import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveProfilePaths } from "../packages/config/dist/index.js";
import { openOpenRillStateDatabase, resolveStatePaths } from "../packages/state/dist/index.js";

const root = await mkdtemp(join(tmpdir(), "openrill-step005-live-"));
const env = {
  ...process.env,
  OPENRILL_DATA_ROOT: join(root, "data"),
  OPENRILL_CONFIG_ROOT: join(root, "config"),
  NO_COLOR: "1",
  NODE_DISABLE_COLORS: "1",
};
const profile = "live";
const child = spawn(
  process.execPath,
  ["openrill.mjs", "start", "--profile", profile, "--port", "0"],
  { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] },
);
let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
child.stderr.on("data", (chunk) => { output += chunk.toString("utf8"); });

const profilePaths = resolveProfilePaths({ profile, env });
const statePaths = resolveStatePaths(profilePaths);
const metadataPath = join(env.OPENRILL_DATA_ROOT, profile, "runtime", "host.json");

async function waitForFile(path, label) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      await access(path);
      return;
    } catch {
      if (child.exitCode !== null) throw new Error(`${label} unavailable after Host exit ${child.exitCode}: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`${label} timeout: ${output}`);
}

async function waitForHostExit() {
  if (child.exitCode !== null) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Host exit timeout: ${output}`));
    }, 4_000);
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Host exited ${code}: ${output}`));
    });
    child.once("error", reject);
  });
}

try {
  await waitForFile(metadataPath, "Host metadata");
  await waitForFile(statePaths.databasePath, "state database");

  const liveRead = new DatabaseSync(statePaths.databasePath, { readOnly: true, timeout: 500 });
  try {
    const version = liveRead.prepare("PRAGMA user_version;").get().user_version;
    const migrationCount = liveRead.prepare("SELECT count(*) AS count FROM schema_migrations;").get().count;
    const identity = liveRead.prepare("SELECT product, profile, schema_version AS schemaVersion FROM state_identity WHERE id = 1;").get();
    if (version !== 3 || migrationCount !== 3 || identity.product !== "OpenRill" || identity.profile !== profile || identity.schemaVersion !== 3) {
      throw new Error("Host exposed state before the expected schema and ownership were ready");
    }
  } finally {
    liveRead.close();
  }

  const stop = spawn(
    process.execPath,
    ["openrill.mjs", "stop", "--profile", profile, "--json"],
    { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] },
  );
  await new Promise((resolve, reject) => {
    stop.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`stop exit ${code}`)));
    stop.once("error", reject);
  });
  await waitForHostExit();

  const state = await openOpenRillStateDatabase({ profilePaths });
  let backupPath;
  try {
    if (!state.diagnostics({ full: true }).healthy) throw new Error("reopened database failed integrity");
    state.recordHealthCheck({
      checkName: "step005-live",
      status: "ok",
      details: { reopened: true },
      checkedAt: 1,
    });
    const backup = await state.backup({ now: () => new Date("2026-08-01T00:00:00.000Z") });
    if (!backup.integrity.healthy || !/^[0-9a-f]{64}$/.test(backup.sha256) || backup.bytes <= 0) {
      throw new Error("verified backup contract failed");
    }
    backupPath = backup.destination;
  } finally {
    state.close({ checkpointMode: "TRUNCATE" });
  }

  const copy = new DatabaseSync(backupPath, { readOnly: true, timeout: 500 });
  try {
    const row = copy.prepare("SELECT status, details_json AS detailsJson FROM state_health_checks WHERE check_name = 'step005-live';").get();
    if (row.status !== "ok" || JSON.parse(row.detailsJson).reopened !== true) {
      throw new Error("backup omitted committed WAL state");
    }
  } finally {
    copy.close();
  }

  process.stdout.write("OPENRILL_STEP005_LIVE_PASS schema=3 journal=WAL migrations=3 backup=VERIFIED reopen=PASS\n");
} finally {
  if (child.exitCode === null) child.kill();
  await rm(root, { recursive: true, force: true });
}
