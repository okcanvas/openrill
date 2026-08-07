import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publishAgentProgressNotices } from "../../services/agent-host/dist/run-coordinator.js";

test("approval.requested publishes both run.event and approval.updated in order", () => {
  const published = [];
  const request = {
    requestId: "approval-step011r8",
    runId: "run-step011r8",
    status: "PENDING",
    version: 1,
    toolName: "process.run",
    decision: null,
  };
  publishAgentProgressNotices((topic, data) => published.push({ topic, data }), {
    runId: "run-step011r8",
    type: "approval.requested",
    data: request,
  });
  assert.deepEqual(published.map((entry) => entry.topic), ["run.event", "approval.updated"]);
  assert.deepEqual(published[1].data, request);
});

test("ordinary progress and malformed approval payloads do not emit approval.updated", () => {
  const published = [];
  const publish = (topic, data) => published.push({ topic, data });
  publishAgentProgressNotices(publish, { runId: "run-1", type: "model.text_delta", data: { delta: "x" } });
  publishAgentProgressNotices(publish, { runId: "run-1", type: "approval.requested", data: { status: "PENDING" } });
  assert.deepEqual(published.map((entry) => entry.topic), ["run.event", "run.event"]);
});

test("Control UI reloads approval.list only from the explicit approval domain notice", async () => {
  const [browser, coordinator, live] = await Promise.all([
    readFile(new URL("../../apps/agent-web/src/browser-app.ts", import.meta.url), "utf8"),
    readFile(new URL("../../services/agent-host/src/run-coordinator.ts", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/run-step011-live.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(browser, /if \(notice\.topic === "approval\.updated"\) await loadApprovals\(\)/);
  assert.match(coordinator, /publishNotice\("approval\.updated", \{ \.\.\.event\.data, runId: event\.runId \}\)/);
  assert.match(live, /OPENRILL_APPROVAL_WAIT_EVIDENCE_BEGIN/);
  assert.doesNotMatch(browser, /notice\.topic === "run\.event"[^\n]*loadApprovals/);
});
