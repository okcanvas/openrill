import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateLiveOutputPrivacy } from "../../scripts/live-output-privacy.mjs";

test("STEP016C H2 separates secret redaction from authorized history visibility", () => {
  const result = evaluateLiveOutputPrivacy({
    secret: "private-key",
    prompts: ["first prompt", "second prompt"],
    transientOutputs: ["assistant result", "conversation list"],
    authorizedHistoryOutputs: ["first prompt\nassistant result\nsecond prompt"],
  });
  assert.deepEqual(result, {
    secretRedacted: true,
    promptsNotEchoedOutsideHistory: true,
    authorizedHistoryContainsPrompts: true,
  });
});

test("STEP016C H2 rejects a secret in any authorized or transient output", () => {
  const result = evaluateLiveOutputPrivacy({
    secret: "private-key", prompts: ["first prompt"], transientOutputs: ["ok"], authorizedHistoryOutputs: ["first prompt private-key"],
  });
  assert.equal(result.secretRedacted, false);
});

test("STEP016C H2 rejects prompt echo outside explicit history", () => {
  const result = evaluateLiveOutputPrivacy({
    secret: "private-key", prompts: ["first prompt"], transientOutputs: ["first prompt"], authorizedHistoryOutputs: ["first prompt"],
  });
  assert.equal(result.promptsNotEchoedOutsideHistory, false);
});

test("STEP016C H2 requires explicit conversation show history to contain both turns", () => {
  const result = evaluateLiveOutputPrivacy({
    secret: "private-key", prompts: ["first prompt", "second prompt"], transientOutputs: ["ok"], authorizedHistoryOutputs: ["first prompt only"],
  });
  assert.equal(result.authorizedHistoryContainsPrompts, false);
});

test("OR-ISSUE-214 and H2 identity remain visible in current assets", async () => {
  for (const path of [
    "../../scripts/run-step016c-local-multi-turn-live.mjs",
    "../../scripts/run_step016c_acceptance.py",
    "../../reference/validation/STEP016C_OR_ISSUE_214.md",
    "../../reference/validation/STEP016C_WINDOWS_MULTI_TURN_LIVE_ATTEMPT_2.md",
    "../../docs/governance/ENGINEERING_ISSUE_REGISTRY.md",
    "../../docs/testing/RECURRENCE_PREVENTION_GATES.md",
    "../../HANDOFF.md",
    "../../VALIDATION.md",
  ]) {
    const body = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(body, /OR-ISSUE-214|STEP016C_H2_AUTHORIZED_HISTORY_SECRET_REDACTION_ALIGNMENT/);
  }
});
