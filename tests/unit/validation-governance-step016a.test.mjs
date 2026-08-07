import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("STEP016A immutable Windows Docker evidence survives later accepted-baseline promotion", async () => {
  const current = JSON.parse(await read("config/current-accepted-baseline.json"));
  const evidence = await read("reference/validation/STEP015B_WINDOWS_DOCKER_LIVE_ACCEPTANCE.md");
  assert.equal(current.acceptanceModel, "DIMENSIONAL");
  assert.match(evidence, /STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT/);
  assert.match(evidence, /WINDOWS_DOCKER_64\/64|checks=64\/64/);
  assert.match(evidence, /1990b189166a2547e0ae5aa81479591914b302e816bb088fd56e4a44f9ffd4db/);
});

test("STEP016A defers speculative Connector work until a real external-system contract exists", async () => {
  const roadmap = await read("ROADMAP.md");
  const handoff = await read("HANDOFF.md");
  const plan = await read("docs/plans/STEP016A_LOCAL_SETUP_DOCTOR_AND_WINDOWS_DPAPI_SECRET_FOUNDATION.md");
  for (const body of [roadmap, handoff, plan]) {
    assert.match(body, /Mattermost/i);
    assert.match(body, /speculative|real adapter contract|real API\/event environment|concrete adapter first/i);
  }
  assert.match(plan, /no Mattermost or Connector SDK/i);
});

test("STEP016A setup keeps API keys off argv and uses Windows DPAPI CurrentUser", async () => {
  const cli = await read("apps/agent-cli/src/index.ts");
  const operational = await read("apps/agent-cli/src/operational.ts");
  const osSecrets = await read("packages/config/src/os-secrets.ts");
  assert.doesNotMatch(cli, /--api-key(?:[=\s"])/);
  assert.match(cli, /--api-key-stdin/);
  assert.match(osSecrets, /ProtectedData/);
  assert.match(osSecrets, /DataProtectionScope\]::CurrentUser/);
  assert.match(osSecrets, /Read-Host -Prompt \$prompt -AsSecureString/);
  assert.match(osSecrets, /\[Console\]::In\.ReadToEnd\(\)/);
  assert.match(operational, /priorValue/);
  assert.match(operational, /OS secret rollback/);
});

test("STEP016A doctor checks local readiness without browser or paid model execution", async () => {
  const operational = await read("apps/agent-cli/src/operational.ts");
  const runner = await read("scripts/run_step016a_acceptance.py").catch(() => "");
  for (const token of ["config.source", "config.recovery", "model.providers", "secret.provider", "workspaces", "execution.backend"]) {
    assert.match(operational, new RegExp(token.replace(".", "\\.")));
  }
  if (runner) {
    const stages = runner.slice(runner.indexOf("BASE_STAGES:"), runner.indexOf("def read_utf8"));
    assert.doesNotMatch(stages, /chromium|playwright|control-ui|browser-live|external-model/i);
  }
});

test("STEP016A time ledger never invents human effort", async () => {
  const plan = await read("docs/plans/STEP016A_LOCAL_SETUP_DOCTOR_AND_WINDOWS_DPAPI_SECRET_FOUNDATION.md");
  assert.match(plan, /started_at=2026-08-05T06:09:00\+09:00/);
  assert.match(plan, /human_work_minutes=NOT_RECORDED/);
  assert.match(plan, /automated_run_seconds=(?:TO_BE_MEASURED|\d+\.\d+)/);
});

test("OR-ISSUE-204 prevents historical STEP015A tests from freezing the current accepted baseline", async () => {
  const historical = await read("tests/unit/validation-governance-step015a.test.mjs");
  const issue = await read("reference/validation/STEP016A_OR_ISSUE_204.md");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  assert.doesNotMatch(historical, /assert\.equal\(accepted\.step,\s*["']STEP014_PRODUCT_CORE_ACCEPTED["']\)/);
  for (const body of [issue, registry, gates]) assert.match(body, /OR-ISSUE-204/);
  assert.match(issue, /historical-test ownership/i);
});

test("OR-ISSUE-205 preserves unresolved assets and the dynamically current accepted baseline", async () => {
  const handoff = await read("HANDOFF.md");
  const accepted = JSON.parse(await read("config/current-accepted-baseline.json"));
  const issue = await read("reference/validation/STEP016A_OR_ISSUE_205.md");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (const token of ["OR-ISSUE-190", "OR-ISSUE-191", accepted.step, accepted.checks, accepted.zipSha256]) {
    assert.match(handoff, new RegExp(token.replaceAll("/", "\\/")));
  }
  for (const body of [issue, registry, gates]) assert.match(body, /OR-ISSUE-205/);
});
