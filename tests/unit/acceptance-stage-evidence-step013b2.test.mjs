import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("STEP013B2 persists complete stage output instead of retaining only a tail", async () => {
  const runner = await read("scripts/run_step013b2_acceptance.py");
  assert.match(runner, /STAGE_LOG_DIR = REPORT\.parent \/ "STEP013B2_STAGES"/);
  assert.match(runner, /persist_stage_output\(stage, result\.output\)/);
  assert.match(runner, /full_stage_log=/);
  assert.equal(runner.includes("output[-20000:]"), false);
  assert.equal(runner.includes("detail[-10000:]"), false);
});

test("STEP013B2 failure excerpt retains an early TAP failure and exact full log", () => {
  const script = String.raw`
import importlib.util
import json
import sys
from pathlib import Path

root = Path.cwd()
scripts = root / "scripts"
sys.path.insert(0, str(scripts))
spec = importlib.util.spec_from_file_location("step013b2_acceptance", scripts / "run_step013b2_acceptance.py")
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

payload = (
    "TAP version 13\n"
    "# Subtest: early deterministic failure\n"
    "not ok 1 - early deterministic failure\n"
    "  ---\n"
    "  error: exact synthetic cause\n"
    "  ...\n"
    + ("late-success-output\n" * 3000)
    + "# tests 290\n# pass 289\n# fail 1\n"
)
path = module.persist_stage_output("synthetic-evidence-fixture", payload)
excerpt = module.failure_excerpt("synthetic-evidence-fixture", payload)
exact = path.read_text(encoding="utf-8") == payload
path.unlink()
print(json.dumps({"excerpt": excerpt, "exact": exact, "length": len(excerpt)}))
`;
  const env = { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };
  const result = spawnSync("python", ["-c", script], {
    cwd: new URL("../../", import.meta.url),
    encoding: "utf8",
    env,
    shell: false,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.exact, true);
  assert.ok(parsed.length <= 20_000);
  assert.match(parsed.excerpt, /full_stage_log=.*synthetic-evidence-fixture\.log/);
  assert.match(parsed.excerpt, /not ok 1 - early deterministic failure/);
  assert.match(parsed.excerpt, /exact synthetic cause/);
  assert.match(parsed.excerpt, /# fail 1/);
});
