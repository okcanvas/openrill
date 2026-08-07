import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  applyNotice,
  applySnapshot,
  createLongTranscript,
  createProjection,
  moveCardSelection,
  reconnectPlan,
  replayFixture,
  resolveApprovalLocally,
  validateProjection,
  virtualWindow,
} from "../../apps/agent-web/spikes/shared/workload.mjs";
import { assertAccessibleDescriptor, viewDescriptor } from "../../apps/agent-web/spikes/shared/dom-contract.mjs";
import {
  applyControlUiNotice,
  createControlUiProjection,
  getControlUiReconnectPlan,
} from "../../apps/agent-web/dist/index.js";

const root = new URL("../../", import.meta.url);
const fixture = JSON.parse(await readFile(new URL("apps/agent-web/spikes/shared/fixture.json", root), "utf8"));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

test("shared fixture has stable identity and hash", () => {
  assert.equal(fixture.fixtureId, "openrill-control-ui-step010a-v1");
  assert.equal(createHash("sha256").update(canonical(fixture)).digest("hex").length, 64);
});

test("stream tool approval artifact and unknown event project in sequence", () => {
  const { state, outcomes } = replayFixture(fixture);
  assert.deepEqual(outcomes, Array(fixture.notices.length).fill("APPLIED"));
  assert.equal(validateProjection(state), true);
  assert.equal(state.cursor, fixture.expected.finalCursor);
  assert.equal(state.run.status, "COMPLETED");
  assert.deepEqual(state.cards.map((card) => card.kind), fixture.expected.cardKinds);
  assert.equal(state.cards[0].text, "Hello OpenRill");
});

test("duplicates are ignored and sequence gaps require snapshot resync", () => {
  const duplicate = createProjection(fixture);
  assert.equal(applyNotice(duplicate, fixture.notices[0]).outcome, "APPLIED");
  assert.equal(applyNotice(duplicate, fixture.notices[0]).outcome, "DUPLICATE");
  const gap = createProjection(fixture);
  assert.equal(applyNotice(gap, fixture.notices[1]).outcome, "GAP");
  assert.deepEqual(reconnectPlan(gap), { cursor: 100, strategy: "SNAPSHOT_RESYNC" });
  applySnapshot(gap, fixture);
  assert.deepEqual(reconnectPlan(gap), { cursor: 100, strategy: "CURSOR_RESUME" });
});

test("approval decision is explicit and terminal in the projection", () => {
  const state = replayFixture(fixture).state;
  const card = resolveApprovalLocally(state, fixture.expected.approvalRequestId, "allow_once");
  assert.equal(card.status, "APPROVED");
  assert.equal(card.decision, "allow_once");
  assert.deepEqual(card.actions, []);
  assert.throws(() => resolveApprovalLocally(state, fixture.expected.approvalRequestId, "deny"), /not pending/);
});

test("ten-thousand-row transcript uses a bounded virtual window", () => {
  const transcript = createLongTranscript(10000);
  const window = virtualWindow(transcript, { scrollTop: 180000, viewportHeight: 720, rowHeight: 36, overscan: 5 });
  assert.equal(window.total, 10000);
  assert.equal(window.totalHeight, 360000);
  assert.ok(window.items.length <= 30);
  assert.ok(window.start > 0);
});

test("keyboard navigation and accessibility descriptor are deterministic", () => {
  const state = replayFixture(fixture).state;
  assert.equal(moveCardSelection(state, "next"), 0);
  assert.equal(moveCardSelection(state, "next"), 1);
  assert.equal(moveCardSelection(state, "previous"), 0);
  const descriptor = viewDescriptor(state);
  assert.equal(assertAccessibleDescriptor(descriptor), true);
  assert.equal(descriptor.cards.filter((card) => card.tabIndex === 0).length, 1);
});

test("Vue and Lit finalists consume the same fixture and DOM contracts", async () => {
  const [vue, lit] = await Promise.all([
    readFile(new URL("apps/agent-web/spikes/vue/app.mjs", root), "utf8"),
    readFile(new URL("apps/agent-web/spikes/lit/app.mjs", root), "utf8"),
  ]);
  for (const source of [vue, lit]) {
    assert.match(source, /shared\/workload\.mjs/);
    assert.match(source, /shared\/dom-contract\.mjs/);
    assert.match(source, /OpenRill Control UI/);
    assert.match(source, /Conversation transcript/);
    assert.match(source, /resolveApprovalLocally/);
    assert.match(source, /moveCardSelection/);
  }
});

test("finalist runtime versions are exact and production introduction remains STEP011", async () => {
  const lock = JSON.parse(await readFile(new URL("apps/agent-web/spikes/frameworks.lock.json", root), "utf8"));
  assert.equal(lock.finalists.vue.version, "3.5.40");
  assert.equal(lock.finalists.lit.version, "3.3.3");
  assert.equal(lock.runtimePackaging, "EXTERNAL_SPIKE_ONLY");
  assert.equal(lock.productionDependencyIntroduction, "STEP011");
});

test("decision matrix is hash-bound and selects Vue 3", async () => {
  const matrix = JSON.parse(await readFile(new URL("apps/agent-web/spikes/decision-matrix.json", root), "utf8"));
  const signature = matrix.matrixSha256;
  delete matrix.matrixSha256;
  assert.equal(createHash("sha256").update(canonical(matrix)).digest("hex"), signature);
  assert.equal(matrix.decision, "VUE_3");
  assert.equal(Object.values(matrix.weights).reduce((sum, value) => sum + value, 0), 100);
});


test("spike projection matches the exported framework-neutral package contract", () => {
  const exported = createControlUiProjection(fixture);
  for (const notice of fixture.notices) assert.equal(applyControlUiNotice(exported, notice).outcome, "APPLIED");
  const spike = replayFixture(fixture).state;
  assert.equal(exported.cursor, spike.cursor);
  assert.deepEqual(exported.cards.map((card) => card.kind), spike.cards.map((card) => card.kind));
  assert.equal(exported.cards.find((card) => card.kind === "text")?.text, spike.cards.find((card) => card.kind === "text")?.text);
  assert.deepEqual(getControlUiReconnectPlan(exported), { cursor: fixture.expected.finalCursor, strategy: "CURSOR_RESUME" });
});

test("framework code does not leak into Local Protocol client", async () => {
  const client = await readFile(new URL("apps/agent-web/src/api/local-protocol-client.ts", root), "utf8");
  assert.doesNotMatch(client, /(?:from|import\()\s*["'](?:vue|lit|react|svelte|solid-js)/);
  assert.match(client, /@openrill\/protocol/);
});
