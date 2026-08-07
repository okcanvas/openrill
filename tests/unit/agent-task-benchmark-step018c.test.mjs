import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url);

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/run-agent-task-benchmark.mjs", ...args], {
      cwd: ROOT,
      env: { ...process.env, NO_COLOR: "1", NODE_DISABLE_COLORS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

test("STEP018C benchmark list exposes exactly the ten repo-backed agent-core scenarios", async () => {
  const result = await run(["--profile", "agent-core", "--list"]);
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/u);
  assert.equal(lines.length, 10);
  assert.equal(lines.some((line) => line.startsWith("agent-memory-preference-recall\t")), true);
  assert.equal(lines.some((line) => line.startsWith("agent-delegation-scope-preserved\t")), true);
});

test("STEP018C real local benchmark passes ten scenarios and emits share-safe artifacts", async () => {
  const output = await mkdtemp(join(tmpdir(), "openrill-step018c-benchmark-test-"));
  try {
    const result = await run(["--profile", "agent-core", "--repetitions", "1", "--output-dir", output]);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /checks=10\/10 state=PASSED/);
    assert.match(result.stdout, /provider=SCRIPTED_LOCAL/);
    const json = await readFile(join(output, "result.json"), "utf8");
    const markdown = await readFile(join(output, "report.md"), "utf8");
    const parsed = JSON.parse(json);
    assert.equal(parsed.scenarioCount, 10);
    assert.equal(parsed.attemptCount, 10);
    assert.equal(parsed.reliability, 1);
    for (const artifact of [json, markdown]) {
      assert.equal(artifact.includes("STEP018C_FAKE_SECRET"), false);
      assert.equal(artifact.includes("STEP018C_DIAGNOSTIC_SECRET"), false);
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("STEP018C approval scenario creates authoritative Workspace provenance before approval", async () => {
  const source = await readFile(new URL("scripts/agent-task-benchmark-scenarios.mjs", ROOT), "utf8");
  const approval = source.slice(source.indexOf("async function approvalDenialStop"), source.indexOf("async function taskFollowthroughStatus"));
  assert.match(approval, /createWorkspaceCatalog/);
  assert.match(approval, /repositories\.workspaces\.upsertWorkspace/);
  assert.match(approval, /WAITING_APPROVAL/);
  assert.match(approval, /executed === 0/);
});

test("STEP018C temporal model-request evidence is snapshotted before Agent Kernel mutation", async () => {
  const source = await readFile(new URL("scripts/agent-task-benchmark-scenarios.mjs", ROOT), "utf8");
  assert.match(source, /const snapshotRequest = \(request\) => JSON\.parse\(JSON\.stringify/);
  assert.equal((source.match(/requests\.push\(snapshotRequest\(request\)\)/g) ?? []).length >= 3, true);
  assert.match(source, /toolCallId === "describe"/);
});
