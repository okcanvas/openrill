import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("STEP016C retained governance preserves its immutable Windows acceptance evidence", async () => {
  const evidence = await read("reference/validation/STEP016C_WINDOWS_MULTI_TURN_LIVE_ACCEPTANCE.md");
  assert.match(evidence, /checks=97\/97/);
  assert.match(evidence, /4768f5e082e60f4304245eecf91c9a68fda5e1a4490d5240d58a743b27bc54f2/);
});

test("STEP016C CLI attaches through authenticated protocol and preserves Host ownership", async () => {
  const cli = await read("apps/agent-cli/src/index.ts");
  const session = await read("apps/agent-cli/src/conversation-session.ts");
  const client = await read("apps/agent-cli/src/local-protocol-client.ts");
  assert.match(cli, /conversation\.execute/);
  assert.match(cli, /--conversation-id/);
  assert.match(cli, /conversation list/);
  assert.match(cli, /conversation show/);
  assert.match(session, /RUNNING_ATTACHED/);
  assert.match(session, /ownedHost\?\.close/);
  assert.match(client, /credential: \{ kind: "profile-token"/);
  assert.match(client, /PROTOCOL_HOST_IDENTITY_MISMATCH/);
});

test("STEP016C protocol execute is closed, bounded and terminal", async () => {
  const operations = await read("packages/protocol/src/conversation-operations.ts");
  const validation = await read("packages/protocol/src/validation.ts");
  const registry = await read("services/agent-host/src/transport/operation-registry.ts");
  const lifecycle = await read("services/agent-host/src/lifecycle.ts");
  assert.match(operations, /ConversationExecuteInput/);
  assert.match(validation, /validateConversationExecuteInput/);
  assert.match(validation, /1000,900000/);
  assert.match(registry, /name: "conversation\.execute"/);
  assert.match(lifecycle, /executeUntilTerminal/);
  assert.match(lifecycle, /existing Conversation execution cannot replace modelProfile or title/);
});

test("STEP016C Product tests prove ephemeral restart and running Host attachment", async () => {
  const product = await read("tests/unit/local-multi-turn-step016c.test.mjs");
  assert.match(product, /across separate ephemeral Host lifecycles/);
  assert.match(product, /attaches to a READY running Host/);
  assert.match(product, /preserves it/);
  assert.match(product, /messages\.length, 4/);
  assert.match(product, /cross-workspace continuation/);
});

test("STEP016C Windows promotion is deterministic and excludes browser/external systems", async () => {
  const live = await read("scripts/run-step016c-local-multi-turn-live.mjs");
  assert.match(live, /OPENRILL_STEP016C_WINDOWS_DPAPI_REQUIRED/);
  assert.match(live, /RUNNING_ATTACHED/);
  assert.match(live, /history-users/);
  assert.match(live, /host-preserved/);
  assert.match(live, /cleanup=QUIESCENT/);
  assert.doesNotMatch(live, /api\.openai\.com|chromium|playwright/i);
});

test("STEP016C keeps prompts and secrets off argv and preserves Connector deferral", async () => {
  const cli = await read("apps/agent-cli/src/index.ts");
  const plan = await read("docs/plans/STEP016C_LOCAL_MULTI_TURN_CONTINUATION_AND_RUNNING_HOST_ATTACHMENT.md");
  assert.match(cli, /requires a non-empty prompt on stdin/);
  assert.doesNotMatch(cli.replaceAll("--api-key-stdin", ""), /--api-key(?:=|\s|\")/);
  assert.match(plan, /no Connector or Mattermost implementation/);
  assert.match(plan, /no external or paid model acceptance/);
  assert.match(plan, /no browser/);
});

test("OR-ISSUE-208 recurrence sweep includes retained STEP016B governance", async () => {
  const historical = await read("tests/unit/validation-governance-step016b.test.mjs");
  assert.doesNotMatch(historical, /assert\.equal\(baseline\.step,\s*["']STEP016AR1/);
  const evidence = await read("reference/validation/STEP016B_OR_ISSUE_208.md");
  assert.match(evidence, /STEP016C recurrence interception/);
});

test("STEP016C retained evidence preserves its H2 harness semantics", async () => {
  const evidence = await read("reference/validation/STEP016C_H2_HARNESS_ACCEPTANCE.md");
  assert.match(evidence, /STEP016C_H2_AUTHORIZED_HISTORY_SECRET_REDACTION_ALIGNMENT/);
  assert.match(evidence, /explicit authenticated `conversation show` history/);
});


test("OR-ISSUE-210 retains the historical manifest identity lesson without owning current identity", async () => {
  const evidence = await read("reference/validation/STEP016C_OR_ISSUE_210.md");
  assert.match(evidence, /generator/);
  assert.match(evidence, /verifier/);
});

test("OR-ISSUE-211 retains the historical atomic identity lesson without owning current baseline", async () => {
  const evidence = await read("reference/validation/STEP016C_OR_ISSUE_211.md");
  assert.match(evidence, /artifact\/zip, SHA, evidence, and dimensions/);
});

test("OR-ISSUE-212 keeps exact current and accepted identities in every root handoff document", async () => {
  const manifest = JSON.parse(await read("PACKAGE_MANIFEST.json"));
  const baseline = JSON.parse(await read("config/current-accepted-baseline.json"));
  for (const file of ["README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"]) {
    const body = await read(file);
    assert.match(body, new RegExp(manifest.step), file);
    assert.match(body, new RegExp(baseline.step), file);
    assert.match(body, new RegExp(baseline.checks.replace("/", "\\/")), file);
    assert.match(body, new RegExp(baseline.zipSha256), file);
  }
  for (const file of ["reference/validation/STEP016C_OR_ISSUE_212.md", "docs/governance/ENGINEERING_ISSUE_REGISTRY.md", "docs/testing/RECURRENCE_PREVENTION_GATES.md", "HANDOFF.md"]) {
    assert.match(await read(file), /OR-ISSUE-212/);
  }
});

