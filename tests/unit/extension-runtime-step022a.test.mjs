import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalExtensionRuntimeRegistry } from "../../services/agent-host/dist/extension-runtime.js";

function extensionManifest(id, capability, fields = []) {
  return {
    schemaVersion: 1,
    id,
    displayName: id,
    version: "1.0.0",
    entry: "index.mjs",
    compatibility: { apiVersion: 1, host: { minInclusive: "0.22.0-step022a", maxExclusive: "0.23.0" } },
    capabilities: [capability],
    configSchema: { additionalProperties: false, fields },
  };
}

async function createExtension(root, id, capability, source, fields = []) {
  const directory = join(root, id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "openrill.extension.json"), JSON.stringify(extensionManifest(id, capability, fields), null, 2));
  await writeFile(join(directory, "index.mjs"), source);
  return directory;
}

function runtimeOptions(root, roots, enabled, settings = {}, extra = {}) {
  return { hostVersion: "0.22.0-step022a", configRoot: root, roots, enabled, settings, env: {}, ...extra };
}

test("STEP022A runtime discovers deterministically, exposes a narrow context, and deactivates in reverse activation order", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022a-order-"));
  globalThis.__step022aEvents = [];
  try {
    await createExtension(root, "zeta.local", { kind: "tool", id: "zeta" }, `
      export default { activate(context) {
        let mutationBlocked = false;
        try { context.manifest.capabilities[0].id = "mutated"; } catch { mutationBlocked = true; }
        globalThis.__step022aEvents.push({ type: "activate", id: context.extensionId, keys: Object.keys(context).sort(), manifestFrozen: Object.isFrozen(context.manifest) && Object.isFrozen(context.manifest.capabilities), mutationBlocked });
        context.claimCapability({ kind: "tool", id: "zeta" });
        return { deactivate(reason) { globalThis.__step022aEvents.push({ type: "deactivate", id: context.extensionId, reason }); } };
      } };
    `);
    await createExtension(root, "alpha.local", { kind: "connector", id: "alpha" }, `
      export default { activate(context) {
        let mutationBlocked = false;
        try { context.manifest.capabilities[0].id = "mutated"; } catch { mutationBlocked = true; }
        globalThis.__step022aEvents.push({ type: "activate", id: context.extensionId, keys: Object.keys(context).sort(), manifestFrozen: Object.isFrozen(context.manifest) && Object.isFrozen(context.manifest.capabilities), mutationBlocked });
        context.claimCapability({ kind: "connector", id: "alpha" });
        return { deactivate(reason) { globalThis.__step022aEvents.push({ type: "deactivate", id: context.extensionId, reason }); } };
      } };
    `);
    const registry = new LocalExtensionRuntimeRegistry(runtimeOptions(root, ["zeta.local", "alpha.local"], ["zeta.local", "alpha.local"]));
    const started = await registry.startConfigured();
    assert.deepEqual(started.map((item) => [item.extensionId, item.state, item.activationSequence]), [
      ["alpha.local", "READY", 1],
      ["zeta.local", "READY", 2],
    ]);
    assert.deepEqual(globalThis.__step022aEvents.filter((item) => item.type === "activate").map((item) => item.id), ["alpha.local", "zeta.local"]);
    await registry.startConfigured();
    assert.deepEqual(globalThis.__step022aEvents.filter((item) => item.type === "activate").map((item) => item.id), ["alpha.local", "zeta.local"]);
    for (const event of globalThis.__step022aEvents.filter((item) => item.type === "activate")) {
      assert.deepEqual(event.keys, ["claimCapability", "config", "extensionId", "manifest", "resolveSecret", "signal"]);
      assert.equal(event.keys.some((key) => /run|task|flow|state|repository/i.test(key)), false);
      assert.equal(event.manifestFrozen, true);
      assert.equal(event.mutationBlocked, true);
    }
    await registry.close();
    assert.deepEqual(globalThis.__step022aEvents.filter((item) => item.type === "deactivate").map((item) => item.id), ["zeta.local", "alpha.local"]);
  } finally {
    delete globalThis.__step022aEvents;
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP022A configured duplicate capabilities are blocked before either module is imported", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022a-conflict-"));
  globalThis.__step022aImports = 0;
  try {
    const source = `globalThis.__step022aImports += 1; export default { activate(context) { context.claimCapability({ kind: "connector", id: "same" }); return { deactivate() {} }; } };`;
    await createExtension(root, "first.local", { kind: "connector", id: "same" }, source);
    await createExtension(root, "second.local", { kind: "connector", id: "same" }, source);
    const registry = new LocalExtensionRuntimeRegistry(runtimeOptions(root, ["first.local", "second.local"], ["first.local", "second.local"]));
    const views = await registry.startConfigured();
    assert.equal(globalThis.__step022aImports, 0);
    assert.deepEqual(views.map((item) => item.state), ["BLOCKED", "BLOCKED"]);
    assert.deepEqual(views.map((item) => item.issue.code), ["CAPABILITY_CONFLICT", "CAPABILITY_CONFLICT"]);
    const disabled = await registry.disable("first.local");
    assert.equal(disabled.state, "DISABLED");
    assert.equal(registry.get("second.local").state, "READY");
    assert.equal(globalThis.__step022aImports, 1);
    await assert.rejects(() => registry.enable("first.local"), (error) => error.code === "EXTENSION_STATE_INVALID");
    await registry.close();
  } finally {
    delete globalThis.__step022aImports;
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP022A invalid roots and escaping entries are blocked without fake capabilities or filesystem path disclosure", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022a-path-"));
  try {
    const outside = join(root, "outside.mjs");
    await writeFile(outside, "export default {};");
    const directory = join(root, "escape.local");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "openrill.extension.json"), JSON.stringify(extensionManifest("escape.local", { kind: "tool", id: "escape" })));
    await symlink(outside, join(directory, "index.mjs"));
    const missing = join(root, "private-missing-root");
    const registry = new LocalExtensionRuntimeRegistry(runtimeOptions(root, [missing, directory], []));
    const views = await registry.discover();
    assert.equal(views.length, 2);
    const invalid = views.find((item) => item.extensionId.startsWith("invalid-"));
    assert.ok(invalid);
    assert.deepEqual(invalid.capabilities, []);
    assert.equal(invalid.issue.message.includes(root), false);
    const escape = views.find((item) => item.extensionId === "escape.local");
    assert.equal(escape.state, "BLOCKED");
    assert.equal(escape.issue.code, "ENTRY_INVALID");
    assert.equal(escape.issue.message.includes(outside), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP022A required SecretRef availability is checked before import and resolved only during activation", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022a-secret-"));
  globalThis.__step022aSecrets = [];
  try {
    const fields = [{ key: "token", kind: "secret", required: true }];
    await createExtension(root, "secret.local", { kind: "provider", id: "secret" }, `
      export default { async activate(context) {
        globalThis.__step022aSecrets.push({ keys: Object.keys(context.config), token: await context.resolveSecret("token") });
        context.claimCapability({ kind: "provider", id: "secret" });
        return { deactivate() {} };
      } };
    `, fields);
    const settings = { "secret.local": { values: {}, secrets: { token: { kind: "env", key: "STEP022A_TOKEN" } } } };
    const blocked = new LocalExtensionRuntimeRegistry(runtimeOptions(root, ["secret.local"], ["secret.local"], settings));
    assert.equal((await blocked.startConfigured())[0].issue.code, "SECRET_UNAVAILABLE");
    assert.deepEqual(globalThis.__step022aSecrets, []);

    const ready = new LocalExtensionRuntimeRegistry(runtimeOptions(root, ["secret.local"], ["secret.local"], settings, { env: { STEP022A_TOKEN: "runtime-secret" } }));
    assert.equal((await ready.startConfigured())[0].state, "READY");
    assert.deepEqual(globalThis.__step022aSecrets, [{ keys: [], token: "runtime-secret" }]);
    assert.equal(JSON.stringify(ready.list()).includes("runtime-secret"), false);
    await ready.close();
  } finally {
    delete globalThis.__step022aSecrets;
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP022A activation failure is isolated and runtime disable-enable creates one new lifecycle without duplicate ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022a-isolation-"));
  globalThis.__step022aLifecycle = [];
  try {
    await createExtension(root, "bad.local", { kind: "tool", id: "bad" }, `export default { activate() { throw new Error("fixture activation failure"); } };`);
    await createExtension(root, "good.local", { kind: "tool", id: "good" }, `
      export default { activate(context) {
        globalThis.__step022aLifecycle.push("activate"); context.claimCapability({ kind: "tool", id: "good" });
        return { deactivate(reason) { globalThis.__step022aLifecycle.push("deactivate:" + reason); } };
      } };
    `);
    const registry = new LocalExtensionRuntimeRegistry(runtimeOptions(root, ["bad.local", "good.local"], ["bad.local", "good.local"]));
    const started = await registry.startConfigured();
    const failed = started.find((item) => item.extensionId === "bad.local");
    assert.equal(failed.state, "FAILED");
    assert.equal(failed.issue.code, "ACTIVATION_FAILED");
    assert.equal(failed.issue.message.includes("fixture activation failure"), false);
    assert.equal(started.find((item) => item.extensionId === "good.local").state, "READY");
    assert.equal((await registry.disable("good.local")).state, "DISABLED");
    assert.equal((await registry.enable("good.local")).state, "READY");
    assert.deepEqual(globalThis.__step022aLifecycle, ["activate", "deactivate:runtime-disable", "activate"]);
    await registry.close();
  } finally {
    delete globalThis.__step022aLifecycle;
    await rm(root, { recursive: true, force: true });
  }
});


