import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const verifier = join(root, "scripts", "verify_workspace_lock_alignment.py");
const linkVerifier = join(root, "scripts", "verify_workspace_module_links.py");

function runVerifier(targetRoot) {
  return spawnSync("python", [verifier, "--root", targetRoot], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
}

test("current workspace manifests and pnpm importers are exact", async () => {
  let manifestCount = 1;
  for (const group of ["apps", "services", "packages", "connectors", "skills"]) {
    const entries = await readdir(join(root, group), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        await readFile(join(root, group, entry.name, "package.json"), "utf8");
        manifestCount += 1;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  const result = runVerifier(root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const match = result.stdout.match(/OPENRILL_WORKSPACE_LOCK_ALIGNMENT_PASS importers=(\d+)/);
  assert.ok(match, result.stdout);
  assert.equal(Number(match[1]), manifestCount);
});

test("missing workspace dependency in lock importer fails with bounded evidence", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "openrill-lock-alignment-"));
  try {
    await mkdir(join(fixture, "services", "agent-host"), { recursive: true });
    await writeFile(join(fixture, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }) + "\n", "utf8");
    await writeFile(
      join(fixture, "services", "agent-host", "package.json"),
      JSON.stringify({ name: "@fixture/host", version: "1.0.0", dependencies: { "@fixture/browser": "workspace:*" } }) + "\n",
      "utf8",
    );
    await writeFile(
      join(fixture, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n  services/agent-host:\n    dependencies: {}\n\npackages: {}\n",
      "utf8",
    );
    const result = runVerifier(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /OPENRILL_WORKSPACE_LOCK_ALIGNMENT_FAIL/);
    assert.match(result.stdout, /services\/agent-host:missing=@fixture\/browser/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("pnpm script execution rejects stale dependency state instead of implicit install", async () => {
  const workspace = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
  assert.match(workspace, /^verifyDepsBeforeRun: error$/m);
  assert.doesNotMatch(workspace, /^verifyDepsBeforeRun: install$/m);
});


test("workspace module links resolve inside the current validation root", () => {
  const result = spawnSync("python", [linkVerifier, "--root", root], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /OPENRILL_WORKSPACE_MODULE_LINKS_PASS .*root_owned=true/);
});
