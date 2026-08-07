import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

function parseArgs(argv) {
  let expectedTests = null;
  let batchSize = 16;
  let fileTimeoutMs = 180_000;
  const files = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--expected-tests") expectedTests = Number(argv[++index]);
    else if (arg === "--batch-size") batchSize = Number(argv[++index]);
    else if (arg === "--file-timeout-ms") fileTimeoutMs = Number(argv[++index]);
    else files.push(arg);
  }
  if (expectedTests !== null && (!Number.isSafeInteger(expectedTests) || expectedTests < 1)) throw new TypeError("--expected-tests must be positive");
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 64) throw new TypeError("--batch-size must be 1..64");
  if (!Number.isSafeInteger(fileTimeoutMs) || fileTimeoutMs < 1_000 || fileTimeoutMs > 900_000) throw new TypeError("--file-timeout-ms must be 1000..900000");
  return { expectedTests, batchSize, fileTimeoutMs, files };
}

function parseSummary(output) {
  const value = (name) => {
    const matches = [...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))];
    return matches.length ? Number(matches.at(-1)[1]) : null;
  };
  return { tests: value("tests"), pass: value("pass"), fail: value("fail"), skipped: value("skipped") };
}

async function defaultFiles() {
  return (await readdir(resolve("tests/unit"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => `tests/unit/${entry.name}`)
    .sort();
}

async function runFile(file, batchNumber, fileNumber, timeoutMs) {
  console.log(`OPENRILL_CANONICAL_FILE_START batch=${batchNumber} file_number=${fileNumber} path=${JSON.stringify(file)} timeout_ms=${timeoutMs}`);
  const env = { ...process.env, NO_COLOR: "1", NODE_DISABLE_COLORS: "1", TERM: "dumb" };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", file], {
    cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
  const code = await new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (exitCode) => resolveExit(exitCode ?? 1));
  });
  clearTimeout(timer);
  if (timedOut) throw new Error(`OPENRILL_CANONICAL_FILE_TIMEOUT batch=${batchNumber} file_number=${fileNumber} path=${JSON.stringify(file)} timeout_ms=${timeoutMs}`);
  const summary = parseSummary(output);
  const ok = code === 0 && summary.tests !== null && summary.tests === summary.pass && summary.fail === 0 && summary.skipped === 0;
  console.log(`OPENRILL_CANONICAL_FILE_END batch=${batchNumber} file_number=${fileNumber} path=${JSON.stringify(file)} state=${ok ? "PASS" : "FAIL"} returncode=${code} tests=${summary.tests} pass=${summary.pass} fail=${summary.fail} skipped=${summary.skipped}`);
  if (!ok) throw new Error(`OPENRILL_CANONICAL_FILE_FAILED batch=${batchNumber} file_number=${fileNumber} path=${JSON.stringify(file)} returncode=${code} summary=${JSON.stringify(summary)}`);
  return summary;
}

const { expectedTests, batchSize, fileTimeoutMs, files: explicitFiles } = parseArgs(process.argv.slice(2));
const files = explicitFiles.length ? explicitFiles : await defaultFiles();
if (!files.length) throw new Error("OPENRILL_CANONICAL_BATCH_FILES_MISSING");
let totals = { tests: 0, pass: 0, fail: 0, skipped: 0 };
let batches = 0;
let fileNumber = 0;
for (let offset = 0; offset < files.length; offset += batchSize) {
  batches += 1;
  const batchFiles = files.slice(offset, offset + batchSize);
  console.log(`OPENRILL_CANONICAL_BATCH_START batch=${batches} files=${batchFiles.length}`);
  const batchTotals = { tests: 0, pass: 0, fail: 0, skipped: 0 };
  for (const file of batchFiles) {
    fileNumber += 1;
    const summary = await runFile(file, batches, fileNumber, fileTimeoutMs);
    for (const key of Object.keys(batchTotals)) batchTotals[key] += summary[key];
  }
  for (const key of Object.keys(totals)) totals[key] += batchTotals[key];
  console.log(`OPENRILL_CANONICAL_BATCH_END batch=${batches} state=PASS tests=${batchTotals.tests} pass=${batchTotals.pass} fail=${batchTotals.fail} skipped=${batchTotals.skipped}`);
}
if (expectedTests !== null && totals.tests !== expectedTests) throw new Error(`OPENRILL_CANONICAL_TOTAL_MISMATCH expected=${expectedTests} actual=${totals.tests}`);
if (totals.tests !== totals.pass || totals.fail !== 0 || totals.skipped !== 0) throw new Error(`OPENRILL_CANONICAL_TOTAL_FAILED ${JSON.stringify(totals)}`);
console.log(`OPENRILL_CANONICAL_BATCHES_PASS files=${files.length} batches=${batches} tests=${totals.tests} pass=${totals.pass} fail=${totals.fail} skipped=${totals.skipped}`);
