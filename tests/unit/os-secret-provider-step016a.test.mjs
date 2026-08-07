import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WindowsDpapiSecretProvider,
  createOsSecretProvider,
} from "../../packages/config/dist/index.js";

const KEY = "model.default.api-key";

test("STEP016A Windows OS secret provider uses DPAPI CurrentUser and never places secret values in argv", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step016a-dpapi-"));
  const digest = createHash("sha256").update(KEY, "utf8").digest("hex");
  await mkdir(join(root, "os-secrets"), { recursive: true });
  await writeFile(join(root, "os-secrets", `${digest}.dpapi`), "fixture");
  const calls = [];
  const executor = {
    async run(executable, args, input, timeoutMs, interactive = false, env = {}) {
      calls.push({ executable, args: [...args], input, timeoutMs, interactive, env: { ...env } });
      const operation = env.OPENRILL_DPAPI_OPERATION;
      if (operation === "inspect") return { exitCode: 0, signal: null, timedOut: false, stdout: "AVAILABLE", stderr: "" };
      if (operation === "get") return { exitCode: 0, signal: null, timedOut: false, stdout: "retrieved-secret", stderr: "" };
      if (operation === "set" || operation === "set-interactive") return { exitCode: 0, signal: null, timedOut: false, stdout: "STORED", stderr: "" };
      if (operation === "delete") return { exitCode: 0, signal: null, timedOut: false, stdout: "DELETED", stderr: "" };
      throw new Error(`unexpected operation: ${operation}`);
    },
  };
  try {
    const provider = new WindowsDpapiSecretProvider({ configRoot: root, platform: "win32", executor });
    assert.deepEqual(await provider.inspect(KEY), { available: true, reason: "AVAILABLE" });
    assert.equal(await provider.get(KEY), "retrieved-secret");
    await provider.set(KEY, "actual-secret-value");
    await provider.setInteractive(KEY, "Masked prompt");
    assert.equal(await provider.delete(KEY), true);

    assert.equal(calls[0].args.includes("-Command"), false);
    const encodedIndex = calls[0].args.indexOf("-EncodedCommand");
    assert.equal(encodedIndex, calls[0].args.length - 2);
    const commandText = Buffer.from(calls[0].args[encodedIndex + 1], "base64").toString("utf16le");
    assert.match(commandText, /ProtectedData/);
    assert.match(commandText, /DataProtectionScope\]::CurrentUser/);
    assert.match(commandText, /OPENRILL_DPAPI_OPERATION/);
    assert.match(commandText, /OPENRILL_DPAPI_PATH/);
    assert.equal(JSON.stringify(calls.map((call) => call.args)).includes("actual-secret-value"), false);
    assert.equal(JSON.stringify(calls.map((call) => call.env)).includes("actual-secret-value"), false);
    assert.equal(calls.every((call) => call.env.OPENRILL_DPAPI_OPERATION && call.env.OPENRILL_DPAPI_PATH), true);
    const setCall = calls.find((call) => call.input === "actual-secret-value");
    assert.ok(setCall);
    assert.equal(setCall.executable, "powershell.exe");
    const interactiveCall = calls.find((call) => call.interactive);
    assert.ok(interactiveCall);
    assert.equal(interactiveCall.input, null);
    assert.equal(interactiveCall.args.includes("-NonInteractive"), false);
    assert.equal(JSON.stringify(interactiveCall.args).includes("actual-secret-value"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP016A OS secret provider fails closed outside supported platforms", async () => {
  const provider = createOsSecretProvider({ configRoot: "/tmp/openrill-step016a", platform: "linux" });
  assert.equal(provider.kind, "UNAVAILABLE");
  assert.deepEqual(await provider.inspect(KEY), { available: false, reason: "PROVIDER_UNAVAILABLE" });
  await assert.rejects(() => provider.get(KEY), /unavailable/);
  await assert.rejects(() => provider.set(KEY, "secret"), /unavailable/);
});

test("STEP016A OS secret keys are bounded and traversal-safe", async () => {
  const provider = createOsSecretProvider({ configRoot: "/tmp/openrill-step016a", platform: "linux" });
  await assert.rejects(() => provider.inspect("../escape"), /portable characters/);
  await assert.rejects(() => provider.inspect("a".repeat(129)), /portable characters/);
});


test("STEP016AR1 DPAPI command failures preserve bounded non-secret PowerShell evidence", async () => {
  const provider = new WindowsDpapiSecretProvider({
    configRoot: "/tmp/openrill-step016ar1-dpapi",
    platform: "win32",
    executor: {
      async run(_executable, _args, input) {
        return {
          exitCode: 1,
          signal: null,
          timedOut: false,
          stdout: "",
          stderr: "missing operation or path",
        };
      },
    },
  });
  await assert.rejects(
    () => provider.set(KEY, "must-not-appear-in-error"),
    (error) => {
      assert.match(error.message, /operation=set/);
      assert.match(error.message, /exitCode=1/);
      assert.match(error.message, /missing operation or path/);
      assert.doesNotMatch(error.message, /must-not-appear-in-error/);
      return true;
    },
  );
});
