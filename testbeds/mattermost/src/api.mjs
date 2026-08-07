function safeError(status, path) { return new Error(`MATTERMOST_TESTBED_API_REJECTED:${status}:${path}`); }

export class MattermostApi {
  constructor(baseUrl, fetchImpl = fetch) { this.apiBase = `${baseUrl.replace(/\/+$/u, "")}/api/v4`; this.fetch = fetchImpl; }
  async request(path, init = {}, token = "", allowed = [200, 201]) {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await this.fetch(`${this.apiBase}${path}`, { ...init, headers });
    const text = await response.text();
    let body = null;
    if (text) { try { body = JSON.parse(text); } catch { throw new Error(`MATTERMOST_TESTBED_RESPONSE_INVALID:${path}`); } }
    if (!allowed.includes(response.status)) throw safeError(response.status, path);
    return { body, headers: response.headers, status: response.status };
  }
  async ping() { return (await this.request("/system/ping", {}, "", [200])).body; }
  async createUser({ email, username, password }) {
    return (await this.request("/users", { method: "POST", body: JSON.stringify({ email, username, password }) }, "", [201])).body;
  }
  async login(loginId, password) {
    const response = await this.request("/users/login", { method: "POST", body: JSON.stringify({ login_id: loginId, password }) }, "", [200]);
    const token = response.headers.get("token");
    if (!token || typeof response.body?.id !== "string") throw new Error("MATTERMOST_TESTBED_LOGIN_TOKEN_MISSING");
    return { user: response.body, token };
  }
  async createTeam(token, name, displayName) {
    return (await this.request("/teams", { method: "POST", body: JSON.stringify({ name, display_name: displayName, type: "O" }) }, token, [201])).body;
  }
  async getTeamByName(token, name) { return (await this.request(`/teams/name/${encodeURIComponent(name)}`, {}, token, [200])).body; }
  async addTeamMember(token, teamId, userId) {
    return (await this.request(`/teams/${encodeURIComponent(teamId)}/members`, { method: "POST", body: JSON.stringify({ team_id: teamId, user_id: userId }) }, token, [201, 400])).body;
  }
  async createChannel(token, teamId, name, displayName) {
    return (await this.request("/channels", { method: "POST", body: JSON.stringify({ team_id: teamId, name, display_name: displayName, type: "O" }) }, token, [201])).body;
  }
  async getChannelByName(token, teamName, channelName) {
    return (await this.request(`/teams/name/${encodeURIComponent(teamName)}/channels/name/${encodeURIComponent(channelName)}`, {}, token, [200])).body;
  }
  async addChannelMember(token, channelId, userId) {
    return (await this.request(`/channels/${encodeURIComponent(channelId)}/members`, { method: "POST", body: JSON.stringify({ user_id: userId }) }, token, [201, 400])).body;
  }
}

function isRejected(error, status, path) { return error?.message === `MATTERMOST_TESTBED_API_REJECTED:${status}:${path}`; }

export async function waitForMattermost(api, { timeoutMs = 180_000, intervalMs = 1_000, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const result = await api.ping(); if (result?.status === "OK") return result; } catch {}
    await sleep(intervalMs);
  }
  throw new Error("MATTERMOST_TESTBED_START_TIMEOUT");
}

async function ensureLogin(api, email, username, password) {
  try { return await api.login(username, password); }
  catch (error) {
    if (!isRejected(error, 401, "/users/login")) throw error;
    try { await api.createUser({ email, username, password }); }
    catch (createError) { if (!isRejected(createError, 400, "/users")) throw createError; }
    return await api.login(username, password);
  }
}

export async function bootstrapMattermost(api, config) {
  const admin = await ensureLogin(api, config.MATTERMOST_ADMIN_EMAIL, config.MATTERMOST_ADMIN_USERNAME, config.MATTERMOST_ADMIN_PASSWORD);
  const user = await ensureLogin(api, config.MATTERMOST_USER_EMAIL, config.MATTERMOST_USER_USERNAME, config.MATTERMOST_USER_PASSWORD);
  if (admin.user.id === user.user.id) throw new Error("MATTERMOST_TESTBED_ACTORS_NOT_DISTINCT");
  let team;
  try { team = await api.getTeamByName(admin.token, config.MATTERMOST_TEAM_NAME); }
  catch (error) {
    if (!isRejected(error, 404, `/teams/name/${config.MATTERMOST_TEAM_NAME}`)) throw error;
    team = await api.createTeam(admin.token, config.MATTERMOST_TEAM_NAME, config.MATTERMOST_TEAM_DISPLAY_NAME);
  }
  await api.addTeamMember(admin.token, team.id, admin.user.id);
  await api.addTeamMember(admin.token, team.id, user.user.id);
  let channel;
  try { channel = await api.getChannelByName(admin.token, config.MATTERMOST_TEAM_NAME, config.MATTERMOST_CHANNEL_NAME); }
  catch (error) {
    if (!isRejected(error, 404, `/teams/name/${config.MATTERMOST_TEAM_NAME}/channels/name/${config.MATTERMOST_CHANNEL_NAME}`)) throw error;
    channel = await api.createChannel(admin.token, team.id, config.MATTERMOST_CHANNEL_NAME, config.MATTERMOST_CHANNEL_DISPLAY_NAME);
  }
  await api.addChannelMember(admin.token, channel.id, admin.user.id);
  await api.addChannelMember(admin.token, channel.id, user.user.id);
  return Object.freeze({
    baseUrl: config.baseUrl,
    botToken: admin.token,
    userToken: user.token,
    channelId: channel.id,
    botUserId: admin.user.id,
    userId: user.user.id,
    teamId: team.id
  });
}
