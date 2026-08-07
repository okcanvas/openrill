import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadOpenRillConfig,
  resolveConfigPaths,
  resolveProfilePaths,
  writeOpenRillConfig,
} from "../../packages/config/dist/index.js";
import { runCli } from "../../apps/agent-cli/dist/index.js";

async function fixture(name, requiredTool = "workspace.write") {
  const root = await mkdtemp(join(tmpdir(), `openrill-step018b-skill-${name}-`));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const profilePaths = resolveProfilePaths({ profile: name, env, platform: process.platform });
  const configPaths = resolveConfigPaths(profilePaths, { platform: process.platform });
  const workspace = join(root, "workspace");
  const managed = join(profilePaths.configRoot, "managed-skills", requiredTool === "workspace.write" ? "report-writer" : "bounded-skill");
  await mkdir(workspace, { recursive: true });
  await mkdir(managed, { recursive: true });
  await writeFile(join(managed, "instructions.md"), "Write only when explicitly requested.\n", "utf8");
  await writeFile(join(managed, "skill.yaml"), [
    `id: ${requiredTool === "workspace.write" ? "report-writer" : "bounded-skill"}`,
    "version: 1.0.0",
    "description: Produce a bounded workspace report.",
    "activation:",
    "  - write report",
    "instructions: instructions.md",
    "tools:",
    `  - ${requiredTool}`,
    "resources:",
    "compatibility:",
    "  minOpenRill: 0.18.0-step018a",
    "",
  ].join("\n"), "utf8");
  await writeOpenRillConfig({
    paths: configPaths,
    source: {
      version: 1,
      workspaces: [{ id: "alpha", path: workspace, readOnly: false }],
      skills: { roots: ["managed-skills"], enabled: [] },
      automation: { enabled: false },
      browser: { enabled: false },
      ui: { openOnStart: false },
    },
    expectedRevision: null,
    env,
    platform: process.platform,
  });
  return { root, env, profilePaths, configPaths, workspace, cleanup: () => rm(root, { recursive: true, force: true }) };
}

async function invoke(f, args) {
  const stdout = [];
  const stderr = [];
  const code = await runCli(args, { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) }, {
    env: f.env,
    platform: process.platform,
    cwd: () => f.workspace,
    onSignal: () => {},
    offSignal: () => {},
  });
  return { code, stdout, stderr };
}

test("STEP018B skill list/show/check expose source, eligibility, and required Tool evidence", async () => {
  const f = await fixture("skill-list");
  try {
    const listed = await invoke(f, ["skill", "list", "--profile", "skill-list", "--workspace-id", "alpha", "--json"]);
    assert.equal(listed.code, 0, listed.stderr.join("\n"));
    const payload = JSON.parse(listed.stdout[0]);
    assert.equal(payload.entries.some((entry) => entry.id === "workspace-review" && entry.source === "BUNDLED"), true);
    assert.equal(payload.entries.some((entry) => entry.id === "report-writer" && entry.source === "MANAGED_USER"), true);
    assert.equal(payload.entries.every((entry) => entry.enabled), true);

    const shown = await invoke(f, ["skill", "show", "report-writer", "--profile", "skill-list", "--workspace-id", "alpha", "--json"]);
    assert.equal(shown.code, 0);
    assert.deepEqual(JSON.parse(shown.stdout[0]).requiredTools, ["workspace.write"]);

    const checked = await invoke(f, ["skill", "check", "--profile", "skill-list", "--workspace-id", "alpha", "--json"]);
    assert.equal(checked.code, 0);
    assert.equal(JSON.parse(checked.stdout[0]).ready, true);
  } finally {
    await f.cleanup();
  }
});

test("STEP018B skill disable/enable atomically materialize an explicit allowlist", async () => {
  const f = await fixture("skill-toggle");
  try {
    const disabled = await invoke(f, ["skill", "disable", "workspace-review", "--profile", "skill-toggle", "--workspace-id", "alpha", "--json"]);
    assert.equal(disabled.code, 0, disabled.stderr.join("\n"));
    assert.equal(JSON.parse(disabled.stdout[0]).changed, true);
    let loaded = await loadOpenRillConfig({ paths: f.configPaths, env: f.env, platform: process.platform });
    assert.deepEqual(loaded.config.skills.enabled, ["report-writer"]);

    const enabled = await invoke(f, ["skill", "enable", "workspace-review", "--profile", "skill-toggle", "--workspace-id", "alpha", "--json"]);
    assert.equal(enabled.code, 0, enabled.stderr.join("\n"));
    loaded = await loadOpenRillConfig({ paths: f.configPaths, env: f.env, platform: process.platform });
    assert.deepEqual(loaded.config.skills.enabled, ["report-writer", "workspace-review"]);
    const raw = await readFile(f.configPaths.sourcePath, "utf8");
    assert.match(raw, /enabled:/);
    assert.match(raw, /workspace-review/);
  } finally {
    await f.cleanup();
  }
});

test("STEP018B skill check fails closed when a required Tool is unavailable", async () => {
  const f = await fixture("skill-invalid", "missing.external.tool");
  try {
    const checked = await invoke(f, ["skill", "check", "--profile", "skill-invalid", "--workspace-id", "alpha", "--json"]);
    assert.equal(checked.code, 40);
    const payload = JSON.parse(checked.stdout[0]);
    assert.equal(payload.ready, false);
    assert.equal(payload.diagnostics.some((item) => item.code === "SKILL_REQUIRED_TOOL_UNAVAILABLE"), true);
  } finally {
    await f.cleanup();
  }
});


test("STEP018B skill eligibility excludes Browser Tools when Browser Runtime is disabled", async () => {
  const f = await fixture("skill-browser-disabled", "browser.screenshot");
  try {
    const checked = await invoke(f, ["skill", "check", "--profile", "skill-browser-disabled", "--workspace-id", "alpha", "--json"]);
    assert.equal(checked.code, 40);
    const payload = JSON.parse(checked.stdout[0]);
    assert.equal(payload.ready, false);
    assert.equal(payload.diagnostics.some((item) => item.code === "SKILL_REQUIRED_TOOL_UNAVAILABLE" && item.skillId === "bounded-skill"), true);
  } finally {
    await f.cleanup();
  }
});
