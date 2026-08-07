import { inspectRuntime } from "../openrill.mjs";

const result = inspectRuntime();
if (!result.versionSupported || !result.sqliteAvailable) {
  process.stderr.write(`OPENRILL_RUNTIME_UNSUPPORTED node=${process.versions.node} sqlite=${result.sqliteAvailable} required=${result.supportedRange}\n`);
  process.exit(1);
}
process.stdout.write(`OPENRILL_RUNTIME_READY node=${process.versions.node} sqlite=${result.sqliteAvailable}\n`);
