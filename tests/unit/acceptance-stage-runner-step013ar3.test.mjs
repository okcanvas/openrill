import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const python = process.platform === "win32" ? "python" : "python3";
const helper = readFileSync(new URL("../../scripts/acceptance_stage_runner.py", import.meta.url), "utf8");
const acceptance = readFileSync(new URL("../../scripts/run_step013ar3_acceptance.py", import.meta.url), "utf8");

test("acceptance stage runner emits immediate stage progress and heartbeat contracts", () => {
  for (const token of [
    "OPENRILL_ACCEPTANCE_STAGE_START",
    "OPENRILL_ACCEPTANCE_STAGE_HEARTBEAT",
    "OPENRILL_ACCEPTANCE_STAGE_END",
    "flush=True",
  ]) {
    assert.match(helper, new RegExp(token));
  }
});

test("acceptance stage runner bounds a non-terminating child and reports timeout evidence", () => {
  const helperPath = fileURLToPath(new URL("../../scripts/acceptance_stage_runner.py", import.meta.url));
  const isolatedCwd = mkdtempSync(join(tmpdir(), "openrill-stage-runner-import-"));
  const script = [
    "from pathlib import Path",
    "import importlib.util, os, sys",
    "helper=Path(sys.argv[1]).resolve()",
    "spec=importlib.util.spec_from_file_location('openrill_acceptance_stage_runner', helper)",
    "module=importlib.util.module_from_spec(spec)",
    "sys.modules[spec.name]=module",
    "spec.loader.exec_module(module)",
    "r=module.run_stage(name='fixture-timeout', command=[sys.executable, '-c', 'import time; time.sleep(30)'], cwd=Path.cwd(), env=os.environ.copy(), timeout_seconds=0.4, heartbeat_seconds=0.1)",
    "print(f'RESULT timed_out={r.timed_out} ok={r.ok}')",
  ].join(";");
  try {
    const completed = spawnSync(python, ["-P", "-c", script, helperPath], {
      cwd: isolatedCwd,
      env: { ...process.env, PYTHONSAFEPATH: "1" },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(completed.status, 0, completed.stdout + completed.stderr);
    assert.match(completed.stdout, /OPENRILL_ACCEPTANCE_STAGE_START name=fixture-timeout/);
    assert.match(completed.stdout, /OPENRILL_ACCEPTANCE_STAGE_HEARTBEAT name=fixture-timeout/);
    assert.match(completed.stdout, /OPENRILL_ACCEPTANCE_STAGE_END name=fixture-timeout state=TIMEOUT/);
    assert.match(completed.stdout, /RESULT timed_out=True ok=False/);
  } finally {
    rmSync(isolatedCwd, { recursive: true, force: true });
  }
});

test("STEP013AR3 routes every external acceptance child through the bounded stage runner", () => {
  assert.doesNotMatch(acceptance, /subprocess\.run|subprocess\.Popen/);
  assert.match(acceptance, /from acceptance_stage_runner import run_stage/);
  assert.match(acceptance, /STAGE_TIMEOUTS/);
  for (const stage of [
    "source-version-alignment",
    "workspace-lock-alignment",
    "workspace-module-links",
    "focused-build",
    "focused-browser-runtime",
    "canonical-suite",
    "package-manifest-final",
  ]) {
    assert.match(acceptance, new RegExp(`stage=\\"${stage}\\"`));
  }
});

test("STEP013AR3 cleanup announces progress before repository scanning", () => {
  const main = acceptance.indexOf("def main()");
  const start = acceptance.indexOf('OPENRILL_ACCEPTANCE_STAGE_START name=cleanup', main);
  const clean = acceptance.indexOf("clean()", start);
  assert.ok(start >= 0);
  assert.ok(clean > start);
  assert.match(acceptance, /OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS/);
});
