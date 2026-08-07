import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyServedVueRuntime } from "../../scripts/live-vue-static.mjs";

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function listen(server) {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "openrill-vue-static-"));
  const runtime = Buffer.from("globalThis.Vue={version:'3.5.40'};".repeat(3000));
  const lock = Buffer.from(`${JSON.stringify({ version: "3.5.40", fileBytes: runtime.length, fileSha256: sha256(runtime) }, null, 2)}\n`);
  await writeFile(join(root, "vue.runtime.global.prod.js"), runtime);
  await writeFile(join(root, "vue.runtime.lock.json"), lock);
  return { root, runtime, lock };
}

test("served Vue runtime and lock must be byte-identical to the acquired vendor", async () => {
  const f = await fixture();
  const server = createServer((request, response) => {
    if (request.url === "/vendor/vue.runtime.global.prod.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" }); response.end(f.runtime); return;
    }
    if (request.url === "/vendor/vue.runtime.lock.json") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" }); response.end(f.lock); return;
    }
    response.writeHead(404, { "content-type": "application/json" }); response.end('{"error":"not_found"}');
  });
  try {
    const baseUrl = await listen(server);
    const result = await verifyServedVueRuntime({ baseUrl, vendorRoot: f.root });
    assert.equal(result.runtime.status, 200);
    assert.equal(result.runtime.sha256, sha256(f.runtime));
    assert.equal(result.lock.status, 200);
  } finally { await close(server); await rm(f.root, { recursive: true, force: true }); }
});

test("missing served Vue runtime fails before Chromium with bounded static evidence", async () => {
  const f = await fixture();
  const server = createServer((_request, response) => { response.writeHead(404, { "content-type": "application/json" }); response.end('{"error":"not_found"}'); });
  try {
    const baseUrl = await listen(server);
    await assert.rejects(
      verifyServedVueRuntime({ baseUrl, vendorRoot: f.root }),
      /Vue runtime static serving mismatch[\s\S]*OPENRILL_VUE_STATIC_EVIDENCE_BEGIN[\s\S]*"status": 404/,
    );
  } finally { await close(server); await rm(f.root, { recursive: true, force: true }); }
});

test("STEP012DR2 acceptance rebuilds the UI with the acquired vendor before live Chromium", async () => {
  const acceptance = await readFile(new URL("../../scripts/run_step012dr2_acceptance.py", import.meta.url), "utf8");
  const build = 'run_utf8(["node", "scripts/workspace-runner.mjs", "build"], env=runtime_env)';
  const live = 'run_utf8(["node", "scripts/run-step012d-live.mjs"], env=runtime_env)';
  assert.match(acceptance, /runtime_env = \{"OPENRILL_VUE_RUNTIME_VENDOR_DIR": str\(vendor_root\)\}/);
  assert.ok(acceptance.indexOf(build) >= 0);
  assert.ok(acceptance.indexOf(live) > acceptance.indexOf(build));
  assert.match(acceptance, /for file_name in \("vue\.runtime\.global\.prod\.js", "vue\.runtime\.lock\.json", "LICENSE\.vue\.txt"\)/);
  assert.match(acceptance, /built_path = dist_vendor_root \/ file_name/);
  assert.match(acceptance, /built_path\.read_bytes\(\) != source_path\.read_bytes\(\)/);
});

test("STEP012D live verifies the Host-served runtime before launching Chromium", async () => {
  const live = await readFile(new URL("../../scripts/run-step012d-live.mjs", import.meta.url), "utf8");
  const verify = "await verifyServedVueRuntime({ baseUrl: base, vendorRoot: vueVendorRoot });";
  const launch = "await launchBrowser(`${base}/#/automations`)";
  assert.match(live, /from "\.\/live-vue-static\.mjs"/);
  assert.ok(live.indexOf(verify) >= 0);
  assert.ok(live.indexOf(launch) > live.indexOf(verify));
});
