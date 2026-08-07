import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const text = async (relative) => readFile(new URL(relative, root), "utf8");

test("STEP013B1 retained Browser Tool ownership without protocol operations or owning later schema changes", async () => {
  const migrations = await text("packages/state/src/migrations.ts");
  const migrationFiles = await readdir(new URL("packages/state/migrations/", root));
  const lifecycle = await text("services/agent-host/src/lifecycle.ts");
  const protocol = await text("services/agent-host/src/transport/operation-registry.ts");
  const currentSchema = Number(/OPENRILL_STATE_SCHEMA_VERSION = (\d+) as const/.exec(migrations)?.[1]);
  assert.ok(currentSchema >= 9);
  assert.ok(migrationFiles.some((name) => /^009_/.test(name)));
  assert.match(lifecycle, /registerBrowserTools\(tools, browserRuntime(?:,|\))/);
  assert.doesNotMatch(protocol, /browser\./);
});

test("Browser Runtime remains provider-neutral while the separate adapter owns Playwright", async () => {
  const manifest = JSON.parse(await text("packages/browser-runtime/package.json"));
  const allDependencies = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies };
  assert.equal(Object.keys(allDependencies).some((name) => /playwright|puppeteer|openclaw/i.test(name)), false);
  const adapter = JSON.parse(await text("packages/browser-playwright/package.json"));
  assert.equal(adapter.dependencies["playwright-core"], "1.62.0");
  assert.equal(adapter.dependencies["@openrill/browser-runtime"], "workspace:*");
  const architecture = JSON.parse(await text("config/package-boundaries.json"));
  assert.deepEqual(architecture.rules.forbiddenProductDependencies, ["openclaw", "@openclaw/"]);
});

test("Host Browser driver preflight occurs before lock and Browser drain occurs before SQLite close", async () => {
  const source = await text("services/agent-host/src/lifecycle.ts");
  const preflight = source.indexOf("Browser executable preflight failed before profile lock acquisition");
  const lock = source.indexOf("const lock = await acquireHostLock");
  const browserDrain = source.indexOf("browserRuntime?.close()");
  const stateClose = source.indexOf("stateDatabase.close({ checkpointMode: \"TRUNCATE\" })");
  assert.ok(preflight > 0 && preflight < lock);
  assert.ok(browserDrain > 0 && browserDrain < stateClose);
  assert.match(source, /Promise\.allSettled\(\[\s*browserRuntime\?\.close\(\)/);
});

test("Browser actor lifecycle owns single-flight, generation invalidation, limits, and bounded close", async () => {
  const source = await text("packages/browser-runtime/src/runtime.ts");
  for (const contract of [
    "#launchPromise",
    "#generation += 1",
    "BROWSER_SESSION_LIMIT",
    "BROWSER_PAGE_LIMIT",
    "BROWSER_STALE_HANDLE",
    "BROWSER_LAUNCH_TIMEOUT",
    "Promise.race([operation, interruption])",
    "this.#state = \"CLOSING\"",
    "await Promise.allSettled([...this.#operations])",
  ]) assert.ok(source.includes(contract), contract);
  assert.doesNotMatch(source, /timer\.unref\(\).*BROWSER_OPERATION_TIMEOUT/s);
});

test("navigation policy blocks credential and unsafe/private URL classes", async () => {
  const source = await text("packages/browser-runtime/src/policy.ts");
  assert.match(source, /SAFE_NON_NETWORK_URLS = new Set\(\["about:blank"\]\)/);
  assert.match(source, /parsed\.username \|\| parsed\.password/);
  assert.match(source, /BROWSER_NAVIGATION_BLOCKED/);
  assert.match(source, /isPrivateNetworkAddress/);
  assert.match(source, /resolved\.some/);
});

test("OpenClaw answer-sheet evidence is pinned and differences are explicit", async () => {
  const audit = await text("reference/validation/STEP013A_OPENCLAW_BROWSER_REFERENCE_AUDIT.md");
  for (const token of [
    "1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82",
    "ff05731045d75a5c72f00d508eba85f78722e99816583025c9effd6bd687cd56",
    "234d6e522fd68ae28c4268d8c572ed8ba1deade6cad2abcce91cb83253e49c44",
    "337b547ab0fa0a1e3f28402e124ff8b287b03c78004575d4a8ad23b243425b00",
    "REFERENCE_ANSWER_SHEET_NOT_PRODUCT_DEPENDENCY",
    "Deliberate OpenRill differences",
  ]) assert.ok(audit.includes(token), token);
});

test("accepted DR4 evidence and issues 077 through 080 are all retained", async () => {
  const accepted = await text("reference/validation/STEP012DR4_WINDOWS_LIVE_ACCEPTED.md");
  const registry = await text("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const recurrence = await text("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  assert.match(accepted, /checks=180\/180/);
  assert.match(accepted, /46097b9ec753b46741705823a5a9a67ab191d6fe3350db43f64e43b516807658/);
  for (const issue of ["OR-ISSUE-077", "OR-ISSUE-078", "OR-ISSUE-079", "OR-ISSUE-080"]) {
    assert.ok(registry.includes(issue), issue);
    assert.ok(recurrence.includes(issue) || recurrence.includes("STEP013A"), issue);
  }
});

test("current source and manifest identities align through the dedicated verifier", async () => {
  const current = JSON.parse(await text("package.json")).version;
  const result = spawnSync("python", ["scripts/verify_source_version_alignment.py"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`OPENRILL_SOURCE_VERSION_ALIGNMENT_PASS version=${current.replaceAll(".", "\\.")} manifests=\\d+ sources=\\d+ host_literals=3`), result.stdout);
});
