import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("STEP013B3 migration 010 preserves old Artifact rows while adding Browser kinds", async () => {
  const migrations = await read("packages/state/src/migrations.ts");
  const migration = await read("packages/state/migrations/010_browser_artifact_kinds.sql");
  const currentSchema = Number(/OPENRILL_STATE_SCHEMA_VERSION = (\d+) as const/.exec(migrations)?.[1]);
  assert.ok(currentSchema >= 10);
  for (const kind of ["READ_OUTPUT", "SEARCH_OUTPUT", "FILE_CHANGE", "BROWSER_SCREENSHOT", "BROWSER_DOWNLOAD"]) assert.ok(migration.includes(`'${kind}'`));

  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE agent_runs (run_id TEXT PRIMARY KEY) STRICT;
    CREATE TABLE run_attempts (attempt_id TEXT PRIMARY KEY) STRICT;
    CREATE TABLE workspace_registrations (workspace_id TEXT PRIMARY KEY) STRICT;
    INSERT INTO agent_runs VALUES ('run');
    INSERT INTO run_attempts VALUES ('attempt');
    INSERT INTO workspace_registrations VALUES ('workspace');
    CREATE TABLE workspace_artifacts (
      artifact_id TEXT NOT NULL PRIMARY KEY, run_id TEXT NOT NULL, attempt_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('READ_OUTPUT', 'SEARCH_OUTPUT', 'FILE_CHANGE')), relative_path TEXT,
      operation TEXT NOT NULL, before_sha256 TEXT, after_sha256 TEXT, storage_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0), created_at INTEGER NOT NULL
    ) STRICT;
    INSERT INTO workspace_artifacts VALUES ('old','run','attempt','workspace','READ_OUTPUT',NULL,'READ',NULL,NULL,'/old',3,1);`);
    db.exec(migration);
    assert.equal(db.prepare("SELECT kind FROM workspace_artifacts WHERE artifact_id='old'").get().kind, "READ_OUTPUT");
    db.prepare("INSERT INTO workspace_artifacts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(
      "new", "run", "attempt", "workspace", "BROWSER_SCREENSHOT", null, "browser.screenshot", null, "sha", "/new", 4, 2,
    );
    assert.equal(db.prepare("SELECT kind FROM workspace_artifacts WHERE artifact_id='new'").get().kind, "BROWSER_SCREENSHOT");
  } finally { db.close(); }
});

test("Browser Runtime owns Artifacts and evidence while Playwright only captures provider-neutral observations", async () => {
  const runtime = await read("packages/browser-runtime/src/runtime.ts");
  const types = await read("packages/browser-runtime/src/types.ts");
  const adapter = await read("packages/browser-playwright/src/driver.ts");
  const artifacts = await read("packages/tools-files/src/artifacts.ts");
  const adapterManifest = JSON.parse(await read("packages/browser-playwright/package.json"));
  assert.equal(runtime.includes("playwright"), false);
  assert.equal(types.includes("playwright"), false);
  assert.equal(adapterManifest.dependencies["@openrill/tools-files"], undefined);
  assert.match(runtime, /artifacts\.recordScreenshot/);
  assert.match(runtime, /artifacts\.recordDownload/);
  assert.match(adapter, /page\.screenshot/);
  assert.match(adapter, /createReadStream\(\)/);
  assert.doesNotMatch(adapter, /writeFile|storagePath|artifactId/);
  assert.match(artifacts, /return \{ artifactId: saved\.artifactId, kind: "READ_OUTPUT" \}/);
  assert.match(artifacts, /return \{ artifactId: saved\.artifactId, kind: "SEARCH_OUTPUT" \}/);
  assert.match(artifacts, /return \{ artifactId: saved\.artifactId, kind: "FILE_CHANGE" \}/);
});

test("screenshot, download, and evidence surfaces are closed and bounded", async () => {
  const tools = await read("packages/browser-runtime/src/tools.ts");
  const runtime = await read("packages/browser-runtime/src/runtime.ts");
  const adapter = await read("packages/browser-playwright/src/driver.ts");
  const live = await read("scripts/run-step013b3-live.mjs");
  const names = [...tools.matchAll(/(?:registry\.register|register)\(tool\(\s*"(browser\.[a-z]+)"/g)].map((match) => match[1]);
  assert.equal(names.length, 15);
  for (const name of ["browser.screenshot", "browser.download", "browser.evidence"]) assert.ok(names.includes(name));
  assert.match(tools, /const SCREENSHOT_SCHEMA[\s\S]*additionalProperties: false/);
  assert.match(tools, /const DOWNLOAD_SCHEMA[\s\S]*additionalProperties: false/);
  assert.match(tools, /const EVIDENCE_SCHEMA[\s\S]*maximum: 100/);
  assert.doesNotMatch(tools, /outputPath|directory|fullPage/);
  assert.match(runtime, /8 \* 1024 \* 1024 - 64 \* 1024/);
  assert.match(await read("packages/tools-files/src/artifacts.ts"), /maxArtifactBytes \?\? 8 \* 1024 \* 1024/);
  assert.match(await read("packages/tools-files/src/artifacts.ts"), /safe === "source\.json" \|\| safe === "metadata\.json"/);
  assert.match(adapter, /fullPage: false/);
  assert.match(adapter, /MAX_ADAPTER_EVIDENCE_EVENTS = 200/);
  assert.match(adapter, /MAX_PAGE_TITLE_CHARS = 4_096/);
  assert.match(adapter, /public async title\(\): Promise<string> \{ return boundedText\(await this\.page\.title\(\), MAX_PAGE_TITLE_CHARS\); \}/);
  assert.equal((adapter.match(/this\.title\(\)/g) ?? []).length >= 2, true);
  assert.match(live, /LONG_PAGE_TITLE = "T"\.repeat\(5_000\)/);
  assert.match(live, /screenshotSource\.title\.length, 4_096/);
});

test("download policy validates before reading bytes and unexpected downloads remain cancelled", async () => {
  const runtime = await read("packages/browser-runtime/src/runtime.ts");
  const adapter = await read("packages/browser-playwright/src/driver.ts");
  const lifecycle = await read("services/agent-host/src/lifecycle.ts");
  const validateIndex = adapter.indexOf("await this.assertDownloadAllowed(url)");
  const readIndex = adapter.indexOf("await readDownloadBytes(download");
  assert.ok(validateIndex > 0 && validateIndex < readIndex);
  assert.match(runtime, /onDownload\(\(download: BrowserDownloadHandle\) => \{\s*void download\.cancel/s);
  assert.match(lifecycle, /download: "EXPLICIT_ARTIFACT_ONLY"/);
  assert.match(lifecycle, /\.\.\.\(artifacts \? \{ artifacts \} : \{\}\)/);
});

test("evidence excludes request headers and bodies and redacts URL credentials, query, and fragment", async () => {
  const adapter = await read("packages/browser-playwright/src/driver.ts");
  assert.match(adapter, /parsed\.username = ""/);
  assert.match(adapter, /parsed\.password = ""/);
  assert.match(adapter, /parsed\.hash = ""/);
  assert.match(adapter, /parsed\.search = "\?redacted"/);
  assert.doesNotMatch(adapter, /allHeaders|headersArray|postData|response\.body/);
  assert.match(adapter, /kind: "console"/);
  assert.match(adapter, /kind: "page_error"/);
  assert.match(adapter, /kind: "network"/);
});

test("historical Browser gates retain feature ownership without freezing current Tool count or schema", async () => {
  const b1 = await read("tests/unit/browser-playwright-boundaries-step013b1.test.mjs");
  const b2 = await read("tests/unit/browser-interaction-boundaries-step013b2.test.mjs");
  const runtimeBoundary = await read("tests/unit/browser-runtime-boundaries-step013a.test.mjs");
  assert.match(b1, /currentSchema >= 9/);
  assert.match(b2, /registered\.slice\(0, 12\)/);
  assert.match(b2, /currentSchema >= 9/);
  assert.match(runtimeBoundary, /currentSchema >= 9/);
  assert.equal(b1.includes("OPENRILL_STATE_SCHEMA_VERSION = 9 as const"), false);
});
