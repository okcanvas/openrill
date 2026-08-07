import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyControlUiNotice,
  createControlUiProjection,
} from "../../apps/agent-web/dist/index.js";

function deepProxy(value, seen = new WeakMap()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  const proxy = new Proxy(value, {
    get(target, property, receiver) {
      return deepProxy(Reflect.get(target, property, receiver), seen);
    },
  });
  seen.set(value, proxy);
  return proxy;
}

test("projection accepts Vue-style reactive Proxy snapshots without DataCloneError", () => {
  const source = {
    conversation: { conversationId: "conversation-1", nested: { title: "Proxy source" } },
    run: { runId: "run-1", status: "RUNNING" },
    cards: [{ kind: "tool", id: "tool-1", raw: { nested: { value: 3 } } }],
  };
  const proxied = deepProxy(source);
  const projection = createControlUiProjection({
    fixtureId: "step011r6-proxy",
    initialCursor: 4,
    snapshot: {
      conversation: proxied.conversation,
      run: proxied.run,
      cards: proxied.cards,
    },
  });

  assert.equal(projection.conversation.conversationId, "conversation-1");
  assert.equal(projection.run.runId, "run-1");
  assert.equal(projection.cards[0]?.raw?.nested?.value, 3);
  source.conversation.nested.title = "mutated";
  source.cards[0].raw.nested.value = 9;
  assert.equal(projection.conversation.nested.title, "Proxy source");
  assert.equal(projection.cards[0]?.raw?.nested?.value, 3);
});

test("unknown Proxy notice payload remains visible and detached", () => {
  const source = { nested: { value: 7 } };
  const state = createControlUiProjection({
    fixtureId: "step011r6-notice",
    initialCursor: 0,
    snapshot: { conversation: {}, run: {}, cards: [] },
  });
  const result = applyControlUiNotice(state, {
    sequence: 1,
    notice: "future.notice",
    payload: deepProxy(source),
  });
  assert.equal(result.outcome, "APPLIED");
  assert.equal(state.cards[0]?.raw?.payload?.nested?.value, 7);
  source.nested.value = 11;
  assert.equal(state.cards[0]?.raw?.payload?.nested?.value, 7);
});

test("browser transport state uses shallowRef and projection owns Proxy-safe cloning", async () => {
  const [browser, projection] = await Promise.all([
    readFile(new URL("../../apps/agent-web/src/browser-app.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/agent-web/src/control-ui-projection.ts", import.meta.url), "utf8"),
  ]);
  for (const owner of ["bootstrap", "workspaces", "conversations", "conversation", "approvals", "artifacts", "diagnostics"]) {
    assert.match(browser, new RegExp(`const ${owner} = shallowRef`));
  }
  assert.match(browser, /const \{ createApp, ref, shallowRef, reactive, computed, onMounted, onBeforeUnmount, h \} = vue/);
  assert.match(projection, /function cloneProjectionValue\(value: unknown\): unknown/);
  assert.doesNotMatch(projection, /structuredClone/);
});
