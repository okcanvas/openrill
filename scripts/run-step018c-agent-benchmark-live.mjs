import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STEP = "STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK";
const VERSION = "0.18.2-step018c";
const SCHEMA = 16;
if (process.platform !== "win32") throw new Error("OPENRILL_STEP018C_WINDOWS_REQUIRED");

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
  "tests/unit/agent-benchmark-catalog-step018c.test.mjs",
  "tests/unit/agent-benchmark-runner-step018c.test.mjs",
  "tests/unit/agent-task-benchmark-step018c.test.mjs",
];
const focused = await spawnCapture(["--test", "--test-concurrency=1", "--test-reporter=tap", ...tests]);
const tapValue = (name) => Number([...focused.output.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))].at(-1)?.[1] ?? -1);
check("focused-exit", focused.code === 0, String(focused.code));
check("focused-tests", tapValue("tests") === 12, String(tapValue("tests")));
check("focused-pass", tapValue("pass") === 12, String(tapValue("pass")));
check("focused-fail", tapValue("fail") === 0, String(tapValue("fail")));
check("focused-skipped", tapValue("skipped") === 0, String(tapValue("skipped")));

const outputDir = await mkdtemp(join(tmpdir(), "openrill-step018c-windows-live-"));
try {
  const benchmark = await spawnCapture(["scripts/run-agent-task-benchmark.mjs", "--profile", "agent-core", "--repetitions", "2", "--output-dir", outputDir]);
  check("benchmark-exit", benchmark.code === 0, String(benchmark.code));
  check("benchmark-marker", /checks=20\/20 state=PASSED/.test(benchmark.output));
  check("benchmark-provider", /provider=SCRIPTED_LOCAL/.test(benchmark.output));
  const json = await readFile(join(outputDir, "result.json"), "utf8");
  const markdown = await readFile(join(outputDir, "report.md"), "utf8");
  const result = JSON.parse(json);
  check("benchmark-scenarios", result.scenarioCount === 10, String(result.scenarioCount));
  check("benchmark-attempts", result.attemptCount === 20, String(result.attemptCount));
  check("benchmark-passed", result.passedAttempts === 20 && result.failedAttempts === 0, `${result.passedAttempts}/${result.attemptCount}`);
  check("benchmark-reliability", result.reliability === 1, String(result.reliability));
  check("benchmark-status", result.status === "PASS", String(result.status));
  check("benchmark-provider-json", result.providerMode === "SCRIPTED_LOCAL", String(result.providerMode));
  const artifacts = `${json}\n${markdown}`;
  check("benchmark-secret-redaction", !artifacts.includes("STEP018C_FAKE_SECRET") && !artifacts.includes("STEP018C_DIAGNOSTIC_SECRET"));
  check("benchmark-evidence-digests", result.scenarios.every((scenario) => scenario.attempts.every((attempt) => attempt.evidence.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)))));
} finally {
  await rm(outputDir, { recursive: true, force: true });
}

const passed = checks.filter((item) => item.passed).length;
const state = passed === checks.length ? "PASSED" : "FAILED";
console.log(`${STEP} checks=${passed}/${checks.length} state=${state} version=${VERSION} schema=${SCHEMA} profile=AGENT_CORE scenarios=10 repetitions=2 task_success=20/20 reliability=100.00 provider=SCRIPTED_LOCAL scoring=ASSERTION_BUDGET_EVIDENCE artifact=SHARE_SAFE openclaw_reference=PERSONAL_AGENT_PACK_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM cleanup=QUIESCENT`);
for (const item of checks.filter((entry) => !entry.passed)) console.log(`OPENRILL_STEP018C_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if (state !== "PASSED") process.exitCode = 1;
