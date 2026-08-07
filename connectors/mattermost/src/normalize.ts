import { ConnectorIngressError, type ConnectorIngressClaim, type ConnectorIngressDisposition, type ConnectorDeliveryClaim } from "@openrill/connectors";
import { MattermostError } from "./errors.js";
import type { MattermostConnectorConfig, MattermostPost, MattermostPostedEvent } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function string(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new MattermostError("MATTERMOST_INGRESS_INVALID", `Mattermost ${label} is invalid`, false);
  }
  return value;
}

function optionalString(value: unknown, maximum = 4096): string {
  return typeof value === "string" && value.length <= maximum ? value : "";
}

export function parseMattermostPost(value: unknown): MattermostPost {
  let candidate = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate); }
    catch { throw new MattermostError("MATTERMOST_INGRESS_INVALID", "Mattermost post JSON is invalid", false); }
  }
  if (!isRecord(candidate)) throw new MattermostError("MATTERMOST_INGRESS_INVALID", "Mattermost post is invalid", false);
  return {
    id: string(candidate.id, "post id", 256),
    user_id: string(candidate.user_id, "user id", 256),
    channel_id: string(candidate.channel_id, "channel id", 256),
    message: optionalString(candidate.message, 65_536),
    root_id: optionalString(candidate.root_id, 256),
    type: optionalString(candidate.type, 256),
    create_at: typeof candidate.create_at === "number" && Number.isSafeInteger(candidate.create_at) && candidate.create_at >= 0 ? candidate.create_at : 0,
  };
}

export function parsePostedEvent(value: unknown): MattermostPostedEvent | null {
  if (!isRecord(value) || value.event !== "posted" || !isRecord(value.data)) return null;
  const postValue = value.data.post;
  if (typeof postValue !== "string" && !isRecord(postValue)) return null;
  const broadcast = isRecord(value.broadcast) ? value.broadcast : undefined;
  return {
    event: "posted",
    data: {
      post: postValue as string | MattermostPost,
      ...(typeof value.data.channel_type === "string" ? { channel_type: value.data.channel_type } : {}),
      ...(typeof value.data.team_id === "string" ? { team_id: value.data.team_id } : {}),
      ...(typeof value.data.sender_name === "string" ? { sender_name: value.data.sender_name } : {}),
    },
    ...(broadcast ? { broadcast: {
      ...(typeof broadcast.channel_id === "string" ? { channel_id: broadcast.channel_id } : {}),
      ...(typeof broadcast.user_id === "string" ? { user_id: broadcast.user_id } : {}),
      ...(typeof broadcast.team_id === "string" ? { team_id: broadcast.team_id } : {}),
    } } : {}),
  };
}

function mentionPattern(username: string): RegExp | null {
  if (!username) return null;
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[,:;.!?])`, "ig");
}

function hasMention(text: string, username: string): boolean {
  const pattern = mentionPattern(username);
  return pattern ? pattern.test(text) : false;
}

function stripMention(text: string, username: string): string {
  const pattern = mentionPattern(username);
  if (!pattern) return text.trim();
  return text.replace(pattern, " ").replace(/\s+/g, " ").trim();
}

export function normalizeMattermostIngress(claim: ConnectorIngressClaim, config: MattermostConnectorConfig): ConnectorIngressDisposition {
  try {
    const event = parsePostedEvent(claim.ingress.payload);
    if (!event) return { kind: "ignored", reason: "unsupported Mattermost event" };
    const post = parseMattermostPost(event.data.post);
    if (event.broadcast?.channel_id && event.broadcast.channel_id !== post.channel_id) {
      throw new MattermostError("MATTERMOST_INGRESS_INVALID", "Mattermost broadcast channel does not match the post", false);
    }
    if (event.broadcast?.user_id && event.broadcast.user_id !== post.user_id) {
      throw new MattermostError("MATTERMOST_INGRESS_INVALID", "Mattermost broadcast user does not match the post", false);
    }
    if (event.data.team_id && event.broadcast?.team_id && event.data.team_id !== event.broadcast.team_id) {
      throw new MattermostError("MATTERMOST_INGRESS_INVALID", "Mattermost broadcast team does not match the event", false);
    }
    if (post.user_id === config.botUserId) return { kind: "ignored", reason: "Mattermost self message" };
    if (post.type) return { kind: "ignored", reason: "Mattermost system post" };
    const channelType = event.data.channel_type ?? "";
    const direct = channelType === "D" || channelType === "G";
    const botUsername = config.botUsername ?? "";
    const mentioned = hasMention(post.message, botUsername);
    if (!direct && config.requireMention && !mentioned) return { kind: "ignored", reason: "Mattermost channel message did not mention the bot" };
    const text = direct ? post.message.trim() : stripMention(post.message, botUsername);
    if (!text) return { kind: "ignored", reason: "Mattermost message is empty after routing normalization" };
    const teamId = event.data.team_id ?? event.broadcast?.team_id ?? "";
    return {
      kind: "message",
      route: {
        workspaceId: config.workspaceId,
        externalScopeId: direct ? `direct:${post.channel_id}` : `team:${teamId || "none"}`,
        externalConversationId: post.channel_id,
        ...(post.root_id ? { externalThreadId: post.root_id } : {}),
        title: direct ? `Mattermost direct ${post.channel_id}` : `Mattermost channel ${post.channel_id}`,
      },
      text,
    };
  } catch (error) {
    if (error instanceof MattermostError) throw new ConnectorIngressError(error.code, error.message, error.retryable);
    throw error;
  }
}

export function parseMattermostDelivery(claim: ConnectorDeliveryClaim): { readonly channelId: string; readonly rootId?: string; readonly message: string } {
  if (!isRecord(claim.delivery.payload)) throw new MattermostError("MATTERMOST_DELIVERY_INVALID", "Mattermost delivery payload is invalid", false);
  const text = claim.delivery.payload.text;
  if (typeof text !== "string" || !text.trim() || text.length > 65_536) {
    throw new MattermostError("MATTERMOST_DELIVERY_INVALID", "Mattermost delivery text is invalid", false);
  }
  const channelId = claim.delivery.targetKey;
  if (!channelId || channelId.length > 256 || /\s/.test(channelId)) {
    throw new MattermostError("MATTERMOST_DELIVERY_INVALID", "Mattermost delivery channel is invalid", false);
  }
  const rootId = claim.delivery.threadKey || undefined;
  if (rootId && (rootId.length > 256 || /\s/.test(rootId))) {
    throw new MattermostError("MATTERMOST_DELIVERY_INVALID", "Mattermost delivery thread is invalid", false);
  }
  return { channelId, ...(rootId ? { rootId } : {}), message: text.trim() };
}
