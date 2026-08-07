import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const STEP = "STEP020B_DURABLE_TASK_FLOW_REGISTRY_AND_CONTROLLER_LIFECYCLE_FOUNDATION";
const VERSION = "0.20.1-step020b";
const SCHEMA = 19;
const LIVE_HARNESS = "STEP020B_H1_TASK_FLOW_PROTOCOL_RESTART_REVISION_AND_CANCELLATION";
if (process.platform !== "win32") throw new Error("OPENRILL_STEP020B_WINDOWS_REQUIRED");

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
  "tests/unit/task-flow-registry-step020b.test.mjs",
  "tests/unit/task-flow-protocol-step020b.test.mjs",
  "tests/unit/task-flow-host-step020b.test.mjs",
];
const focused = await spawnCapture(["--test", "--test-concurrency=1", "--test-reporter=tap", ...tests]);
const tap = (name) => Number([...focused.output.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))].at(-1)?.[1] ?? -1);
check("platform", process.platform === "win32", process.platform);
check("focused-exit", focused.code === 0, String(focused.code));
check("focused-tests", tap("tests") === 6, String(tap("tests")));
check("focused-pass", tap("pass") === 6, String(tap("pass")));
check("focused-fail", tap("fail") === 0, String(tap("fail")));
check("focused-skipped", tap("skipped") === 0, String(tap("skipped")));
const stateRuntime = await import(new URL("../packages/state/dist/index.js", import.meta.url));
const runtimeSchema = Number(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
check("schema", runtimeSchema === SCHEMA, String(runtimeSchema));
check("version", pkg.version === VERSION, String(pkg.version));
check("revision", focused.output.includes("revision-CAS across waiting, blocked, resume, and success"));
check("restart", focused.output.includes("Host restart preserves Task Flow identity and protocol cancellation finalizes it"));
check("cancellation", focused.output.includes("terminally cancels all active child Tasks"));
check("protocol", focused.output.includes("taskFlow.list, taskFlow.get, and taskFlow.cancel"));
const passed = checks.filter((item) => item.passed).length;
const state = passed === checks.length ? "PASSED" : "FAILED";
console.log(`${STEP} checks=${passed}/${checks.length} state=${state} version=${VERSION} schema=${SCHEMA} task_flow=CONTROLLER_OWNED_REGISTRY revision=OPTIMISTIC_CAS restart=FLOW_IDENTITY_STABLE tasks=ONE_FLOW_MANY_TASKS cancellation=CHILD_TASK_CASCADE terminal=MONOTONE executor=DEFERRED provider=SCRIPTED_LOCAL live_harness=${LIVE_HARNESS}`);
for (const item of checks.filter((entry) => !entry.passed)) console.error(`OPENRILL_STEP020B_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if (state !== "PASSED") process.exitCode = 1;
