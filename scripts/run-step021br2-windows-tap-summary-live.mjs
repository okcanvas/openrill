import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { loadStep021br2LiveMarkerContract, renderStep021br2LiveMarker } from "./step021br2-live-marker.mjs";
import { parseNodeTapSummary } from "./node-tap-summary.mjs";

const contract = await loadStep021br2LiveMarkerContract();
if (process.platform !== "win32") throw new Error("OPENRILL_STEP021BR2_WINDOWS_REQUIRED");

function spawnCapture(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: "1", NODE_DISABLE_COLORS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code: code ?? 1, output }));
  });
}

const tests = [
  "tests/unit/goal-plan-executor-step021a.test.mjs",
  "tests/unit/goal-plan-executor-protocol-step021a.test.mjs",
  "tests/unit/goal-plan-executor-host-step021a.test.mjs",
  "tests/unit/goal-plan-revision-retry-step021b.test.mjs",
  "tests/unit/goal-plan-revision-migration-step021b.test.mjs",
  "tests/unit/goal-plan-revision-retry-protocol-step021b.test.mjs",
  "tests/unit/goal-plan-revision-host-step021b.test.mjs",
  "tests/unit/node-tap-summary-step021br2.test.mjs",
];
const focused = await spawnCapture(["--test", "--test-concurrency=1", "--test-reporter=tap", ...tests]);
const tap = parseNodeTapSummary(focused.output);
const syntheticLf = parseNodeTapSummary("# tests 22\n# pass 22\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n");
const syntheticCrlf = parseNodeTapSummary("# tests 22\r\n# pass 22\r\n# fail 0\r\n# cancelled 0\r\n# skipped 0\r\n# todo 0\r\n");

const checks = [];
const check = (name, value, detail = "") => checks.push({ name, passed: Boolean(value), detail });
check("platform", process.platform === "win32", process.platform);
check("focused-exit", focused.code === 0, String(focused.code));
check("focused-tests", tap.tests === 26, String(tap.tests));
check("focused-pass", tap.pass === 26, String(tap.pass));
check("focused-fail", tap.fail === 0, String(tap.fail));
check("focused-cancelled", tap.cancelled === 0, String(tap.cancelled));
check("focused-skipped", tap.skipped === 0, String(tap.skipped));
check("focused-todo", tap.todo === 0, String(tap.todo));
check("tap-parser-lf", syntheticLf.tests === 22 && syntheticLf.pass === 22 && syntheticLf.fail === 0, JSON.stringify(syntheticLf));
check("tap-parser-crlf", syntheticCrlf.tests === 22 && syntheticCrlf.pass === 22 && syntheticCrlf.fail === 0, JSON.stringify(syntheticCrlf));

const stateRuntime = await import(new URL("../packages/state/dist/index.js", import.meta.url));
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
check("schema", Number(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION) === Number(contract.schema), String(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION));
check("version", pkg.version === contract.version, String(pkg.version));
check("immutable-snapshot", focused.output.includes("pins active execution to an immutable Plan snapshot"));
check("revision-replay", focused.output.includes("newer revision is created and replayed"));
check("stable-adoption", focused.output.includes("explicit adoption preserves completed stable Steps"));
check("changed-step-reset", focused.output.includes("changed completed Step is reset"));
check("pinned-projection-isolation", focused.output.includes("pinned completion cannot contaminate the current Plan"));
check("open-blocker-unbounded", focused.output.includes("open blocker beyond the first 200 historical ledger rows"));
check("blocker-ledger", focused.output.includes("creates a durable blocker"));
check("manual-retry", focused.output.includes("failed Step retries are manual"));
check("retry-limit", focused.output.includes("stop at the durable maxAttempts limit"));
check("stale-decision", focused.output.includes("stale controller decision snapshot is rejected"));
check("migration", focused.output.includes("schema 24 snapshots the active Plan revision"));
check("closed-protocol", focused.output.includes("closed input validation"));
check("host-changed-reexecution", focused.output.includes("Host restart reruns a changed completed Step"));
check("host-no-duplicate-four", focused.output.includes("preserves duplicate-free revision adoption"));
check("step021a-loop", focused.output.includes("closes the ordered Goal Plan loop"));
check("step021a-restart", focused.output.includes("Host restart resumes the same active Plan Step Task"));

const passed = checks.filter((item) => item.passed).length;
const state = passed === checks.length ? "PASSED" : "FAILED";
console.log(renderStep021br2LiveMarker(contract, { passed, total: checks.length, state }));
for (const item of checks.filter((entry) => !entry.passed)) {
  console.error(`OPENRILL_STEP021BR2_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
}
if (state !== "PASSED") process.exitCode = 1;
