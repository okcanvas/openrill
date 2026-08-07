import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const STEP = "STEP020A_DURABLE_BACKGROUND_TASK_LEDGER_AND_RUNTIME_LIFECYCLE_FOUNDATION";
const VERSION = "0.20.0-step020a";
const SCHEMA = 18;
const LIVE_HARNESS = "STEP020A_H1_DURABLE_TASK_PROTOCOL_RESTART_AND_CANCELLATION";
if (process.platform !== "win32") throw new Error("OPENRILL_STEP020A_WINDOWS_REQUIRED");

function spawnCapture(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: "1", NODE_DISABLE_COLORS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code: code ?? 1, output }));
  });
}

const checks = [];
const check = (name, value, detail = "") => checks.push({ name, passed: Boolean(value), detail });
const tests = [
  "tests/unit/background-task-ledger-step020a.test.mjs",
  "tests/unit/background-task-protocol-step020a.test.mjs",
  "tests/unit/background-task-automation-step020a.test.mjs",
  "tests/unit/background-task-host-step020a.test.mjs",
];
const focused = await spawnCapture(["--test", "--test-concurrency=1", "--test-reporter=tap", ...tests]);
const tap = (name) => Number([...focused.output.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))].at(-1)?.[1] ?? -1);
check("platform", process.platform === "win32", process.platform);
check("focused-exit", focused.code === 0, String(focused.code));
check("focused-tests", tap("tests") === 9, String(tap("tests")));
check("focused-pass", tap("pass") === 9, String(tap("pass")));
check("focused-fail", tap("fail") === 0, String(tap("fail")));
check("focused-skipped", tap("skipped") === 0, String(tap("skipped")));
const stateRuntime = await import(new URL("../packages/state/dist/index.js", import.meta.url));
const runtimeSchema = Number(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
check("schema", runtimeSchema === SCHEMA, String(runtimeSchema));
check("version", pkg.version === VERSION, String(pkg.version));
check("task-restart", focused.output.includes("preserves one Task identity and reaches SUCCEEDED"));
check("task-cancel", focused.output.includes("terminally cancels its owning Run and is replay-safe"));
check("protocol", focused.output.includes("task.list, task.get, and task.cancel"));
check("no-external-model", !focused.output.includes("OPENAI_API_KEY") && !focused.output.includes("Bearer "));
const passed = checks.filter((item) => item.passed).length;
const state = passed === checks.length ? "PASSED" : "FAILED";
console.log(`${STEP} checks=${passed}/${checks.length} state=${state} version=${VERSION} schema=${SCHEMA} task=RUN_LINKED_LEDGER runtime=CONVERSATION_DELEGATION_AUTOMATION restart=TASK_IDENTITY_STABLE cancellation=OWNING_RUN_TERMINAL flow=DEFERRED provider=SCRIPTED_LOCAL live_harness=${LIVE_HARNESS} external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM cleanup=QUIESCENT`);
for (const item of checks.filter((candidate) => !candidate.passed)) {
  console.log(`OPENRILL_STEP020A_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
}
if (state !== "PASSED") process.exitCode = 1;
