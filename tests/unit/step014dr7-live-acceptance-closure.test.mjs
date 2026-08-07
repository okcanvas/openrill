import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("all audited live HTTP fixtures use the bounded loopback client instead of Node fetch", async () => {
  for (const path of [
    "scripts/run-step011-live.mjs",
    "scripts/run-step012d-live.mjs",
    "scripts/run-step014d-live.mjs",
    "scripts/run-step014dr6-external-model-live.mjs",
    "scripts/run-step014dr6-deterministic-nested-ui-live.mjs",
    "scripts/live-vue-static.mjs",
  ]) {
    const source = await read(path);
    assert.match(source, /live-loopback-http\.mjs/, path);
    const executableFetch = source.split(/\r?\n/).filter((line) => /\bfetch\s*\(/.test(line) && !line.includes("response.end(`"));
    assert.deepEqual(executableFetch, [], path);
  }
});

test("the DR6 deterministic module response is fully consumed before Chromium and Host cleanup", async () => {
  const source = await read("scripts/run-step014dr6-deterministic-nested-ui-live.mjs");
  assert.match(source, /getLoopbackText\(new URL\(entry,uiBase\)/);
  assert.match(source, /module\.text\.includes\("delegation\.list"\)/);
  assert.doesNotMatch(source, /const module=await fetch/);
});

test("bounded loopback transport owns timeout byte limit connection close and request evidence", async () => {
  const source = await read("scripts/live-loopback-http.mjs");
  for (const token of [
    "agent: false",
    '"accept-encoding": "identity"',
    'connection: "close"',
    "request.setTimeout",
    "LIVE_HTTP_BODY_TOO_LARGE",
    "OPENRILL_LIVE_HTTP_START",
    "OPENRILL_LIVE_HTTP_END",
  ]) assert.ok(source.includes(token), token);
});

test("machine lifecycle audit passes the complete STEP014 live fixture inventory", () => {
  const result = spawnSync("python", ["scripts/check_live_acceptance_lifecycle.py"], {
    cwd: new URL("../../", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /OPENRILL_LIVE_ACCEPTANCE_LIFECYCLE_AUDIT_PASS/);
});

test("DR7 retains product schema Tool Protocol and delegation runtime surfaces", async () => {
  const migrations = await read("packages/state/src/migrations.ts");
  const tools = await read("packages/tools-delegation/src/index.ts");
  const registry = await read("services/agent-host/src/transport/operation-registry.ts");
  assert.match(migrations, /OPENRILL_STATE_SCHEMA_VERSION = (?:1[4-9]|[2-9]\d+) as const/);
  for (const name of ["agent.spawn", "agent.wait"]) assert.ok(tools.includes(name));
  for (const name of ["delegation.list", "delegation.get", "delegation.cancel"]) assert.ok(registry.includes(name));
});
