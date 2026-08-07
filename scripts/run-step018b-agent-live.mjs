import { spawn } from "node:child_process";

const STEP = "STEP018B_SKILL_OPERATIONS_AND_STRUCTURED_TOOL_DISCOVERY";
const VERSION = "0.18.1-step018b";
const SCHEMA = 16;

if (process.platform !== "win32") throw new Error("OPENRILL_STEP018B_WINDOWS_REQUIRED");

const files = [
  "tests/unit/tool-discovery-step018b.test.mjs",
  "tests/unit/tool-discovery-agent-step018b.test.mjs",
  "tests/unit/tool-discovery-host-step018b.test.mjs",
  "tests/unit/skill-operations-step018b.test.mjs",
];
const child = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...files], {
  cwd: process.cwd(),
  env: { ...process.env, NO_COLOR: "1", NODE_DISABLE_COLORS: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (value) => resolve(value ?? 1));
});
const value = (name) => Number([...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))].at(-1)?.[1] ?? -1);
const tests = value("tests"), passed = value("pass"), failed = value("fail"), skipped = value("skipped");
if (code !== 0 || tests !== 11 || passed !== 11 || failed !== 0 || skipped !== 0) {
  throw new Error(`OPENRILL_STEP018B_AGENT_LIVE_FAILED code=${code} tests=${tests} pass=${passed} fail=${failed} skipped=${skipped}`);
}
console.log(`${STEP} checks=11/11 state=PASSED version=${VERSION} schema=${SCHEMA} skills=LIST_SHOW_CHECK_ENABLE_DISABLE eligibility=CONFIGURED_TOOL_SET tool_discovery=SEARCH_DESCRIBE_CALL schema_visibility=BOUNDED_SKILL_PREFERRED execution=EXISTING_TOOL_REGISTRY delegation_scope=PRESERVED openclaw_reference=SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM cleanup=QUIESCENT`);
