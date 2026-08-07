import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("STEP016AR1 makes EncodedCommand the final PowerShell argument", async () => {
  const source = await read("packages/config/src/os-secrets.ts");
  assert.match(source, /"-EncodedCommand",\s*POWERSHELL_ENCODED_COMMAND/);
  assert.doesNotMatch(source, /"-Command",\s*POWERSHELL_SCRIPT/);
  assert.match(source, /OPENRILL_DPAPI_OPERATION/);
  assert.match(source, /OPENRILL_DPAPI_PATH/);
});

test("STEP016AR1 keeps secret input out of argv and child environment", async () => {
  const source = await read("packages/config/src/os-secrets.ts");
  assert.match(source, /this\.#executor\.run\(this\.#executable, args, input/);
  assert.doesNotMatch(source, /OPENRILL_DPAPI_SECRET/);
  assert.match(source, /\[Console\]::In\.ReadToEnd\(\)/);
  assert.match(source, /Read-Host -Prompt \$prompt -AsSecureString/);
});

test("OR-ISSUE-206 is connected to registry and recurrence gates", async () => {
  for (const relative of [
    "reference/validation/STEP016AR1_OR_ISSUE_206.md",
    "docs/governance/ENGINEERING_ISSUE_REGISTRY.md",
    "docs/testing/RECURRENCE_PREVENTION_GATES.md",
    "HANDOFF.md",
  ]) {
    assert.match(await read(relative), /OR-ISSUE-206/, relative);
  }
});
