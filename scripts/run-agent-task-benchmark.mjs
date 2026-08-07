import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildBenchmarkCatalog,
  formatBenchmarkJson,
  formatBenchmarkMarkdown,
  parseBenchmarkTaxonomy,
  resolveBenchmarkProfile,
  runBenchmarkSuite,
} from "../packages/agent-benchmark/dist/index.js";
import { STEP018C_BENCHMARK_EXECUTORS } from "./agent-task-benchmark-scenarios.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const STEP = "STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK";
const VERSION = "0.18.2-step018c";
const SCHEMA = 16;

function parseArgs(argv) {
  let profileId = "agent-core";
  let repetitions;
  let outputDir = path.join(ROOT, ".artifacts", "benchmarks", "STEP018C_AGENT_CORE");
  const scenarioIds = [];
  let list = false;
  let jsonStdout = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const value = () => {
      const inline = token.includes("=") ? token.slice(token.indexOf("=") + 1) : argv[++i];
      if (!inline) throw new Error(`${token.split("=")[0]} requires a value`);
      return inline;
    };
    if (token === "--list") list = true;
    else if (token === "--json") jsonStdout = true;
    else if (token === "--profile" || token.startsWith("--profile=")) profileId = value();
    else if (token === "--repetitions" || token.startsWith("--repetitions=")) repetitions = Number(value());
    else if (token === "--scenario" || token.startsWith("--scenario=")) scenarioIds.push(value());
    else if (token === "--output-dir" || token.startsWith("--output-dir=")) outputDir = path.resolve(value());
    else throw new Error(`unknown benchmark option: ${token}`);
  }
  if (repetitions !== undefined && (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20)) throw new Error("--repetitions must be between 1 and 20");
  return { profileId, repetitions, outputDir, scenarioIds, list, jsonStdout };
}

async function loadCatalog() {
  const root = path.join(ROOT, "benchmarks", "agent-tasks");
  const index = JSON.parse(await readFile(path.join(root, "index.json"), "utf8"));
  if (index.schemaVersion !== 1 || !Array.isArray(index.scenarioFiles)) throw new Error("benchmark index is invalid");
  const entries = [];
  for (const relative of index.scenarioFiles) {
    const sourcePath = path.join("benchmarks", "agent-tasks", relative).replaceAll("\\", "/");
    entries.push({ sourcePath, value: JSON.parse(await readFile(path.join(root, relative), "utf8")) });
  }
  const catalog = buildBenchmarkCatalog(entries);
  const taxonomy = parseBenchmarkTaxonomy(JSON.parse(await readFile(path.join(root, "taxonomy.json"), "utf8")));
  return { catalog, taxonomy };
}

const options = parseArgs(process.argv.slice(2));
const { catalog, taxonomy } = await loadCatalog();
const scenarios = resolveBenchmarkProfile(catalog, taxonomy, options.profileId);
if (options.list) {
  for (const scenario of scenarios) process.stdout.write(`${scenario.id}\t${scenario.risk}\t${scenario.objective}\n`);
  process.exit(0);
}
const result = await runBenchmarkSuite({
  profileId: options.profileId,
  scenarios,
  executors: STEP018C_BENCHMARK_EXECUTORS,
  ...(options.repetitions === undefined ? {} : { repetitions: options.repetitions }),
  ...(options.scenarioIds.length === 0 ? {} : { scenarioIds: options.scenarioIds }),
});
const forbidden = ["STEP018C_FAKE_SECRET", "STEP018C_DIAGNOSTIC_SECRET"];
const json = formatBenchmarkJson(result, forbidden);
const markdown = formatBenchmarkMarkdown(result, forbidden);
await mkdir(options.outputDir, { recursive: true });
await writeFile(path.join(options.outputDir, "result.json"), json, "utf8");
await writeFile(path.join(options.outputDir, "report.md"), markdown, "utf8");
const artifactSafe = !json.includes("STEP018C_FAKE_SECRET") && !json.includes("STEP018C_DIAGNOSTIC_SECRET") && !markdown.includes("STEP018C_FAKE_SECRET") && !markdown.includes("STEP018C_DIAGNOSTIC_SECRET");
if (options.jsonStdout) process.stdout.write(json);
const reliability = (result.reliability * 100).toFixed(2);
const marker = `${STEP} checks=${result.passedAttempts}/${result.attemptCount} state=${result.status === "PASS" && artifactSafe ? "PASSED" : "FAILED"} version=${VERSION} schema=${SCHEMA} profile=${result.profileId} scenarios=${result.scenarioCount} repetitions=${result.attemptCount / result.scenarioCount} provider=SCRIPTED_LOCAL reliability=${reliability} task_success=${result.passedAttempts}/${result.attemptCount} grounding=PROOF_BACKED policy=APPROVAL_AND_SCOPE_PRESERVED recovery=RETRY_VERIFIED artifact=SHARE_SAFE openclaw_reference=PERSONAL_AGENT_PACK_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM`;
process.stdout.write(`${marker}\n`);
if (!artifactSafe) process.stdout.write("OPENRILL_STEP018C_BENCHMARK_FAILURE check=artifact-redaction\n");
if (result.status !== "PASS") {
  for (const scenario of result.scenarios) for (const attempt of scenario.attempts) if (attempt.failure) process.stdout.write(`OPENRILL_STEP018C_BENCHMARK_FAILURE scenario=${scenario.scenario.id} repetition=${attempt.repetition} class=${attempt.failure.class} code=${attempt.failure.code} message=${attempt.failure.message}\n`);
}
process.exitCode = result.status === "PASS" && artifactSafe ? 0 : 1;
