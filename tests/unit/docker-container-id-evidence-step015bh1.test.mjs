import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDockerContainerId, sameDockerContainerId } from "../../scripts/lib/docker-container-id-evidence.mjs";

const FULL = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("STEP015B H1 normalizes Docker container IDs before evidence comparison", () => {
  assert.equal(normalizeDockerContainerId(`  ${FULL.toUpperCase()}\n`), FULL);
});

test("STEP015B H1 accepts Docker full-id and default short-id evidence as the same container", () => {
  assert.equal(sameDockerContainerId(FULL, FULL.slice(0, 12)), true);
  assert.equal(sameDockerContainerId(FULL.slice(0, 12), FULL), true);
});

test("STEP015B H1 rejects unrelated Docker container IDs", () => {
  assert.equal(sameDockerContainerId(FULL, `f${FULL.slice(1, 12)}`), false);
});

test("STEP015B H1 rejects unsafe or ambiguous short values", () => {
  assert.equal(sameDockerContainerId(FULL, FULL.slice(0, 11)), false);
  assert.equal(sameDockerContainerId(FULL, "not-a-container-id"), false);
});
