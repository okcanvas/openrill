import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./process-approval-step009.test.mjs", import.meta.url), "utf8");

test("background stdout observation uses bounded polling instead of a fixed 100ms sleep", () => {
  assert.match(source, /async function waitForProcessText\(/);
  assert.doesNotMatch(source, /setTimeout\(resolve, 100\)/);
});

test("background fixture deliberately delays first stdout beyond the former fixed wait", () => {
  assert.match(source, /setTimeout\(\(\)=>console\.log\('ready'\),250\)/);
});

test("bounded polling records terminal status and last tail on timeout", () => {
  assert.match(source, /status=\$\{lastStatus\}; tail=\$\{JSON\.stringify\(lastText\)\}/);
  assert.match(source, /\["STARTING", "RUNNING"\]\.includes\(lastStatus\)/);
});

test("cancel status is asserted synchronously without another timing sleep", () => {
  const block = source.slice(source.indexOf('test("background process can be listed'), source.indexOf('test("SecretRef'));
  assert.match(block, /cancelled\.output\.status, "CANCELLED"/);
  assert.doesNotMatch(block, /await new Promise/);
});