test("STEP022A activation timeout and malformed capability claims fail closed without blocking the registry", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022a-timeout-"));
  try {
    await createExtension(root, "timeout.local", { kind: "tool", id: "timeout" }, `export default { activate() { return new Promise(() => {}); } };`);
    const timeoutRegistry = new LocalExtensionRuntimeRegistry(runtimeOptions(root, ["timeout.local"], ["timeout.local"], {}, { activationTimeoutMs: 20 }));
    const timeoutView = (await timeoutRegistry.startConfigured())[0];
    assert.equal(timeoutView.state, "FAILED");
    assert.equal(timeoutView.issue.code, "ACTIVATION_FAILED");
    assert.equal(timeoutView.issue.message, "extension activation failed or timed out");

    await createExtension(root, "claim.local", { kind: "tool", id: "claim" }, `
      export default { activate(context) {
        context.claimCapability({ kind: "tool", id: "claim", extra: true });
        return { deactivate() {} };
      } };
    `);
    const claimRegistry = new LocalExtensionRuntimeRegistry(runtimeOptions(root, ["claim.local"], ["claim.local"]));
    const claimView = (await claimRegistry.startConfigured())[0];
    assert.equal(claimView.state, "FAILED");
    assert.equal(claimView.issue.code, "MODULE_INVALID");
    assert.match(claimView.issue.message, /closed object/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("STEP022A Extension cannot spoof Host module-contract errors to expose arbitrary diagnostics", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "openrill-step022a-spoof-"));
  await createExtension(
    workspace,
    "spoofed.error",
    { kind: "tool", id: "spoofed.tool" },
    `export default { async activate() { const error = new Error("LEAK_ME_C:/private/token.txt"); error.code = "MODULE_INVALID"; throw error; } };`,
  );
  const registry = new LocalExtensionRuntimeRegistry({
    hostVersion: "0.22.0-step022a",
    configRoot: workspace,
    roots: ["spoofed.error"],
    enabled: ["spoofed.error"],
    settings: {},
  });
  const [view] = await registry.startConfigured();
  assert.equal(view.state, "FAILED");
  assert.equal(view.issue.code, "ACTIVATION_FAILED");
  assert.equal(view.issue.message, "extension activation failed or timed out");
  assert.doesNotMatch(JSON.stringify(view), /LEAK_ME|private|token\.txt/);
  await registry.close();
  await rm(workspace, { recursive: true, force: true });
});
