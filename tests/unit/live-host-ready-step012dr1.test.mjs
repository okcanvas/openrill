import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { waitForReadyHostMetadata } from "../../scripts/live-host-ready.mjs";

function fakeChild(exitCode = null) { return { exitCode }; }

test("live Host metadata wait ignores LISTENING and resolves only READY", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-ready-test-"));
  const metadataPath = join(root, "host.json");
  try {
    await writeFile(metadataPath, JSON.stringify({ state: "LISTENING", readiness: false, port: 1234 }), "utf8");
    const pending = waitForReadyHostMetadata({ metadataPath, child: fakeChild(), output: () => "", attempts: 40, delayMs: 5 });
    let resolved = false;
    void pending.then(() => { resolved = true; });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(resolved, false);
    await writeFile(metadataPath, JSON.stringify({ state: "READY", readiness: true, port: 1234 }), "utf8");
    assert.deepEqual(await pending, { state: "READY", readiness: true, port: 1234 });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("live Host metadata wait preserves bounded pre-READY diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-ready-fail-"));
  const metadataPath = join(root, "host.json");
  try {
    await writeFile(metadataPath, JSON.stringify({ state: "LISTENING", readiness: false, port: 9999 }), "utf8");
    await assert.rejects(
      waitForReadyHostMetadata({ metadataPath, child: fakeChild(), output: () => "host still starting", attempts: 2, delayMs: 1 }),
      /Host READY metadata timeout.*LISTENING.*host still starting/,
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});
