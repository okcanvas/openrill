import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = async (p) => await readFile(resolve(ROOT,p),"utf8");
test("STEP022CR3 records OR-ISSUE-372 and byte-verifies Windows CMD packaging", async () => {
  const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates=await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  const issue=await read("reference/validation/STEP022CR3_OR_ISSUE_372.md");
  const pack=await read("scripts/package_step022cr3.py");
  for (const body of [registry,gates,issue]) assert.match(body,/OR-ISSUE-372/u);
  assert.match(pack,/ZIP_CMD_BYTE_CONTRACT/u);
  assert.match(pack,/start-and-run-step022c-live\.cmd/u);
  assert.match(pack,/\\r\\n/u);
});
