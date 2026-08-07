import test from "node:test";
import assert from "node:assert/strict";
import { parseCliOptions } from "../../apps/agent-cli/dist/index.js";

test("foundation commands remain available after STEP002", () => {
  assert.equal(parseCliOptions([]).command, "help");
  assert.equal(parseCliOptions(["--version"]).command, "version");
  assert.equal(parseCliOptions(["start"]).command, "start");
});
