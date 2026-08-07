import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CONTROL_UI_MODULE_ENTRYPOINT,
  controlUiAssetRelativePath,
  controlUiModuleEntrypointFromHtml,
} from "../../scripts/control-ui-static-contract.mjs";
import { createLifecycleRequestHandler } from "../../services/agent-host/dist/index.js";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

async function listen(server) {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return server.address().port;
}

async function close(server) { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }

test("Control UI index owns exactly one canonical module entrypoint", async () => {
  const html = await read("apps/agent-web/public/index.html");
  assert.equal(controlUiModuleEntrypointFromHtml(html), CONTROL_UI_MODULE_ENTRYPOINT);
  assert.equal(CONTROL_UI_MODULE_ENTRYPOINT, "/assets/web/browser-app.js");
});

test("Control UI module contract rejects missing, duplicate, mismatched, and unsafe entrypoints", () => {
  assert.throws(() => controlUiModuleEntrypointFromHtml("<html></html>"), /ENTRYPOINT_COUNT:0/);
  assert.throws(() => controlUiModuleEntrypointFromHtml('<script type="module" src="/assets/a.js"></script><script type="module" src="/assets/b.js"></script>'), /ENTRYPOINT_COUNT:2/);
  assert.throws(() => controlUiModuleEntrypointFromHtml('<script type="module" src="/assets/app.js"></script>'), /ENTRYPOINT_MISMATCH/);
  assert.throws(() => controlUiAssetRelativePath("/assets/../private.js"), /ENTRYPOINT_INVALID/);
});

test("workspace build and live acceptance consume the shared entrypoint contract", async () => {
  const build = await read("scripts/workspace-runner.mjs");
  const live = await read("scripts/run-step014d-live.mjs");
  assert.match(build, /controlUiModuleEntrypointFromHtml\(indexHtml\)/);
  assert.match(build, /controlUiAssetRelativePath\(CONTROL_UI_MODULE_ENTRYPOINT\)/);
  assert.match(live, /controlUiModuleEntrypointFromHtml\((?:await indexResponse\.text\(\)|indexResponse\.text)\)/);
  assert.match(live, /new URL\(servedEntrypoint,uiBase\)/);
  assert.doesNotMatch(live, /\/assets\/app\.js/);
});

test("Host serves the canonical built module path with JavaScript content type", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step014dr5-static-"));
  const relative = controlUiAssetRelativePath();
  await mkdir(join(root, ...relative.split("/").slice(0, -1)), { recursive: true });
  await writeFile(join(root, "index.html"), `<!doctype html><script type="module" src="${CONTROL_UI_MODULE_ENTRYPOINT}"></script>`, "utf8");
  await writeFile(join(root, ...relative.split("/")), "export const ready=true;", "utf8");
  let port = 0;
  const status = () => ({ product: "OpenRill", version: "test", profile: "test", pid: process.pid, instanceId: "i", bind: "127.0.0.1", port, startedAt: new Date().toISOString(), state: "READY", readiness: true });
  const server = createServer(createLifecycleRequestHandler({ controlToken: "c", protocolToken: "p", controlUiRoot: root, getStatus: status, requestStop: () => true }));
  try {
    port = await listen(server);
    const base = `http://127.0.0.1:${port}`;
    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    assert.equal(controlUiModuleEntrypointFromHtml(await index.text()), CONTROL_UI_MODULE_ENTRYPOINT);
    const module = await fetch(new URL(CONTROL_UI_MODULE_ENTRYPOINT, base));
    assert.equal(module.status, 200);
    assert.equal(module.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.match(await module.text(), /ready=true/);
  } finally { await close(server); await rm(root, { recursive: true, force: true }); }
});
