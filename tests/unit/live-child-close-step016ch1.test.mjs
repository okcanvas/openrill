import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { waitForChildClose } from "../../scripts/live-child-close.mjs";

class FakeChild extends EventEmitter {
  constructor({ exitCode = null, signalCode = null } = {}) {
    super();
    this.exitCode = exitCode;
    this.signalCode = signalCode;
  }
}

test("STEP016C H1 resolves when close was observed before listener registration", async () => {
  const child = new FakeChild({ exitCode: 0 });
  const result = await waitForChildClose(child, { label: "preclosed", timeoutMs: 100 });
  assert.deepEqual(result, { exitCode: 0, signal: null });
  assert.equal(child.listenerCount("close"), 0);
});

test("STEP016C H1 resolves a later close exactly once", async () => {
  const child = new FakeChild();
  const pending = waitForChildClose(child, { label: "later", timeoutMs: 100 });
  child.exitCode = 0;
  child.emit("close", 0, null);
  assert.deepEqual(await pending, { exitCode: 0, signal: null });
  assert.equal(child.listenerCount("close"), 0);
});

test("STEP016C H1 returns a bounded typed timeout", async () => {
  const child = new FakeChild();
  await assert.rejects(
    waitForChildClose(child, { label: "never", timeoutMs: 20 }),
    /OPENRILL_LIVE_CHILD_CLOSE_TIMEOUT:never:20/,
  );
  assert.equal(child.listenerCount("close"), 0);
});

test("STEP016C live fixture uses the race-safe close helper and progress markers", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../../scripts/run-step016c-local-multi-turn-live.mjs", import.meta.url), "utf8"),
  );
  assert.match(source, /waitForChildClose\(host\.child/);
  assert.doesNotMatch(source, /host\.child\.once\(["']close["']/);
  assert.match(source, /OPENRILL_STEP016C_LIVE_PHASE/);
});

test("OR-ISSUE-213 is retained in issue, gate and handoff assets", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const path of [
    "../../reference/validation/STEP016C_OR_ISSUE_213.md",
    "../../reference/validation/STEP016C_WINDOWS_MULTI_TURN_LIVE_ATTEMPT_1.md",
    "../../docs/governance/ENGINEERING_ISSUE_REGISTRY.md",
    "../../docs/testing/RECURRENCE_PREVENTION_GATES.md",
    "../../HANDOFF.md",
    "../../VALIDATION.md",
  ]) {
    const body = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(body, /OR-ISSUE-213/);
    if (path.includes("STEP016C_OR_ISSUE_213")) assert.match(body, /STEP016C_H1_PREOBSERVED_CHILD_CLOSE_ALIGNMENT/);
  }
});
