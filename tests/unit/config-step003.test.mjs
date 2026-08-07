import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigFutureVersionError,
  ConfigIncludeError,
  ConfigParseError,
  ConfigRevisionConflictError,
  ConfigValidationError,
  loadOpenRillConfig,
  parseOpenRillYaml,
  resolveConfigPaths,
  resolveConfigSource,
  resolveProfilePaths,
  resolveSecretReference,
  validateAndMaterializeConfig,
  writeOpenRillConfig,
} from "../../packages/config/dist/index.js";

async function tempProfile(name = "test") {
  const root = await mkdtemp(join(tmpdir(), "openrill-config-step003-"));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const profile = resolveProfilePaths({ profile: name, env });
  const paths = resolveConfigPaths(profile);
  await mkdir(profile.configRoot, { recursive: true });
  return { root, env, profile, paths, cleanup: () => rm(root, { recursive: true, force: true }) };
}

const providerSource = {
  version: 1,
  modelProviders: {
    openai: {
      type: "openai",
      endpoint: "https://api.openai.com/v1",
      apiKey: { kind: "env", key: "OPENAI_API_KEY" },
    },
  },
};

test("closed YAML subset parses a real config and rejects ambiguous or unsafe YAML features", () => {
  const parsed = parseOpenRillYaml(`
version: 1
host:
  bind: 127.0.0.1
  port: 47117
workspaces:
  - id: main
    path: D:/NODE_AGENTS/example
    readOnly: false
skills:
  enabled: []
`);
  const config = validateAndMaterializeConfig(parsed);
  assert.equal(config.host.port, 47117);
  assert.equal(config.workspaces[0].id, "main");
  assert.throws(() => parseOpenRillYaml("version: &shared 1\n"), ConfigParseError);
  assert.throws(() => parseOpenRillYaml("enabled: yes\n"), ConfigParseError);
  assert.throws(() => parseOpenRillYaml("version: 1\nversion: 1\n"), ConfigParseError);
});

test("closed schema rejects unknown keys, literal secrets, and future versions", () => {
  assert.throws(
    () => validateAndMaterializeConfig({ version: 1, host: { bind: "127.0.0.1", mystery: true } }),
    (error) => error instanceof ConfigValidationError && error.issues.some((issue) => issue.path === "host.mystery"),
  );
  assert.throws(
    () => validateAndMaterializeConfig({ version: 1, modelProviders: { openai: { type: "openai", apiKey: "plaintext" } } }),
    ConfigValidationError,
  );
  assert.throws(() => validateAndMaterializeConfig({ version: 2 }), ConfigFutureVersionError);
});

test("includes are root-contained, recursive, bounded, and cycle-safe", async () => {
  const fixture = await tempProfile("include");
  try {
    await writeFile(join(fixture.profile.configRoot, "defaults.yaml"), "version: 1\nexecution:\n  approvalMode: deny\n");
    await writeFile(fixture.paths.sourcePath, "include: defaults.yaml\nversion: 1\nexecution:\n  approvalMode: ask\n");
    const resolved = await resolveConfigSource(fixture.paths.sourcePath, fixture.profile.configRoot);
    assert.equal(resolved.source.execution.approvalMode, "ask");
    assert.equal(resolved.sourceFiles.length, 2);

    await writeFile(fixture.paths.sourcePath, "include: ../outside.yaml\nversion: 1\n");
    await assert.rejects(() => resolveConfigSource(fixture.paths.sourcePath, fixture.profile.configRoot), (error) => error instanceof ConfigIncludeError && error.code === "CONFIG_INCLUDE_ESCAPE");

    await writeFile(join(fixture.profile.configRoot, "a.yaml"), "include: b.yaml\nversion: 1\n");
    await writeFile(join(fixture.profile.configRoot, "b.yaml"), "include: a.yaml\nversion: 1\n");
    await writeFile(fixture.paths.sourcePath, "include: a.yaml\nversion: 1\n");
    await assert.rejects(() => resolveConfigSource(fixture.paths.sourcePath, fixture.profile.configRoot), (error) => error instanceof ConfigIncludeError && error.code === "CONFIG_INCLUDE_CYCLE");

    await writeFile(join(fixture.profile.configRoot, "deep.yaml"), "include: deeper.yaml\nversion: 1\n");
    await writeFile(join(fixture.profile.configRoot, "deeper.yaml"), "version: 1\n");
    await writeFile(fixture.paths.sourcePath, "include: deep.yaml\nversion: 1\n");
    await assert.rejects(() => resolveConfigSource(fixture.paths.sourcePath, fixture.profile.configRoot, { maxDepth: 1, maxFiles: 32, maxTotalBytes: 1024 }), (error) => error instanceof ConfigIncludeError && error.code === "CONFIG_INCLUDE_LIMIT");
  } finally {
    await fixture.cleanup();
  }
});

