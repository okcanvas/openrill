import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HOST_BIND, DEFAULT_HOST_PORT } from "../../services/agent-host/dist/index.js";

test("STEP002 Host defaults are loopback-only and explicit", () => {
  assert.equal(DEFAULT_HOST_BIND, "127.0.0.1");
  assert.equal(DEFAULT_HOST_PORT, 47117);
});
