import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrap, down, status, up } from "../src/testbed.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] ?? "status";
try {
  if (command === "up") { const config = await up(root); console.log(`MATTERMOST_TESTBED_READY base_url=${config.baseUrl}`); }
  else if (command === "bootstrap") { const value = await bootstrap(root); console.log(`MATTERMOST_TESTBED_BOOTSTRAP_PASS channel_id=${value.channelId} actors=2 tokens=REDACTED`); }
  else if (command === "down") { await down(root, process.env, false); console.log("MATTERMOST_TESTBED_DOWN_PASS volumes=retained"); }
  else if (command === "reset") { await down(root, process.env, true); console.log("MATTERMOST_TESTBED_RESET_PASS volumes=deleted"); }
  else if (command === "status") { const result = await status(root); process.exitCode = result.code; }
  else throw new Error("MATTERMOST_TESTBED_COMMAND_INVALID");
} catch (error) { console.error(`MATTERMOST_TESTBED_FAIL code=${error?.message ?? "UNKNOWN"}`); process.exitCode = 1; }
