import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  VUE_PACKAGE_INTEGRITY,
  VUE_PACKAGE_URL,
  VUE_RUNTIME_VERSION,
} from "./vendor-vue-runtime.mjs";

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid argument pair: ${key ?? "<missing>"}`);
    values.set(key, value);
  }
  for (const required of ["--vendor-root", "--verify-root", "--archive", "--verify-archive"]) {
    if (!values.has(required)) throw new Error(`missing ${required}`);
  }
  return {
    vendorRoot: resolve(values.get("--vendor-root")),
    verifyRoot: resolve(values.get("--verify-root")),
    archive: resolve(values.get("--archive")),
    verifyArchive: resolve(values.get("--verify-archive")),
  };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function readVendor(root) {
  const runtime = await readFile(resolve(root, "vue.runtime.global.prod.js"));
  const license = await readFile(resolve(root, "LICENSE.vue.txt"));
  const lockBytes = await readFile(resolve(root, "vue.runtime.lock.json"));
  return { runtime, license, lockBytes, lock: JSON.parse(lockBytes.toString("utf8")) };
}

const options = parseArgs(process.argv.slice(2));
const primary = await readVendor(options.vendorRoot);
const verify = await readVendor(options.verifyRoot);
const archive = await readFile(options.archive);
const verifyArchive = await readFile(options.verifyArchive);

assert.equal(primary.lock.schemaVersion, 1);
assert.equal(primary.lock.package, "vue");
assert.equal(primary.lock.version, VUE_RUNTIME_VERSION);
assert.equal(primary.lock.source, VUE_PACKAGE_URL);
assert.equal(primary.lock.archiveFile, "reference/vendor/vue-3.5.40.tgz");
assert.equal(primary.lock.packageIntegrity, VUE_PACKAGE_INTEGRITY);
assert.equal(primary.lock.runtimeFile, "vue.runtime.global.prod.js");
assert.equal(primary.lock.licenseFile, "LICENSE.vue.txt");
assert.equal(primary.lock.fileBytes, primary.runtime.length);
assert.equal(primary.lock.fileSha256, sha256(primary.runtime));
assert.equal(primary.lock.packageBytes, archive.length);
assert.equal(primary.lock.packageSha256, sha256(archive));
assert.ok(primary.runtime.length > 80_000);
assert.match(primary.license.toString("utf8"), /MIT License/i);
assert.deepEqual(verify.runtime, primary.runtime);
assert.deepEqual(verify.license, primary.license);
assert.deepEqual(verify.lockBytes, primary.lockBytes);
assert.deepEqual(verifyArchive, archive);

process.stdout.write(
  `OPENRILL_STEP014DR8_VUE_RUNTIME_VERIFY_PASS version=${primary.lock.version} runtime_bytes=${primary.runtime.length} runtime_sha256=${primary.lock.fileSha256} archive_bytes=${archive.length} archive_sha256=${primary.lock.packageSha256}\n`,
);
