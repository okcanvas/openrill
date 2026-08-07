import test from "node:test";
import assert from "node:assert/strict";
import { getWebFoundationContract } from "../../apps/agent-web/dist/index.js";

test("web foundation publishes measured Vue selection while runtime starts in STEP011", () => {
  assert.deepEqual(getWebFoundationContract(), {
    application: "OpenRill Control UI",
    frameworkSelection: "VUE_3",
    frameworkDecisionStep: "STEP010A",
    runtimeIntroducedAt: "STEP011",
    stateAccess: "LOCAL_PROTOCOL_ONLY",
    directDatabaseAccess: false,
  });
});
