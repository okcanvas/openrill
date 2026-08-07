import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  closeServerAndWait,
  describeCleanupFailure,
  removeTreeWithRetries,
  terminateChildAndWait,
} from "../../scripts/live-fixture-cleanup.mjs";
import { createServer } from "node:http";

test("cleanup retries transient Windows EBUSY and preserves recursive force options", async () => {
  const calls = [];
  const sleeps = [];
  const remove = async (target, options) => {
    calls.push({ target, options });
    if (calls.length < 3) throw Object.assign(new Error("locked"), { code: "EBUSY" });
  };
  const result = await removeTreeWithRetries("fixture-root", {
    remove,
    attempts: 5,
    retryDelayMs: 7,
    sleep: async (value) => { sleeps.push(value); },
  });
  assert.deepEqual(result, { attempts: 3 });
  assert.deepEqual(sleeps, [7, 14]);
  assert.deepEqual(calls, [
    { target: "fixture-root", options: { recursive: true, force: true } },
    { target: "fixture-root", options: { recursive: true, force: true } },
    { target: "fixture-root", options: { recursive: true, force: true } },
  ]);
});

test("cleanup does not retry non-transient errors", async () => {
  let calls = 0;
  await assert.rejects(
    removeTreeWithRetries("fixture-root", {
      remove: async () => { calls += 1; throw Object.assign(new Error("denied"), { code: "EACCES" }); },
      attempts: 5,
      sleep: async () => assert.fail("non-transient cleanup must not sleep"),
    }),
    (error) => error?.code === "EACCES",
  );
  assert.equal(calls, 1);
});

test("child termination waits until the process exit event", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const result = await terminateChildAndWait(child, { label: "fixture-child", timeoutMs: 2_000 });
  assert.deepEqual(result, { state: "EXITED" });
  assert.notEqual(child.exitCode === null && child.signalCode === null, true);
});

test("server close is awaited and cleanup failures retain code plus message", async () => {
  const server = createServer((_request, response) => response.end("ok"));
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  await closeServerAndWait(server);
  assert.equal(server.listening, false);
  assert.equal(describeCleanupFailure(Object.assign(new Error("locked"), { code: "EBUSY" })), "EBUSY:locked");
});
