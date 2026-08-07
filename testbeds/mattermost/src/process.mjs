import { spawn } from "node:child_process";

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit", ...options });
    let stdout = ""; let stderr = "";
    if (options.capture) {
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
      child.stdout.on("data", chunk => { stdout += chunk; });
      child.stderr.on("data", chunk => { stderr += chunk; });
    }
    child.once("error", reject);
    child.once("exit", code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export async function requireDocker(root, env) {
  const version = await run("docker", ["compose", "version"], { cwd: root, env, capture: true });
  if (version.code !== 0) throw new Error("MATTERMOST_TESTBED_DOCKER_COMPOSE_REQUIRED");
  return version.stdout.trim();
}
