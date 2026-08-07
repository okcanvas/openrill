import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOpenRillConfig, resolveConfigPaths, resolveProfilePaths, writeOpenRillConfig } from "../../packages/config/dist/index.js";
import { createScriptedModelAdapter } from "../../packages/model-adapter/dist/index.js";
import { startLocalHost } from "../../services/agent-host/dist/index.js";

const resolver = (adapter) => ({ resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture-model", maxOutputTokens: 128, maxRetries: 0 }) });

test("STEP018B Host exposes active Skill-required schemas and defers unrelated tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step018b-host-discovery-"));
  const workspace = join(root, "workspace");
  const skillRoot = join(root, "skills", "report-writer");
  await mkdir(workspace, { recursive: true });
  await mkdir(skillRoot, { recursive: true });
  await writeFile(join(skillRoot, "instructions.md"), "Write a bounded report only when requested.\n", "utf8");
  await writeFile(join(skillRoot, "skill.yaml"), [
    "id: report-writer",
    "version: 1.0.0",
    "description: Write one bounded report.",
    "activation:",
    "  - write report",
    "instructions: instructions.md",
    "tools:",
    "  - workspace.write",
    "resources:",
    "compatibility:",
    "  minOpenRill: 0.18.0-step018a",
    "",
  ].join("\n"), "utf8");
  const profile = "step018b-host-discovery";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const paths = resolveProfilePaths({ profile, env, platform: process.platform });
  const configPaths = resolveConfigPaths(paths, { platform: process.platform });
  await writeOpenRillConfig({
    paths: configPaths,
    source: {
      version: 1,
      modelProviders: { default: { type: "fixture", model: "fixture-model" } },
      workspaces: [{ id: "alpha", path: workspace, readOnly: false }],
      execution: { approvalMode: "deny" },
      skills: { roots: [skillRoot], enabled: ["report-writer"] },
      automation: { enabled: false },
      browser: { enabled: false },
      ui: { openOnStart: false },
    },
    expectedRevision: null,
    env,
    platform: process.platform,
  });
  const requests = [];
  const adapter = createScriptedModelAdapter({
    onRequest: (request) => requests.push(request),
    turns: [
      { kind: "events", events: [{ type: "text_delta", delta: "Ready." }, { type: "completed", stopReason: "stop" }] },
      { kind: "events", events: [{ type: "text_delta", delta: "Ready." }, { type: "completed", stopReason: "stop" }] },
    ],
  });
  let host = null;
  try {
    host = await startLocalHost({
      profile,
      port: 0,
      env,
      config: (await loadOpenRillConfig({ paths: configPaths, env, platform: process.platform })).config,
      configRoot: paths.configRoot,
      modelResolver: resolver(adapter),
    });
    await host.ready;
    await host.runConversation({ workspaceId: "alpha", text: "write report about this workspace", submissionKey: "skill-active" });
    await host.runConversation({ workspaceId: "alpha", text: "say hello", submissionKey: "skill-inactive" });
    const activeNames = requests[0].tools.map((tool) => tool.name);
    assert.equal(activeNames.includes("workspace.write"), true);
    assert.equal(activeNames.includes("workspace.patch"), false);
    assert.equal(activeNames.includes("tool.search"), true);
    assert.match(requests[0].systemInstructions, /report-writer/);
    const inactiveNames = requests[1].tools.map((tool) => tool.name);
    assert.equal(inactiveNames.includes("workspace.write"), false);
    assert.equal(inactiveNames.includes("tool.call"), true);
  } finally {
    await host?.close("step018b-test");
    await rm(root, { recursive: true, force: true });
  }
});
