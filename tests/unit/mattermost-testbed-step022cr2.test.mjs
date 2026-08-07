import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MattermostApi, bootstrapMattermost, waitForMattermost } from "../../testbeds/mattermost/src/api.mjs";
import { loadTestbedConfig, parseEnv } from "../../testbeds/mattermost/src/config.mjs";
import { composeArgs, PROJECT_NAME } from "../../testbeds/mattermost/src/testbed.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rootFile = (path) => resolve(ROOT, path);

function response(status, body, headers = {}) {
  return new Response(body === null ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
const config = Object.freeze({
  baseUrl: "http://127.0.0.1:8065",
  MATTERMOST_ADMIN_EMAIL: "a@example.test", MATTERMOST_ADMIN_USERNAME: "admin", MATTERMOST_ADMIN_PASSWORD: "Password-Admin-123!",
  MATTERMOST_USER_EMAIL: "u@example.test", MATTERMOST_USER_USERNAME: "user", MATTERMOST_USER_PASSWORD: "Password-User-123!",
  MATTERMOST_TEAM_NAME: "openrill-live", MATTERMOST_TEAM_DISPLAY_NAME: "OpenRill Live",
  MATTERMOST_CHANNEL_NAME: "openrill-agent-live", MATTERMOST_CHANNEL_DISPLAY_NAME: "OpenRill Agent Live"
});

test("STEP022CR2 testbed waits for real Mattermost ping instead of treating connection failure as readiness", async () => {
  let calls = 0;
  const api = new MattermostApi(config.baseUrl, async () => {
    calls += 1;
    if (calls < 3) throw new Error("connection refused");
    return response(200, { status: "OK" });
  });
  const result = await waitForMattermost(api, { timeoutMs: 100, intervalMs: 0, sleep: async () => {} });
  assert.equal(result.status, "OK"); assert.equal(calls, 3);
});

test("STEP022CR2 testbed bootstraps two distinct actors team channel and returns tokens only to caller", async () => {
  const users = new Map();
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname.replace("/api/v4", ""); const body = init.body ? JSON.parse(init.body) : null;
    if (path === "/users/login") { const user = users.get(body.login_id); return user ? response(200, user, { Token: `token-${user.username}` }) : response(401, { id: "login.failed" }); }
    if (path === "/users" && init.method === "POST") { if (users.has(body.username)) return response(400, { id: "exists" }); const user = { id: `id-${body.username}`, username: body.username }; users.set(body.username, user); return response(201, user); }
    if (path === "/teams/name/openrill-live") return response(404, { id: "missing" });
    if (path === "/teams" && init.method === "POST") return response(201, { id: "team-1", name: body.name });
    if (/^\/teams\/team-1\/members$/u.test(path)) return response(201, body);
    if (path === "/teams/name/openrill-live/channels/name/openrill-agent-live") return response(404, { id: "missing" });
    if (path === "/channels" && init.method === "POST") return response(201, { id: "channel-1", team_id: body.team_id, name: body.name });
    if (path === "/channels/channel-1/members") return response(201, body);
    throw new Error(`unexpected ${path}`);
  };
  const result = await bootstrapMattermost(new MattermostApi(config.baseUrl, fetchImpl), config);
  assert.equal(result.botToken, "token-admin"); assert.equal(result.userToken, "token-user"); assert.equal(result.channelId, "channel-1"); assert.notEqual(result.botUserId, result.userId);
});

test("STEP022CR2 testbed reuses existing users team and channel idempotently", async () => {
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname.replace("/api/v4", ""); const body = init.body ? JSON.parse(init.body) : null;
    if (path === "/users/login") return response(200, { id: `id-${body.login_id}`, username: body.login_id }, { Token: `token-${body.login_id}` });
    if (path === "/teams/name/openrill-live") return response(200, { id: "team-old", name: "openrill-live" });
    if (path === "/teams/team-old/members") return response(400, { id: "already.member" });
    if (path === "/teams/name/openrill-live/channels/name/openrill-agent-live") return response(200, { id: "channel-old", team_id: "team-old" });
    if (path === "/channels/channel-old/members") return response(400, { id: "already.member" });
    throw new Error(`unexpected ${path}`);
  };
  const result = await bootstrapMattermost(new MattermostApi(config.baseUrl, fetchImpl), config);
  assert.equal(result.teamId, "team-old"); assert.equal(result.channelId, "channel-old");
});

test("STEP022CR2 testbed parses LF and CRLF env without shell evaluation", () => {
  assert.deepEqual(parseEnv("A=1\r\nB=two\n# comment\n"), { A: "1", B: "two" });
  assert.throws(() => parseEnv("BAD KEY=value"), /ENV_KEY_INVALID/u);
});

test("STEP022CR2 testbed defaults are localhost exact-image and validated", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-mm-config-"));
  const value = await loadTestbedConfig(root, {});
  assert.equal(value.baseUrl, "http://127.0.0.1:8065");
  assert.equal(value.MATTERMOST_IMAGE, "mattermost/mattermost-team-edition:11.7.7");
  await writeFile(join(root, ".env"), "MATTERMOST_PORT=80\n");
  await assert.rejects(loadTestbedConfig(root, {}), /PORT_INVALID/u);
});

test("STEP022CR2 compose pins verified Mattermost 11.7.7 and localhost-only named volumes", async () => {
  const text = await readFile(rootFile("testbeds/mattermost/docker-compose.yml"), "utf8");
  assert.match(text, /mattermost\/mattermost-team-edition:11\.7\.7/u); assert.match(text, /postgres:18-alpine/u);
  assert.match(text, /127\.0\.0\.1:\$\{MATTERMOST_PORT:-8065\}:8065/u); assert.match(text, /mattermost-db:\/var\/lib\/postgresql/u); assert.doesNotMatch(text, /:latest/u);
});

test("STEP022CR2 compose commands stay inside the integrated testbed path", () => {
  const args = composeArgs("C:/OpenRill Root/testbeds/mattermost", "up", "-d");
  assert.deepEqual(args.slice(0, 4), ["compose", "-p", PROJECT_NAME, "-f"]); assert.equal(args.at(-2), "up"); assert.equal(args.at(-1), "-d");
});

test("STEP022CR2 live runner derives OpenRill root and never accepts an external root argument", async () => {
  const text = await readFile(rootFile("testbeds/mattermost/scripts/run-step022c-live.mjs"), "utf8");
  assert.match(text, /resolve\(testbedRoot, "\.\.", "\.\."\)/u); assert.doesNotMatch(text, /process\.argv\[2\]|OPENRILL_STEP022C_ROOT/u);
  assert.match(text, /tokens=REDACTED/u); assert.doesNotMatch(text, /writeFile/u); assert.match(text, /"acceptance:step022c:live"/u);
});

test("STEP022CR2 root PowerShell wrapper requires no OpenRillRoot parameter and performs frozen install", async () => {
  const text = await readFile(rootFile("start-and-run-step022c-live.ps1"), "utf8");
  assert.doesNotMatch(text, /param\s*\(|OpenRillRoot/u); assert.match(text, /pnpm install --frozen-lockfile/u); assert.match(text, /pnpm mattermost:testbed:live/u);
});

test("STEP022CR2 retains a zero-argument root CMD entrypoint without freezing its later implementation", async () => {
  const text = await readFile(rootFile("start-and-run-step022c-live.cmd"), "utf8");
  assert.match(text, /^@echo off/u); assert.match(text, /%~dp0/u); assert.doesNotMatch(text, /OpenRillRoot/u);
});