test("atomic writes create materialized and last-known-good snapshots without secret values", async () => {
  const fixture = await tempProfile("snapshot");
  try {
    const result = await writeOpenRillConfig({
      paths: fixture.paths,
      source: providerSource,
      expectedRevision: null,
      env: { ...fixture.env, OPENAI_API_KEY: "actual-secret-value" },
      now: () => new Date("2026-08-01T10:00:00.000Z"),
    });
    assert.equal(result.recovery, "SOURCE");
    assert.equal(result.secretStatuses[0].available, true);
    assert.equal(result.redactedConfig.modelProviders.openai.apiKey.key, "<redacted>");

    const materialized = await readFile(fixture.paths.materializedPath, "utf8");
    const lkg = await readFile(fixture.paths.lastKnownGoodPath, "utf8");
    assert.equal(materialized.includes("actual-secret-value"), false);
    assert.equal(lkg.includes("actual-secret-value"), false);
    assert.equal(materialized.includes("OPENAI_API_KEY"), true);

    const journalNames = await readdir(fixture.paths.journalDir);
    assert.equal(journalNames.length, 1);
    const journal = await readFile(join(fixture.paths.journalDir, journalNames[0]), "utf8");
    assert.equal(journal.includes("actual-secret-value"), false);
    assert.equal(journal.includes("OPENAI_API_KEY"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("optimistic source revision detects concurrent writes", async () => {
  const fixture = await tempProfile("revision");
  try {
    const first = await writeOpenRillConfig({ paths: fixture.paths, source: { version: 1 }, expectedRevision: null, env: fixture.env });
    const second = await writeOpenRillConfig({
      paths: fixture.paths,
      source: { version: 1, automation: { enabled: true } },
      expectedRevision: first.sourceRevision,
      env: fixture.env,
    });
    assert.notEqual(second.sourceRevision, first.sourceRevision);
    await assert.rejects(
      () => writeOpenRillConfig({ paths: fixture.paths, source: { version: 1 }, expectedRevision: first.sourceRevision, env: fixture.env }),
      ConfigRevisionConflictError,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("parse and schema failures recover from LKG, but include escape and future version fail closed", async () => {
  const fixture = await tempProfile("recovery");
  try {
    const good = await writeOpenRillConfig({ paths: fixture.paths, source: { version: 1, automation: { enabled: true } }, expectedRevision: null, env: fixture.env });
    await writeFile(fixture.paths.sourcePath, "version: [broken\n");
    const recovered = await loadOpenRillConfig({ paths: fixture.paths, env: fixture.env });
    assert.equal(recovered.recovery, "LAST_KNOWN_GOOD");
    assert.equal(recovered.config.automation.enabled, true);
    assert.equal(recovered.materializedRevision, good.materializedRevision);

    await writeFile(fixture.paths.sourcePath, "include: ../escape.yaml\nversion: 1\n");
    await assert.rejects(() => loadOpenRillConfig({ paths: fixture.paths, env: fixture.env }), (error) => error instanceof ConfigIncludeError && error.code === "CONFIG_INCLUDE_ESCAPE");

    await writeFile(fixture.paths.sourcePath, "version: 999\n");
    await assert.rejects(() => loadOpenRillConfig({ paths: fixture.paths, env: fixture.env }), ConfigFutureVersionError);
  } finally {
    await fixture.cleanup();
  }
});

test("missing secret references remain references and resolve only at point of use", async () => {
  const fixture = await tempProfile("secret");
  try {
    const result = await writeOpenRillConfig({ paths: fixture.paths, source: providerSource, expectedRevision: null, env: fixture.env });
    assert.equal(result.secretStatuses[0].available, false);
    assert.equal(result.secretStatuses[0].reason, "MISSING_ENV");
    await assert.rejects(() => resolveSecretReference({ kind: "env", key: "OPENAI_API_KEY" }, { env: fixture.env, configRoot: fixture.profile.configRoot }));
    assert.equal(
      await resolveSecretReference({ kind: "env", key: "OPENAI_API_KEY" }, { env: { OPENAI_API_KEY: "runtime-only" }, configRoot: fixture.profile.configRoot }),
      "runtime-only",
    );
  } finally {
    await fixture.cleanup();
  }
});
