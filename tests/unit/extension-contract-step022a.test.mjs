import test from "node:test";
import assert from "node:assert/strict";
import {
  extensionHostCompatible,
  validateExtensionManifest,
  validateExtensionSettings,
} from "../../packages/extension-sdk/dist/index.js";
import { ConfigValidationError, collectSecretStatuses, validateAndMaterializeConfig } from "../../packages/config/dist/index.js";

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "mattermost.local",
    displayName: "Mattermost Local",
    version: "1.2.3",
    entry: "dist/index.mjs",
    compatibility: { apiVersion: 1, host: { minInclusive: "0.22.0-step022a", maxExclusive: "0.23.0" } },
    capabilities: [{ kind: "connector", id: "mattermost" }],
    configSchema: {
      additionalProperties: false,
      fields: [
        { key: "baseUrl", kind: "string", required: true, maxLength: 2048 },
        { key: "token", kind: "secret", required: true },
        { key: "reconnectLimit", kind: "integer", required: false, min: 0, max: 20 },
      ],
    },
    ...overrides,
  };
}

test("STEP022A Extension manifest is closed, bounded, capability-unique, and root-relative", () => {
  const valid = validateExtensionManifest(manifest());
  assert.equal(valid.ok, true);
  assert.equal(validateExtensionManifest({ ...manifest(), unknown: true }).ok, false);
  assert.equal(validateExtensionManifest(manifest({ entry: "../escape.mjs" })).ok, false);
  assert.equal(validateExtensionManifest(manifest({ entry: "/absolute.mjs" })).ok, false);
  assert.equal(validateExtensionManifest(manifest({ capabilities: [
    { kind: "connector", id: "mattermost" },
    { kind: "connector", id: "mattermost" },
  ] })).ok, false);
  assert.equal(validateExtensionManifest(manifest({ configSchema: {
    additionalProperties: false,
    fields: [{ key: "token", kind: "secret", required: true, maxLength: 10 }],
  } })).ok, false);
});

test("STEP022A Extension settings validate declared scalar and SecretRef fields without materializing secret values", async () => {
  const checked = validateExtensionManifest(manifest());
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  const settings = {
    values: { baseUrl: "https://mattermost.example", reconnectLimit: 3 },
    secrets: { token: { kind: "env", key: "MATTERMOST_TOKEN" } },
  };
  assert.equal(validateExtensionSettings(checked.value, settings).ok, true);
  assert.match(validateExtensionSettings(checked.value, { values: {}, secrets: {} }).error, /required/);
  assert.match(validateExtensionSettings(checked.value, { values: { baseUrl: "x", extra: true }, secrets: settings.secrets }).error, /unknown/);
  assert.match(validateExtensionSettings(checked.value, { values: { baseUrl: "x", reconnectLimit: 21 }, secrets: settings.secrets }).error, /maximum/);

  const config = validateAndMaterializeConfig({
    version: 1,
    extensions: {
      roots: ["  extensions/mattermost  "],
      enabled: ["mattermost.local"],
      settings: { "mattermost.local": settings },
    },
  });
  assert.deepEqual(config.extensions.roots, ["extensions/mattermost"]);
  assert.deepEqual(config.extensions.enabled, ["mattermost.local"]);
  assert.deepEqual(config.extensions.settings["mattermost.local"].secrets.token, { kind: "env", key: "MATTERMOST_TOKEN" });
  const statuses = await collectSecretStatuses(config, { env: {}, configRoot: "/tmp/openrill-step022a" });
  assert.deepEqual(statuses.map(({ path, available, reason }) => ({ path, available, reason })), [{
    path: "extensions.settings.mattermost.local.secrets.token",
    available: false,
    reason: "MISSING_ENV",
  }]);
  assert.throws(() => validateAndMaterializeConfig({ version: 1, extensions: { enabled: ["Bad ID"] } }), ConfigValidationError);
  assert.throws(() => validateAndMaterializeConfig({ version: 1, extensions: { settings: { "mattermost.local": { token: "literal" } } } }), ConfigValidationError);
});

test("STEP022A Host compatibility uses structured minimum-inclusive and maximum-exclusive versions", () => {
  const checked = validateExtensionManifest(manifest());
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  assert.equal(extensionHostCompatible(checked.value, "0.21.9"), false);
  assert.equal(extensionHostCompatible(checked.value, "0.22.0-step022a"), true);
  assert.equal(extensionHostCompatible(checked.value, "0.22.9"), true);
  assert.equal(extensionHostCompatible(checked.value, "0.23.0"), false);
});
