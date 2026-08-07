import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (relative) => readFile(resolve(root, relative), "utf8");

test("STEP011 actual browser derives the current State schema owner", async () => {
  const source = await read("scripts/run-step011-live.mjs");
  assert.match(source, /import \{ OPENRILL_STATE_SCHEMA_VERSION \} from "\.\.\/packages\/state\/dist\/index\.js"/);
  assert.match(source, /identity\.schemaVersion !== OPENRILL_STATE_SCHEMA_VERSION/);
  assert.match(source, /schema=\$\{OPENRILL_STATE_SCHEMA_VERSION\}/);
  assert.doesNotMatch(source, /identity\.schemaVersion !== 8/);
  assert.doesNotMatch(source, /OPENRILL_STEP011_LIVE_PASS schema=8/);
});

test("active historical Python runners derive SCHEMA from State source", async () => {
  for (const relative of [
    "scripts/run_step011_acceptance.py",
    "scripts/run_step012ar1_acceptance.py",
    "scripts/run_step012b_acceptance.py",
    "scripts/run_step012br1_acceptance.py",
  ]) {
    const source = await read(relative);
    assert.match(source, /OPENRILL_STATE_SCHEMA_VERSION = \(\\d\+\) as const/, relative);
    assert.doesNotMatch(source, /^SCHEMA = 8$/m, relative);
  }
});

test("STEP012C migration 009 remains exact without freezing later State schema ownership", async () => {
  const migrations = await read("packages/state/src/migrations.ts");
  const migration = await read("packages/state/migrations/009_automation_protocol_run_linkage.sql");
  const currentSchema = Number(/OPENRILL_STATE_SCHEMA_VERSION = (\d+) as const/.exec(migrations)?.[1]);
  assert.ok(currentSchema >= 9);
  const migrationFiles = await import("node:fs/promises").then(({ readdir }) => readdir(resolve(root, "packages/state/migrations")));
  assert.ok(migrationFiles.filter((name) => name.endsWith(".sql")).length >= 9);
  assert.ok(migrationFiles.includes("009_automation_protocol_run_linkage.sql"));
  assert.match(migration, /ADD COLUMN trigger_kind/);
  assert.match(migration, /ADD COLUMN request_key/);
  assert.match(migration, /CREATE UNIQUE INDEX idx_automation_runs_manual_request/);
});

test("accepted STEP012BR1 evidence remains historical schema 8", async () => {
  const accepted = await read("reference/validation/STEP012BR1_WINDOWS_LIVE_ACCEPTED.md");
  assert.match(accepted, /schema=8/);
  assert.match(accepted, /checks=187\/187/);
  assert.match(accepted, /b90721d4d24f7467355f1f2dcd7e94d65f03517a7f60ff8208fa0c915f6ccbde/);
});
