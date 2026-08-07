import test from "node:test";
import assert from "node:assert/strict";
import {
  validateExtensionDisableInput,
  validateExtensionEnableInput,
  validateExtensionGetInput,
  validateExtensionListInput,
} from "../../packages/protocol/dist/index.js";
import { ExtensionRuntimeError } from "../../services/agent-host/dist/extension-runtime.js";
import { createDefaultOperationRegistry } from "../../services/agent-host/dist/transport/operation-registry.js";

function status() {
  return { product: "OpenRill", version: "0.22.0-step022a", profile: "extensions", pid: 1, instanceId: "test", bind: "127.0.0.1", port: 0, startedAt: new Date(0).toISOString(), state: "READY", readiness: true };
}
function view(state = "READY") {
  return { extensionId: "alpha.local", displayName: "Alpha", version: "1.0.0", state, enabled: true, activationSequence: 1, capabilities: [{ kind: "tool", id: "alpha" }], issue: null };
}

test("STEP022A Local Protocol Extension inputs are closed and identity-bounded", () => {
  assert.equal(validateExtensionListInput({}).ok, true);
  assert.equal(validateExtensionListInput({ extra: true }).ok, false);
  for (const validate of [validateExtensionGetInput, validateExtensionEnableInput, validateExtensionDisableInput]) {
    assert.equal(validate({ extensionId: "alpha.local" }).ok, true);
    assert.equal(validate({ extensionId: "Alpha Local" }).ok, false);
    assert.equal(validate({ extensionId: "alpha.local", extra: true }).ok, false);
  }
});

test("STEP022A Local Protocol exposes four exact Extension operations and maps lifecycle failures", async () => {
  const hooks = {
    list: () => ({ items: [view()] }),
    get: () => view(),
    enable: () => view(),
    disable: () => ({ ...view("DISABLED"), enabled: false }),
  };
  const registry = createDefaultOperationRegistry(status, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, hooks);
  assert.deepEqual(registry.capabilities(), [
    { name: "diagnostics.ping", permission: "diagnostics.read" },
    { name: "extension.disable", permission: "extension.write" },
    { name: "extension.enable", permission: "extension.write" },
    { name: "extension.get", permission: "extension.read" },
    { name: "extension.list", permission: "extension.read" },
    { name: "host.status", permission: "host.read" },
  ]);
  assert.equal((await registry.invoke("list", "extension.list", {})).ok, true);
  assert.equal((await registry.invoke("get", "extension.get", { extensionId: "alpha.local" })).output.state, "READY");
  assert.equal((await registry.invoke("bad", "extension.get", { extensionId: "alpha.local", extra: true })).error.code, "INVALID_INPUT");

  const failed = createDefaultOperationRegistry(status, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
    list: () => ({ items: [] }),
    get: () => { throw new ExtensionRuntimeError("EXTENSION_NOT_FOUND", "extension not found"); },
    enable: () => { throw new ExtensionRuntimeError("EXTENSION_CAPABILITY_CONFLICT", "capability conflict"); },
    disable: () => { throw new ExtensionRuntimeError("EXTENSION_STATE_INVALID", "invalid state"); },
  });
  assert.equal((await failed.invoke("missing", "extension.get", { extensionId: "missing.local" })).error.code, "NOT_FOUND");
  assert.equal((await failed.invoke("conflict", "extension.enable", { extensionId: "alpha.local" })).error.code, "CONFLICT");
  assert.equal((await failed.invoke("state", "extension.disable", { extensionId: "alpha.local" })).error.code, "INVALID_STATE");
});
