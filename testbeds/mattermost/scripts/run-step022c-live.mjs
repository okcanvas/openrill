import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrap, up } from "../src/testbed.mjs";

const testbedRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const openrillRoot = resolve(testbedRoot, "..", "..");
const packagePath = resolve(openrillRoot, "package.json");
const acceptancePath = resolve(openrillRoot, "scripts", "run_step022c_acceptance.py");
if (!existsSync(packagePath) || !existsSync(acceptancePath)) {
  console.error("MATTERMOST_TESTBED_OPENRILL_ROOT_INVALID");
  process.exit(2);
}
const pkg = JSON.parse(await readFile(packagePath, "utf8"));
if (pkg.name !== "openrill" || pkg.version !== "0.24.0-step022c" || pkg.scripts?.["acceptance:step022c:live"] !== "python scripts/run_step022c_acceptance.py --require-windows-mattermost-live") {
  console.error(`MATTERMOST_TESTBED_OPENRILL_IDENTITY_INVALID name=${pkg.name ?? ""} version=${pkg.version ?? ""}`);
  process.exit(2);
}
const config = await up(testbedRoot);
const seeded = await bootstrap(testbedRoot);
const env = {
  ...process.env,
  OPENRILL_MATTERMOST_BASE_URL: seeded.baseUrl,
  OPENRILL_MATTERMOST_BOT_TOKEN: seeded.botToken,
  OPENRILL_MATTERMOST_TEST_USER_TOKEN: seeded.userToken,
  OPENRILL_MATTERMOST_TEST_CHANNEL_ID: seeded.channelId,
  OPENRILL_MATTERMOST_ALLOW_PRIVATE_NETWORK: "1",
};
console.log(`MATTERMOST_TESTBED_LIVE_START root=${openrillRoot} base_url=${config.baseUrl} channel_id=${seeded.channelId} tokens=REDACTED`);
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const code = await new Promise((resolveExit, reject) => {
  const child = spawn(command, ["acceptance:step022c:live"], { cwd: openrillRoot, env, stdio: "inherit", shell: false });
  child.once("error", reject);
  child.once("exit", value => resolveExit(value ?? 1));
});
process.exitCode = code;
