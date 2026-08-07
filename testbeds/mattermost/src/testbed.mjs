import { resolve } from "node:path";
import { MattermostApi, bootstrapMattermost, waitForMattermost } from "./api.mjs";
import { composeEnv, loadTestbedConfig } from "./config.mjs";
import { requireDocker, run } from "./process.mjs";

export const PROJECT_NAME = "openrill-step022c-testbed";
export function composeArgs(root, ...args) { return ["compose", "-p", PROJECT_NAME, "-f", resolve(root, "docker-compose.yml"), ...args]; }

export async function up(root, processEnv = process.env) {
  const config = await loadTestbedConfig(root, processEnv);
  const env = { ...processEnv, ...composeEnv(config) };
  await requireDocker(root, env);
  const result = await run("docker", composeArgs(root, "up", "-d", "--remove-orphans"), { cwd: root, env });
  if (result.code !== 0) throw new Error("MATTERMOST_TESTBED_COMPOSE_UP_FAILED");
  const api = new MattermostApi(config.baseUrl);
  await waitForMattermost(api);
  return config;
}

export async function bootstrap(root, processEnv = process.env) {
  const config = await loadTestbedConfig(root, processEnv);
  const api = new MattermostApi(config.baseUrl);
  await waitForMattermost(api);
  return await bootstrapMattermost(api, config);
}

export async function down(root, processEnv = process.env, volumes = false) {
  const config = await loadTestbedConfig(root, processEnv);
  const env = { ...processEnv, ...composeEnv(config) };
  await requireDocker(root, env);
  const args = composeArgs(root, "down", "--remove-orphans", ...(volumes ? ["--volumes"] : []));
  const result = await run("docker", args, { cwd: root, env });
  if (result.code !== 0) throw new Error("MATTERMOST_TESTBED_COMPOSE_DOWN_FAILED");
}

export async function status(root, processEnv = process.env) {
  const config = await loadTestbedConfig(root, processEnv);
  const env = { ...processEnv, ...composeEnv(config) };
  await requireDocker(root, env);
  return await run("docker", composeArgs(root, "ps"), { cwd: root, env });
}
