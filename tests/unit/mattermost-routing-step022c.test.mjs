import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMattermostIngress, parseMattermostDelivery, parsePostedEvent } from "../../connectors/mattermost/dist/index.js";

const config = {
  accountId: "main", workspaceId: "alpha", baseUrl: "http://127.0.0.1:8065", botToken: "token",
  botUserId: "bot-id", botUsername: "openrill", requireMention: true, allowPrivateNetwork: true,
  requestTimeoutMs: 5_000, reconnectMinMs: 100, reconnectMaxMs: 1_000, pumpIntervalMs: 50,
};

function claim(payload) {
  return { ingress: {
    ingressId: "ingress-1", connectorId: "mattermost", accountId: "main", externalEventId: "event-1", laneKey: "lane",
    payloadVersion: 1, payload, payloadHash: "hash", status: "CLAIMED", attemptCount: 1, availableAt: 0,
    claimToken: null, claimDeadlineAt: null, bindingId: null, messageId: null, runId: null,
    lastErrorCode: null, lastErrorSummary: null, receivedAt: 1, updatedAt: 1,
  }, claimToken: "claim", claimDeadlineAt: 100 };
}

function posted(overrides = {}) {
  const post = { id: "post-1", user_id: "user-1", channel_id: "channel-1", message: "@openrill please help", root_id: "", type: "", create_at: 100, ...overrides.post };
  return { event: "posted", data: { post: JSON.stringify(post), channel_type: "O", team_id: "team-1", sender_name: "alice", ...overrides.data }, broadcast: { channel_id: post.channel_id, user_id: post.user_id, team_id: "team-1" } };
}

test("STEP022C channel mention routes to one channel Conversation and strips the bot mention", () => {
  const result = normalizeMattermostIngress(claim(posted()), config);
  assert.equal(result.kind, "message");
  assert.equal(result.text, "please help");
  assert.deepEqual(result.route, {
    workspaceId: "alpha", externalScopeId: "team:team-1", externalConversationId: "channel-1", title: "Mattermost channel channel-1",
  });
});

test("STEP022C direct message bypasses mention requirement and thread reply retains root identity", () => {
  const dm = normalizeMattermostIngress(claim(posted({ post: { message: "hello", root_id: "root-1" }, data: { channel_type: "D", team_id: "" } })), config);
  assert.equal(dm.kind, "message");
  assert.equal(dm.text, "hello");
  assert.equal(dm.route.externalScopeId, "direct:channel-1");
  assert.equal(dm.route.externalThreadId, "root-1");
});

test("STEP022C self, system, unmentioned, empty, and unsupported events are ignored", () => {
  assert.equal(normalizeMattermostIngress(claim(posted({ post: { user_id: "bot-id" } })), config).kind, "ignored");
  assert.equal(normalizeMattermostIngress(claim(posted({ post: { type: "system_join_channel" } })), config).kind, "ignored");
  assert.equal(normalizeMattermostIngress(claim(posted({ post: { message: "not for the bot" } })), config).kind, "ignored");
  assert.equal(normalizeMattermostIngress(claim(posted({ post: { message: "@openrillx is not the bot" } })), config).kind, "ignored");
  assert.equal(normalizeMattermostIngress(claim(posted({ post: { message: "@openrill" } })), config).kind, "ignored");
  assert.equal(normalizeMattermostIngress(claim({ event: "hello", data: {} }), config).kind, "ignored");
});

test("STEP022C delivery parser uses durable target/thread keys and rejects hidden alternate targets", () => {
  const delivery = parseMattermostDelivery({ delivery: {
    deliveryId: "delivery-1", connectorId: "mattermost", accountId: "main", conversationId: "conversation-1", runId: "run-1", sourceMessageId: null,
    targetKey: "channel-1", threadKey: "root-1", payloadVersion: 1, payload: { type: "text", text: " reply " }, payloadHash: "hash",
    idempotencyKey: "key", status: "DELIVERING", attemptCount: 1, availableAt: 0, claimToken: null, claimDeadlineAt: null,
    lastErrorCode: null, lastErrorSummary: null, createdAt: 1, updatedAt: 1,
  }, attempt: { attemptId: "attempt-1", deliveryId: "delivery-1", attemptNumber: 1, claimToken: "claim", requestHash: "hash", status: "DISPATCHED", errorCode: null, errorSummary: null, startedAt: 1, dispatchedAt: 1, endedAt: null }, claimToken: "claim", claimDeadlineAt: 100 });
  assert.deepEqual(delivery, { channelId: "channel-1", rootId: "root-1", message: "reply" });
  assert.equal(parsePostedEvent({ event: "hello" }), null);
});


test("STEP022C Mattermost broadcast identity must match the embedded post", () => {
  assert.throws(() => normalizeMattermostIngress(claim({ ...posted(), broadcast: { channel_id: "other-channel", user_id: "user-1", team_id: "team-1" } }), config), (error) => error.errorCode === "MATTERMOST_INGRESS_INVALID");
  assert.throws(() => normalizeMattermostIngress(claim({ ...posted(), broadcast: { channel_id: "channel-1", user_id: "other-user", team_id: "team-1" } }), config), (error) => error.errorCode === "MATTERMOST_INGRESS_INVALID");
});
