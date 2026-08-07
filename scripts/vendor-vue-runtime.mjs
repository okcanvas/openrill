import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const VUE_RUNTIME_VERSION = "3.5.40";
export const VUE_PACKAGE_URL = `https://registry.npmjs.org/vue/-/vue-${VUE_RUNTIME_VERSION}.tgz`;
export const VUE_PACKAGE_INTEGRITY = "sha512-+8PJ4SJXdn/cHGImF4CKdxlWHIN5Dkt7DoufRREM6h6uVCx2m7QxgcEQmmzyOK8A9mcafg7sFbJFYsdFVubTig==";
const RUNTIME_ENTRY = "package/dist/vue.runtime.global.prod.js";
const PACKAGE_ENTRY = "package/package.json";
const LICENSE_ENTRY = "package/LICENSE";
const MIN_RUNTIME_BYTES = 80_000;
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 32 * 1024 * 1024;
export const VUE_DOWNLOAD_TIMEOUT_MS = 15_000;

function octal(text) {
  const normalized = text.replace(/\0.*$/s, "").trim();
  return normalized ? Number.parseInt(normalized, 8) : 0;
}

function tarString(block, start, length) {
  return block.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
}

export function extractTarEntries(tarBytes, wanted) {
  if (!Buffer.isBuffer(tarBytes)) throw new TypeError("tarBytes must be a Buffer");
  if (tarBytes.length > MAX_UNPACKED_BYTES) throw new Error("Vue package expands beyond the configured bound");
  const remaining = new Set(wanted);
  const result = new Map();
  let offset = 0;
  while (offset + 512 <= tarBytes.length && remaining.size > 0) {
    const header = tarBytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const size = octal(tarString(header, 124, 12));
    const type = tarString(header, 156, 1) || "0";
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tarBytes.length) {
      throw new Error(`invalid tar entry size for ${path}`);
    }
    const bodyStart = offset + 512;
    if ((type === "0" || type === "") && remaining.has(path)) {
      result.set(path, Buffer.from(tarBytes.subarray(bodyStart, bodyStart + size)));
      remaining.delete(path);
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  if (remaining.size > 0) throw new Error(`Vue package is missing required entries: ${[...remaining].join(", ")}`);
  return result;
}

export function sha512Integrity(bytes) {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadArchive(options) {
  if (options.archive) return await readFile(resolve(options.archive));
  if (!options.download) throw new Error("pass --archive <vue-3.5.40.tgz> or --download");
  const response = await fetch(VUE_PACKAGE_URL, {
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(VUE_DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Vue package download failed (${response.status})`);
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_BYTES) throw new Error("Vue package exceeds the configured archive bound");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error("Vue package exceeds the configured archive bound");
  return bytes;
}

function parseArgs(argv) {
  const options = { download: false, archive: undefined, outputRoot: "apps/agent-web/public/vendor", archiveOutput: "reference/vendor/vue-3.5.40.tgz" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--download") options.download = true;
    else if (value === "--archive") options.archive = argv[++index];
    else if (value === "--output-root") options.outputRoot = argv[++index];
    else if (value === "--archive-output") options.archiveOutput = argv[++index];
    else throw new Error(`unknown argument: ${value}`);
  }
  if (options.download === Boolean(options.archive)) throw new Error("choose exactly one of --archive or --download");
  return options;
}

export async function vendorVueRuntime(options) {
  const archive = await loadArchive(options);
  const integrity = sha512Integrity(archive);
  if (integrity !== VUE_PACKAGE_INTEGRITY) throw new Error(`Vue package integrity mismatch: ${integrity}`);
  const tarBytes = gunzipSync(archive, { maxOutputLength: MAX_UNPACKED_BYTES });
  const entries = extractTarEntries(tarBytes, [PACKAGE_ENTRY, RUNTIME_ENTRY, LICENSE_ENTRY]);
  const packageJson = JSON.parse(entries.get(PACKAGE_ENTRY).toString("utf8"));
  if (packageJson.name !== "vue" || packageJson.version !== VUE_RUNTIME_VERSION) {
    throw new Error(`Vue package identity mismatch: ${packageJson.name}@${packageJson.version}`);
  }
  const runtime = entries.get(RUNTIME_ENTRY);
  const license = entries.get(LICENSE_ENTRY);
  if (runtime.length < MIN_RUNTIME_BYTES || !runtime.includes(Buffer.from(VUE_RUNTIME_VERSION, "utf8"))) {
    throw new Error(`Vue global production runtime contract failed (${runtime.length} bytes)`);
  }
  if (!/MIT License/i.test(license.toString("utf8"))) throw new Error("Vue package license is not the expected MIT license text");

  const archiveOutput = resolve(options.archiveOutput);
  await mkdir(dirname(archiveOutput), { recursive: true });
  await writeFile(archiveOutput, archive);

  const outputRoot = resolve(options.outputRoot);
  const runtimePath = resolve(outputRoot, "vue.runtime.global.prod.js");
  const licensePath = resolve(outputRoot, "LICENSE.vue.txt");
  const lockPath = resolve(outputRoot, "vue.runtime.lock.json");
  const tempRoot = `${outputRoot}.tmp`;
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(tempRoot, { recursive: true });
  const lock = {
    schemaVersion: 1,
    package: "vue",
    version: VUE_RUNTIME_VERSION,
    source: VUE_PACKAGE_URL,
    archiveFile: "reference/vendor/vue-3.5.40.tgz",
    packageIntegrity: VUE_PACKAGE_INTEGRITY,
    packageBytes: archive.length,
    packageSha256: sha256(archive),
    runtimeFile: "vue.runtime.global.prod.js",
    fileBytes: runtime.length,
    fileSha256: sha256(runtime),
    licenseFile: "LICENSE.vue.txt",
  };
  await writeFile(resolve(tempRoot, "vue.runtime.global.prod.js"), runtime);
  await writeFile(resolve(tempRoot, "LICENSE.vue.txt"), license);
  await writeFile(resolve(tempRoot, "vue.runtime.lock.json"), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  await mkdir(dirname(outputRoot), { recursive: true });
  await rm(outputRoot, { recursive: true, force: true });
  await rename(tempRoot, outputRoot);
  return { runtimePath, licensePath, lockPath, lock };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await vendorVueRuntime(options);
  process.stdout.write(
    `OPENRILL_VUE_RUNTIME_VENDOR_PASS version=${result.lock.version} bytes=${result.lock.fileBytes} sha256=${result.lock.fileSha256}\n`,
  );
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
