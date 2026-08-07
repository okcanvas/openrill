import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const STEP = "STEP022A_LOCAL_EXTENSION_PACKAGE_CONTRACT_AND_RUNTIME_REGISTRY";
const VERSION = "0.22.0-step022a";
const BASELINE = "STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE";
const BASELINE_SHA = "4f763933b37235b2ed7f87f1c1922fc934fdf80bb4135b8e37b12b274f1a1ed5";

test("STEP022A preserves its immutable package identity while STEP021BR2 remains the accepted Product baseline", async () => {
  const contract = JSON.parse(await read("config/step022a-live-marker-contract.json"));
  const packageScript = await read("scripts/package_step022a.py");
  const baseline = JSON.parse(await read("config/current-accepted-baseline.json"));
  assert.equal(contract.step, STEP); assert.equal(contract.version, VERSION); assert.match(packageScript, new RegExp(STEP)); assert.match(packageScript, /0\.22\.0-step022a/);
  assert.equal(baseline.step, BASELINE); assert.equal(baseline.version, "0.21.3-step021br2");
  assert.equal(baseline.checks, "82/82"); assert.equal(baseline.stateSchema, 24); assert.equal(baseline.zipSha256, BASELINE_SHA);
  assert.match(await read(baseline.evidence), /WINDOWS_TAP_SUMMARY_LIVE=PASSED/);
});

test("STEP022A Extension SDK is a closed contract without durable state authority", async () => {
  const pkg = JSON.parse(await read("packages/extension-sdk/package.json"));
  const types = await read("packages/extension-sdk/src/types.ts");
  const validation = await read("packages/extension-sdk/src/validation.ts");
  assert.equal(pkg.dependencies["@openrill/config"], "workspace:*");
  assert.equal(pkg.dependencies["@openrill/connectors"], "workspace:*");
  assert.match(types, /OPENRILL_EXTENSION_MANIFEST_SCHEMA_VERSION = 1/);
  assert.match(types, /OPENRILL_EXTENSION_API_VERSION = 1/);
  for (const kind of ["connector", "provider", "skill-source", "tool"]) assert.match(types, new RegExp(kind));
  assert.match(validation, /extension manifest must be a closed object/);
  assert.match(validation, /additionalProperties !== false/);
  assert.doesNotMatch(types + validation, /@openrill\/(state|tasks|task-flows|goals|goal-executor|conversations)/);
});

