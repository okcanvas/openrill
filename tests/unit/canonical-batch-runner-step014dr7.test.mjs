import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "openrill-canonical-batches-"));
  const one = join(root, "one.test.mjs");
  const two = join(root, "two.test.mjs");
  await writeFile(one, 'import test from "node:test";import assert from "node:assert/strict";test("one",()=>assert.equal(1,1));\n');
  await writeFile(two, 'import test from "node:test";import assert from "node:assert/strict";test("two",()=>assert.equal(2,2));\n');
  return { root, one, two };
}

function run(args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ["scripts/run-canonical-unit-batches.mjs", ...args], { cwd: new URL("../../", import.meta.url), env, encoding: "utf8" });
}

test("canonical batch runner aggregates isolated TAP children exactly", async () => {
  const value = await fixture();
  try {
    const result = run(["--expected-tests", "2", "--batch-size", "1", value.one, value.two]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /OPENRILL_CANONICAL_BATCHES_PASS files=2 batches=2 tests=2 pass=2 fail=0 skipped=0/);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test("canonical batch runner rejects a total-count mismatch", async () => {
  const value = await fixture();
  try {
    const result = run(["--expected-tests", "3", value.one, value.two]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /OPENRILL_CANONICAL_TOTAL_MISMATCH/);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});
