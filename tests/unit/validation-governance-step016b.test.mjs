import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("STEP016B historical governance proves immutable Windows acceptance without owning the mutable current baseline", async () => {
  const baseline = JSON.parse(await read("config/current-accepted-baseline.json"));
  assert.equal(typeof baseline.step, "string");
  assert.equal(typeof baseline.checks, "string");
  assert.equal(typeof baseline.zipSha256, "string");
  const evidence = await read("reference/validation/STEP016B_WINDOWS_FIRST_RUN_LIVE_ACCEPTANCE.md");
  assert.match(evidence, /STEP016B_FIRST_RUN_MODEL_CONNECTIVITY_AND_LOCAL_CONVERSATION_FLOW/);
  assert.match(evidence, /WINDOWS_FIRST_RUN_68\/68/);
  assert.match(evidence, /0db9ba1bef4bedeb1513b199a7ec7fcfd932c5c0ba12676815d2cf579bf21d46/);
});

test("STEP016B ask keeps prompt and API-key bytes off argv and environment", async () => {
  const cli = await read("apps/agent-cli/src/index.ts");
  const live = await read("scripts/run-step016b-first-local-conversation-live.mjs");
  assert.match(cli, /read one prompt from stdin/i);
  assert.match(cli, /Prompt text is read from stdin/);
  assert.match(cli, /unknown option/);
  assert.doesNotMatch(cli.replaceAll("--api-key-stdin", ""), /--api-key(?:=|\s|\")/);
  assert.match(live, /child\.stdin\.end\(input, "utf8"\)/);
  assert.doesNotMatch(live, /OPENRILL_API_KEY|API_KEY\s*:/);
});

test("STEP016B Product path uses the actual Host, configured resolver and durable state", async () => {
  const host = await read("services/agent-host/src/lifecycle.ts");
  const resolver = await read("services/agent-host/src/model-resolver.ts");
  const cli = await read("apps/agent-cli/src/index.ts");
  assert.match(host, /executeConversation = async|const runConversation = async/);
  assert.match(host, /conversations\.create/);
  assert.match(host, /conversations\.send/);
  assert.match(host, /executeUntilTerminal/);
  assert.match(resolver, /createOpenAIResponsesAdapter/);
  assert.match(resolver, /osSecretProvider/);
  assert.match(cli, /conversation\.execute|await host\.runConversation/);
  assert.match(cli, /ask-complete/);
});

test("STEP016B retains typed model failure evidence", async () => {
  const kernel = await read("packages/agent-kernel/src/kernel.ts");
  const product = await read("tests/unit/first-local-conversation-step016b.test.mjs");
  assert.match(kernel, /error\.cause instanceof ModelAdapterError/);
  assert.match(kernel, /modelCause\?\.code/);
  assert.match(product, /MODEL_AUTH_FAILED/);
  assert.match(product, /sensitive-prompt-that-must-not-be-printed/);
});

test("STEP016B Windows promotion is loopback-only and proves durable lifecycle", async () => {
  const live = await read("scripts/run-step016b-first-local-conversation-live.mjs");
  assert.match(live, /server\.listen\(0, "127\.0\.0\.1"/);
  assert.match(live, /WINDOWS_CURRENT_USER/);
  assert.match(live, /openOpenRillStateDatabase/);
  assert.match(live, /ephemeral-host-closed/);
  assert.match(live, /external_model=NOT_RUN browser=NOT_RUN/);
  assert.doesNotMatch(live, /api\.openai\.com|chromium|playwright/i);
});

test("STEP016B plan excludes browser, external model and speculative Connector work", async () => {
  const plan = await read("docs/plans/STEP016B_FIRST_RUN_MODEL_CONNECTIVITY_AND_LOCAL_CONVERSATION_FLOW.md");
  const roadmap = await read("ROADMAP.md");
  assert.match(plan, /no external or paid model acceptance/);
  assert.match(plan, /no browser/);
  assert.match(plan, /no Connector or Mattermost implementation/);
  assert.match(roadmap, /deferred until an executable real system/);
});

test("STEP016B handoff preserves unresolved OR-ISSUE-190 and OR-ISSUE-191", async () => {
  const handoff = await read("HANDOFF.md");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (const issue of ["OR-ISSUE-190", "OR-ISSUE-191"]) {
    assert.match(handoff, new RegExp(issue));
    assert.match(registry, new RegExp(issue));
    assert.match(gates, new RegExp(issue));
  }
});

test("STEP016B current acceptance owns the current live fixture and no browser stage", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.equal(packageJson.scripts["first-run-live:step016b"], "node scripts/run-step016b-first-local-conversation-live.mjs");
  assert.equal(packageJson.scripts["acceptance:step016b:live"], "python scripts/run_step016b_acceptance.py --require-windows-first-run-live");
  const live = await read("scripts/run-step016b-first-local-conversation-live.mjs");
  assert.match(live, /STEP016B_FIRST_RUN_MODEL_CONNECTIVITY_AND_LOCAL_CONVERSATION_FLOW/);
  assert.match(live, /0\.16\.2-step016b/);
});


test("OR-ISSUE-208 removes exact mutable accepted-baseline ownership from historical governance", async () => {
  const files = [
    "tests/unit/validation-governance-step015b.test.mjs",
    "tests/unit/validation-governance-step016a.test.mjs",
    "tests/unit/validation-governance-step016b.test.mjs",
  ];
  for (const file of files) {
    const body = await read(file);
    assert.doesNotMatch(body, /assert\.equal\((?:accepted|current)\.step,\s*["']STEP0/);
  }
  for (const file of [
    "reference/validation/STEP016B_OR_ISSUE_208.md",
    "docs/governance/ENGINEERING_ISSUE_REGISTRY.md",
    "docs/testing/RECURRENCE_PREVENTION_GATES.md",
  ]) assert.match(await read(file), /OR-ISSUE-208/);
});

test("OR-ISSUE-209 preserves the STEP016B handoff continuity set", async () => {
  const handoff = await read("HANDOFF.md");
  for (const token of ["OR-ISSUE-190", "OR-ISSUE-191", "OR-ISSUE-206", "OR-ISSUE-207", "speculative", "real adapter contract"]) {
    assert.match(handoff, new RegExp(token, "i"));
  }
  for (const file of [
    "reference/validation/STEP016B_OR_ISSUE_209.md",
    "docs/governance/ENGINEERING_ISSUE_REGISTRY.md",
    "docs/testing/RECURRENCE_PREVENTION_GATES.md",
  ]) assert.match(await read(file), /OR-ISSUE-209/);
});
