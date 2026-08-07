import test from "node:test";
import assert from "node:assert/strict";
import { ConnectorDeliveryError } from "../../packages/connectors/dist/index.js";
import { MattermostClient, MattermostError, mattermostApiUrl, mattermostWebSocketUrl, normalizeMattermostBaseUrl } from "../../connectors/mattermost/dist/index.js";

test("STEP022C Mattermost URL normalization closes credentials, API suffix, and traversal", () => {
  assert.equal(normalizeMattermostBaseUrl("https://chat.example.test/api/v4/"), "https://chat.example.test");
  assert.equal(mattermostWebSocketUrl("https://chat.example.test"), "wss://chat.example.test/api/v4/websocket");
  assert.equal(mattermostApiUrl("https://chat.example.test/", "/users/me"), "https://chat.example.test/api/v4/users/me");
  assert.throws(() => normalizeMattermostBaseUrl("ftp://chat.example.test"), (error) => error instanceof MattermostError && error.code === "MATTERMOST_CONFIG_INVALID");
  assert.throws(() => normalizeMattermostBaseUrl("https://user:pass@chat.example.test"), (error) => error.code === "MATTERMOST_CONFIG_INVALID");
  assert.throws(() => mattermostApiUrl("https://chat.example.test", "/posts/%2e%2e/users"), (error) => error.code === "MATTERMOST_CONFIG_INVALID");
});

test("STEP022C Mattermost REST client authenticates, bounds JSON, and captures post receipt", async () => {
  const calls = [];
  const client = new MattermostClient({
    baseUrl: "http://127.0.0.1:8065/api/v4",
    token: "private-token",
    allowPrivateNetwork: true,
    timeoutMs: 5_000,
    fetchImpl: async (input, init) => {
      calls.push({ input: String(input), init });
      if (String(input).endsWith("/users/me")) return Response.json({ id: "bot-id", username: "openrill" });
      return Response.json({ id: "post-1", channel_id: "channel-1", root_id: "root-1", create_at: 123 });
    },
  });
  assert.deepEqual(await client.getMe(), { id: "bot-id", username: "openrill" });
  assert.deepEqual(await client.createPost({ channelId: "channel-1", rootId: "root-1", message: "reply" }), {
    id: "post-1", channel_id: "channel-1", root_id: "root-1", create_at: 123,
  });
  assert.equal(calls.length, 2);
  for (const call of calls) assert.equal(new Headers(call.init.headers).get("Authorization"), "Bearer private-token");
  assert.deepEqual(JSON.parse(calls[1].init.body), { channel_id: "channel-1", message: "reply", root_id: "root-1" });
});

test("STEP022C Mattermost POST transport ambiguity becomes MAYBE_ACCEPTED and is never safe-retried", async () => {
  const client = new MattermostClient({
    baseUrl: "http://127.0.0.1:8065",
    token: "private-token",
    allowPrivateNetwork: true,
    timeoutMs: 5_000,
    fetchImpl: async () => { throw new Error("connection reset after upload"); },
  });
  await assert.rejects(
    client.createPost({ channelId: "channel-1", message: "reply" }),
    (error) => error instanceof ConnectorDeliveryError
      && error.errorCode === "MATTERMOST_API_UNAVAILABLE"
      && error.certainty === "MAYBE_ACCEPTED"
      && error.retryable === false,
  );
});

test("STEP022C explicit Mattermost API rejection remains REJECTED with bounded error body", async () => {
  const client = new MattermostClient({
    baseUrl: "http://127.0.0.1:8065",
    token: "private-token",
    allowPrivateNetwork: true,
    timeoutMs: 5_000,
    fetchImpl: async () => new Response(JSON.stringify({ message: "permission denied" }), { status: 403, headers: { "content-type": "application/json" } }),
  });
  await assert.rejects(
    client.createPost({ channelId: "channel-1", message: "reply" }),
    (error) => error instanceof ConnectorDeliveryError && error.certainty === "REJECTED" && error.retryable === false,
  );
});
