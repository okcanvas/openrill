import { ConnectorDeliveryError } from "@openrill/connectors";
import { MattermostError } from "./errors.js";
import { assertMattermostNetworkAllowed, mattermostApiUrl, normalizeMattermostBaseUrl } from "./url.js";
import type { MattermostCreatePostResponse, MattermostFetch, MattermostUser } from "./types.js";

const MAX_SUCCESS_BYTES = 1_048_576;
const MAX_ERROR_BYTES = 8_192;

async function readLimited(response: Response, maximumBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new MattermostError("MATTERMOST_RESPONSE_TOO_LARGE", "Mattermost response exceeds the size limit", false);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    if (!result.value) continue;
    total += result.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new MattermostError("MATTERMOST_RESPONSE_TOO_LARGE", "Mattermost response exceeds the size limit", false);
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseUser(value: unknown): MattermostUser {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || typeof value.username !== "string" || !value.username) {
    throw new MattermostError("MATTERMOST_RESPONSE_INVALID", "Mattermost user response is invalid", false);
  }
  return { id: value.id, username: value.username };
}

function parseCreatedPost(value: unknown): MattermostCreatePostResponse {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || typeof value.channel_id !== "string" || !value.channel_id) {
    throw new MattermostError("MATTERMOST_RESPONSE_INVALID", "Mattermost post response is invalid", false);
  }
  return {
    id: value.id,
    channel_id: value.channel_id,
    ...(typeof value.root_id === "string" ? { root_id: value.root_id } : {}),
    ...(typeof value.create_at === "number" ? { create_at: value.create_at } : {}),
  };
}

export interface MattermostClientOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly allowPrivateNetwork: boolean;
  readonly timeoutMs: number;
  readonly fetchImpl?: MattermostFetch;
}

export class MattermostClient {
  readonly baseUrl: string;
  readonly #token: string;
  readonly #allowPrivateNetwork: boolean;
  readonly #timeoutMs: number;
  readonly #fetch: MattermostFetch;

  public constructor(options: MattermostClientOptions) {
    this.baseUrl = normalizeMattermostBaseUrl(options.baseUrl);
    this.#token = options.token.trim();
    if (!this.#token || this.#token.length > 8192) {
      throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost bot token is invalid", false);
    }
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 120_000) {
      throw new MattermostError("MATTERMOST_CONFIG_INVALID", "Mattermost request timeout is invalid", false);
    }
    this.#allowPrivateNetwork = options.allowPrivateNetwork;
    this.#timeoutMs = options.timeoutMs;
    this.#fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  public async request(path: string, init: RequestInit = {}, delivery = false): Promise<unknown> {
    const url = mattermostApiUrl(this.baseUrl, path);
    await assertMattermostNetworkAllowed(url, this.#allowPrivateNetwork);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    timer.unref();
    const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.#token}`);
    if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    let dispatchStarted = false;
    try {
      dispatchStarted = true;
      const response = await this.#fetch(url, { ...init, headers, signal });
      if (!response.ok) {
        const body = await readLimited(response, MAX_ERROR_BYTES).catch(() => "");
        const code = response.status === 401 || response.status === 403 ? "MATTERMOST_AUTH_FAILED" : "MATTERMOST_API_REJECTED";
        throw new MattermostError(code, `Mattermost API rejected request (${response.status})${body ? `: ${body.slice(0, 256)}` : ""}`, response.status === 408 || response.status === 429 || response.status >= 500, delivery ? "REJECTED" : undefined);
      }
      if (response.status === 204) return null;
      const body = await readLimited(response, MAX_SUCCESS_BYTES);
      if (!body) return null;
      try { return JSON.parse(body); }
      catch { throw new MattermostError("MATTERMOST_RESPONSE_INVALID", "Mattermost response is not valid JSON", false); }
    } catch (error) {
      if (error instanceof MattermostError) throw error;
      if (controller.signal.aborted) throw new MattermostError("MATTERMOST_API_UNAVAILABLE", "Mattermost request timed out", true, delivery && dispatchStarted ? "MAYBE_ACCEPTED" : undefined);
      throw new MattermostError("MATTERMOST_API_UNAVAILABLE", "Mattermost request failed before a response was accepted", true, delivery && dispatchStarted ? "MAYBE_ACCEPTED" : undefined);
    } finally {
      clearTimeout(timer);
    }
  }

  public async getMe(signal?: AbortSignal): Promise<MattermostUser> {
    return parseUser(await this.request("/users/me", signal ? { signal } : {}));
  }

  public async createPost(input: { readonly channelId: string; readonly rootId?: string; readonly message: string }, signal?: AbortSignal): Promise<MattermostCreatePostResponse> {
    try {
      return parseCreatedPost(await this.request("/posts", {
        method: "POST",
        body: JSON.stringify({ channel_id: input.channelId, message: input.message, ...(input.rootId ? { root_id: input.rootId } : {}) }),
        ...(signal ? { signal } : {}),
      }, true));
    } catch (error) {
      if (error instanceof MattermostError) {
        const certainty = error.deliveryCertainty ?? (error.code === "MATTERMOST_AUTH_FAILED" || error.code === "MATTERMOST_API_REJECTED" ? "REJECTED" : "MAYBE_ACCEPTED");
        throw new ConnectorDeliveryError(error.code, error.message, certainty, certainty === "MAYBE_ACCEPTED" ? false : error.retryable);
      }
      throw new ConnectorDeliveryError("MATTERMOST_API_UNAVAILABLE", "Mattermost request failed before dispatch", "NOT_SENT", true);
    }
  }
}