test("STEP022A Host registry owns deterministic bounded lifecycle and exact capability ownership", async () => {
  const body = await read("services/agent-host/src/extension-runtime.ts");
  assert.match(body, /class LocalExtensionRuntimeRegistry/);
  assert.match(body, /\.sort\(\)/); assert.match(body, /deepFreeze\(structuredClone/);
  assert.match(body, /validateExtensionCapability/); assert.match(body, /missingClaims/);
  assert.match(body, /withTimeout/); assert.match(body, /#activeCapabilityOwners/);
  assert.match(body, /views\.length > 0/); assert.match(body, /state === "DISCOVERED"/);
  assert.match(body, /ExtensionModuleContractError/); assert.match(body, /error instanceof ExtensionModuleContractError/);
  assert.doesNotMatch(body, /error\.code === "MODULE_INVALID"/);
});

test("STEP022A Config and SecretRef boundary rejects literal secret materialization", async () => {
  const types = await read("packages/config/src/types.ts");
  const schema = await read("packages/config/src/schema.ts");
  const secrets = await read("packages/config/src/secrets.ts");
  assert.match(types, /readonly extensions/); assert.match(types, /SecretReference/);
  assert.match(schema, /extensions/); assert.match(schema, /roots/); assert.match(schema, /enabled/); assert.match(schema, /settings/);
  assert.match(secrets, /config\.extensions\.settings/);
  assert.doesNotMatch(types, /literalSecret|secretValue/);
});

test("STEP022A Local Protocol exposes exactly four closed Extension lifecycle operations", async () => {
  const validation = await read("packages/protocol/src/validation.ts");
  const registry = await read("services/agent-host/src/transport/operation-registry.ts");
  for (const op of ["extension.list", "extension.get", "extension.enable", "extension.disable"]) assert.match(registry, new RegExp(op.replace(".", "\\.")));
  assert.match(validation, /validateExtensionListInput/); assert.match(validation, /validateExtensionGetInput/);
  assert.match(validation, /validateExtensionEnableInput/); assert.match(validation, /validateExtensionDisableInput/);
});

test("STEP022A focused tests cover contract lifecycle security protocol and Host restart", async () => {
  const files = ["extension-contract-step022a.test.mjs", "extension-runtime-step022a.test.mjs", "extension-protocol-step022a.test.mjs", "extension-host-step022a.test.mjs"];
  let count = 0; let combined = "";
  for (const file of files) { const body = await read(`tests/unit/${file}`); combined += body; count += [...body.matchAll(/^test\(/gm)].length; }
  assert.equal(count, 14);
  for (const phrase of ["without fake capabilities", "resolved only during activation", "activation timeout", "cannot spoof Host module-contract errors", "four exact Extension operations", "restarts without duplicate registration"]) assert.match(combined, new RegExp(phrase));
});

test("STEP022A records the OpenClaw answer-key audit and all observed failures independently", async () => {
  const audit = await read("docs/research/STEP022A_OPENCLAW_EXTENSION_PACKAGE_AND_RUNTIME_REGISTRY_AUDIT.md");
  assert.match(audit, /2026\.7\.2/); assert.match(audit, /1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82/);
  assert.match(audit, /COPYING=NONE/); assert.match(audit, /no repository, Run, Task, Flow, or state authority/i);
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (let number = 307; number <= 321; number += 1) {
    const token = `OR-ISSUE-${number}`;
    assert.match(registry, new RegExp(token)); assert.match(gates, new RegExp(number === 307 ? "STEP022A Local Extension gate" : "STEP022A Local Extension gate"));
    assert.match(await read(`reference/validation/STEP022A_OR_ISSUE_${number}.md`), new RegExp(token));
  }
  assert.match(gates, /Fresh source ZIP validation never runs build-dependent export imports before install\/build/);
  const acceptance = await read("scripts/run_step022a_acceptance.py");
  assert.ok(acceptance.indexOf("workspace-build") < acceptance.indexOf("exports"));
  assert.match(await read("scripts/package_step022a.py"), /EXCLUDED_DIRS=.*dist/);
  assert.match(await read("reference/validation/STEP022A_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md"), /export verification is build-dependent/i);
});

test("STEP022A immutable evidence retains exact historical and accepted identities without owning current root headers", async () => {
  for (const file of ["docs/plans/STEP022A_LOCAL_EXTENSION_PACKAGE_CONTRACT_AND_RUNTIME_REGISTRY.md", "reference/validation/STEP022A_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md", "config/step022a-live-marker-contract.json"]) {
    const body = await read(file);
    assert.match(body, new RegExp(STEP)); assert.match(body, /0\.22\.0-step022a/);
  }
  const baseline = JSON.parse(await read("config/current-accepted-baseline.json"));
  assert.equal(baseline.step, BASELINE); assert.equal(baseline.checks, "82/82"); assert.equal(baseline.zipSha256, BASELINE_SHA);
});

test("STEP022A package entrypoints and 43-check Windows contract are exact", async () => {
  const scripts = JSON.parse(await read("package.json")).scripts;
  assert.equal(scripts["acceptance:step022a"], "python scripts/run_step022a_acceptance.py");
  assert.equal(scripts["acceptance:step022a:live"], "python scripts/run_step022a_acceptance.py --require-windows-extension-live");
  assert.equal(scripts["windows-extension-live:step022a"], "node scripts/run-step022a-windows-extension-live.mjs");
  assert.equal(scripts["package:step022a"], "python scripts/package_step022a.py --output ../openrill-step022a-local-extension-package-contract-runtime-registry-v1.zip");
  const contract = JSON.parse(await read("config/step022a-live-marker-contract.json"));
  assert.equal(contract.step, STEP); assert.equal(contract.version, VERSION); assert.equal(contract.schema, 24);
  assert.equal(contract.expectedChecks, "43/43"); assert.equal(contract.liveHarness, "STEP022A_H1_LOCAL_EXTENSION_PACKAGE_RUNTIME_RESTART");
});

test("STEP022A Windows Harness requires real dynamic import SecretRef protocol lifecycle and duplicate-free restart", async () => {
  const body = await read("scripts/run-step022a-windows-extension-live.mjs");
  assert.match(body, /process\.platform !== "win32"/); assert.match(body, /OpenRill STEP022A Live/);
  assert.match(body, /openrill\.extension\.json/); assert.match(body, /STEP022A_WINDOWS_TOKEN/);
  for (const op of ["extension.list", "extension.get", "extension.enable", "extension.disable"]) assert.match(body, new RegExp(op.replace(".", "\\.")));
  assert.match(body, /second-sequence/); assert.match(body, /restart-no-duplicate/); assert.match(body, /checks\.length === 43/);
});
