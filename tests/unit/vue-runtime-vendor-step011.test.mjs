import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractTarEntries, sha512Integrity, VUE_PACKAGE_INTEGRITY, VUE_PACKAGE_URL, VUE_RUNTIME_VERSION, VUE_DOWNLOAD_TIMEOUT_MS } from "../../scripts/vendor-vue-runtime.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function octal(value, length) {
  return `${value.toString(8).padStart(length - 1, "0")}\0`;
}
function tarEntry(name, bytes) {
  const body = Buffer.from(bytes);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(octal(body.length, 12), 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header.fill(0x20, 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512)]);
}

test("Vue runtime vendor contract pins the exact selected package", () => {
  assert.equal(VUE_RUNTIME_VERSION, "3.5.40");
  assert.equal(VUE_PACKAGE_URL, "https://registry.npmjs.org/vue/-/vue-3.5.40.tgz");
  assert.equal(VUE_PACKAGE_INTEGRITY, "sha512-+8PJ4SJXdn/cHGImF4CKdxlWHIN5Dkt7DoufRREM6h6uVCx2m7QxgcEQmmzyOK8A9mcafg7sFbJFYsdFVubTig==");
});

test("tar extraction returns only exact regular-file entries", () => {
  const tar = Buffer.concat([
    tarEntry("package/package.json", Buffer.from('{"name":"vue","version":"3.5.40"}')),
    tarEntry("package/dist/vue.runtime.global.prod.js", Buffer.from("runtime-3.5.40")),
    tarEntry("package/LICENSE", Buffer.from("MIT License")),
    Buffer.alloc(1024),
  ]);
  const entries = extractTarEntries(tar, ["package/package.json", "package/dist/vue.runtime.global.prod.js", "package/LICENSE"]);
  assert.deepEqual([...entries.keys()], ["package/package.json", "package/dist/vue.runtime.global.prod.js", "package/LICENSE"]);
  assert.equal(entries.get("package/dist/vue.runtime.global.prod.js").toString("utf8"), "runtime-3.5.40");
  assert.throws(() => extractTarEntries(tar, ["package/dist/missing.js"]), /missing required entries/);
});

test("package integrity uses npm-compatible SHA-512 encoding", () => {
  const bytes = Buffer.from("openrill-vue-runtime-fixture", "utf8");
  assert.equal(sha512Integrity(bytes), `sha512-${createHash("sha512").update(bytes).digest("base64")}`);
});


test("exact Vue network acquisition has a bounded abort deadline", async () => {
  assert.equal(VUE_DOWNLOAD_TIMEOUT_MS, 15_000);
  const source = await readFile(resolve(root, "scripts/vendor-vue-runtime.mjs"), "utf8");
  assert.match(source, /signal: AbortSignal\.timeout\(VUE_DOWNLOAD_TIMEOUT_MS\)/);
  assert.doesNotMatch(source, /fetch\(VUE_PACKAGE_URL, \{ redirect: "error", cache: "no-store" \}\)/);
});
