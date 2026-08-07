import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const verifier = join(root, "scripts", "verify_workspace_module_links.py");

async function writeWorkspaceFixture(rootDir, { outside = false } = {}) {
  const packageA = join(rootDir, "packages", "a");
  const packageB = outside ? await mkdtemp(join(tmpdir(), "openrill-module-outside-")) : join(rootDir, "packages", "b");
  await mkdir(packageA, { recursive: true });
  await mkdir(packageB, { recursive: true });
  await writeFile(join(rootDir, "package.json"), JSON.stringify({ name: "fixture-root", version: "1.0.0" }) + "\n", "utf8");
  await writeFile(
    join(packageA, "package.json"),
    JSON.stringify({ name: "@openrill/a", version: "1.0.0", dependencies: { "@openrill/b": "workspace:*" } }) + "\n",
    "utf8",
  );
  await writeFile(join(packageB, "package.json"), JSON.stringify({ name: "@openrill/b", version: "1.0.0" }) + "\n", "utf8");
  const scope = join(packageA, "node_modules", "@openrill");
  await mkdir(scope, { recursive: true });
  await symlink(packageB, join(scope, "b"), process.platform === "win32" ? "junction" : "dir");
  return packageB;
}

function runVerifier(targetRoot) {
  return spawnSync("python", [verifier, "--root", targetRoot], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
}

test("package-local workspace links pass when the root scope is absent", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "openrill-module-layout-"));
  try {
    await writeWorkspaceFixture(fixture);
    const result = runVerifier(fixture);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /OPENRILL_WORKSPACE_MODULE_LINKS_PASS/);
    assert.match(result.stdout, /root_scope=absent/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("package-local workspace links outside the validation root are rejected", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "openrill-module-layout-"));
  let outside;
  try {
    outside = await writeWorkspaceFixture(fixture, { outside: true });
    const result = runVerifier(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /OPENRILL_WORKSPACE_MODULE_LINKS_FAIL/);
    assert.match(result.stdout, /outside_root/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
    if (outside) await rm(outside, { recursive: true, force: true });
  }
});

test("successful module-link evidence is layout-neutral while failures retain verifier output", async () => {
  const acceptance = await import("node:fs/promises").then(({ readFile }) => readFile(join(root, "scripts", "run_step013ar2_acceptance.py"), "utf8"));
  assert.match(acceptance, /"workspace_module_links_pass" if links_contract else links_output\.strip\(\)/);
});
