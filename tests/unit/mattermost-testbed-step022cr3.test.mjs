import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bytes = async (name) => await readFile(resolve(ROOT, name));
const textAscii = (value) => value.toString("ascii");
function assertCrLfOnly(value) {
  assert.ok(value.length >= 64);
  assert.ok(value.includes(Buffer.from("\r\n")));
  for (let i=0;i<value.length;i+=1) {
    if (value[i] === 0x0a) assert.equal(value[i-1], 0x0d, `bare LF at ${i}`);
    if (value[i] === 0x0d) assert.equal(value[i+1], 0x0a, `bare CR at ${i}`);
    assert.ok(value[i] < 0x80, `non-ASCII byte at ${i}`);
  }
}

test("STEP022CR3 primary CMD is non-empty CRLF ASCII and runs the live gate directly", async () => {
  const value = await bytes("start-and-run-step022c-live.cmd");
  assertCrLfOnly(value);
  const text = textAscii(value);
  assert.match(text, /^@echo off\r\nsetlocal\r\ncd \/d "%~dp0"\r\n/u);
  assert.match(text, /where pnpm >nul 2>nul/u);
  assert.match(text, /call pnpm install --frozen-lockfile/u);
  assert.match(text, /call pnpm mattermost:testbed:live/u);
  assert.doesNotMatch(text, /powershell|OpenRillRoot/u);
});

test("STEP022CR3 start stop reset CMD helpers are non-empty CRLF ASCII single-root commands", async () => {
  for (const name of ["start-mattermost-testbed.cmd","stop-mattermost-testbed.cmd","reset-mattermost-testbed.cmd"]) {
    const value = await bytes(name); assertCrLfOnly(value); const text = textAscii(value);
    assert.match(text, /cd \/d "%~dp0"/u); assert.match(text, /testbeds\\mattermost\\scripts\\testbed\.mjs/u);
    assert.doesNotMatch(text, /powershell|OpenRillRoot/u);
  }
});

test("STEP022CR3 keeps the PowerShell zero-argument path as an optional peer, not a CMD dependency", async () => {
  const value = (await bytes("start-and-run-step022c-live.ps1")).toString("utf8");
  assert.match(value, /pnpm install --frozen-lockfile/u);
  assert.match(value, /pnpm mattermost:testbed:live/u);
  assert.doesNotMatch(value, /param\s*\(|OpenRillRoot/u);
});

test("STEP022CR3 package scripts expose byte-contract acceptance and deterministic packaging", async () => {
  const pkg = JSON.parse((await bytes("package.json")).toString("utf8"));
  const packageScript = (await bytes("scripts/package_step022cr3.py")).toString("utf8");
  assert.match(packageScript, /PRODUCT_VERSION='0\.24\.0-step022c'/u);
  assert.equal(pkg.scripts["acceptance:step022cr3"], "python scripts/run_step022cr3_acceptance.py");
  assert.match(pkg.scripts["package:step022cr3"], /package_step022cr3\.py/u);
});
