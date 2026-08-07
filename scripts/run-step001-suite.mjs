import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const UNIT_TEST_CONCURRENCY = 1;
const unitTests = (await readdir(new URL("../tests/unit/", import.meta.url)))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => `tests/unit/${name}`);

const commands = [
  ["node", ["scripts/check-runtime.mjs"]],
  ["node", ["scripts/workspace-runner.mjs", "clean"]],
  ["node", ["scripts/workspace-runner.mjs", "build"]],
  ["node", ["--test", `--test-concurrency=${UNIT_TEST_CONCURRENCY}`, "--test-reporter=tap", ...unitTests]],
  ["python", ["scripts/check_architecture.py"]],
  ["node", ["scripts/check-exports.mjs"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      NO_COLOR: "1",
      NODE_DISABLE_COLORS: "1",
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
    },
  });
  if (result.error) {
    process.stderr.write(`OPENRILL_SUITE_SPAWN_FAILED command=${command} code=${result.error.code ?? "UNKNOWN"}\n`);
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}
process.stdout.write(
  `OPENRILL_STEP001_SUITE_PASS unit_files=${unitTests.length} reporter=TAP concurrency=${UNIT_TEST_CONCURRENCY}\n`,
);
