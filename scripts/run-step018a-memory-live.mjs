import { spawn } from "node:child_process";

const STEP = "STEP018A_DURABLE_AGENT_MEMORY_AND_CONTEXT_RECALL_FOUNDATION";
const VERSION = "0.18.0-step018a";
const SCHEMA = 16;

if (process.platform !== "win32") {
  throw new Error("OPENRILL_STEP018A_WINDOWS_REQUIRED");
}

const files = [
  "tests/unit/memory-step018a.test.mjs",
  "tests/unit/memory-agent-recall-step018a.test.mjs",
  "tests/unit/memory-host-integration-step018a.test.mjs",
];
const child = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...files], {
  cwd: process.cwd(),
  env: { ...process.env, NO_COLOR: "1", NODE_DISABLE_COLORS: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (value) => resolve(value ?? 1));
});
const value = (name) => Number([...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))].at(-1)?.[1] ?? -1);
const tests = value("tests");
const passed = value("pass");
const failed = value("fail");
const skipped = value("skipped");
if (code !== 0 || tests !== 6 || passed !== 6 || failed !== 0 || skipped !== 0) {
  throw new Error(`OPENRILL_STEP018A_MEMORY_LIVE_FAILED code=${code} tests=${tests} pass=${passed} fail=${failed} skipped=${skipped}`);
}
console.log(`${STEP} checks=6/6 state=PASSED version=${VERSION} schema=${SCHEMA} memory=SQLITE_FTS5_DURABLE recall=SEARCH_THEN_GET provenance=CONVERSATION_RUN workspace=ISOLATED sensitive=REJECTED host=ACTUAL_SCRIPTED_MODEL external_model=NOT_RUN browser=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM cleanup=QUIESCENT`);
