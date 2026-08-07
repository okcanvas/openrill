import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getLoopbackBuffer } from "./live-loopback-http.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function boundedText(value, limit = 400) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").slice(0, limit);
}

function staticEvidence(evidence) {
  return `OPENRILL_VUE_STATIC_EVIDENCE_BEGIN\n${JSON.stringify(evidence, null, 2)}\nOPENRILL_VUE_STATIC_EVIDENCE_END`;
}

export async function verifyServedVueRuntime({ baseUrl, vendorRoot, fetchImpl }) {
  const expectedRuntime = await readFile(resolve(vendorRoot, "vue.runtime.global.prod.js"));
  const expectedLockBytes = await readFile(resolve(vendorRoot, "vue.runtime.lock.json"));
  const lock = JSON.parse(expectedLockBytes.toString("utf8"));
  const expectedSha256 = sha256(expectedRuntime);
  const runtimeUrl = new URL("/vendor/vue.runtime.global.prod.js", baseUrl);
  const runtimeResponse = fetchImpl
    ? await fetchImpl(runtimeUrl, { redirect: "error" })
    : await getLoopbackBuffer(runtimeUrl, { label: "vue-runtime-static", maxBytes: expectedRuntime.length + 1 });
  const runtimeBody = fetchImpl ? Buffer.from(await runtimeResponse.arrayBuffer()) : runtimeResponse.body;
  const runtimeContentType = fetchImpl ? (runtimeResponse.headers.get("content-type") ?? "") : runtimeResponse.contentType;
  const runtimeEvidence = {
    path: runtimeUrl.pathname,
    status: runtimeResponse.status,
    contentType: runtimeContentType,
    bytes: runtimeBody.length,
    sha256: sha256(runtimeBody),
    expectedBytes: expectedRuntime.length,
    expectedSha256,
  };
  if (
    runtimeResponse.status !== 200
    || !/^text\/javascript(?:;|$)/i.test(runtimeEvidence.contentType)
    || runtimeBody.length !== expectedRuntime.length
    || runtimeEvidence.sha256 !== expectedSha256
    || lock.fileSha256 !== expectedSha256
  ) {
    const bodyPreview = boundedText(runtimeBody.toString("utf8"));
    throw new Error(`Vue runtime static serving mismatch\n${staticEvidence({ runtime: runtimeEvidence, bodyPreview })}`);
  }

  const lockUrl = new URL("/vendor/vue.runtime.lock.json", baseUrl);
  const lockResponse = fetchImpl
    ? await fetchImpl(lockUrl, { redirect: "error" })
    : await getLoopbackBuffer(lockUrl, { label: "vue-runtime-lock", maxBytes: expectedLockBytes.length + 1 });
  const servedLockBytes = fetchImpl ? Buffer.from(await lockResponse.arrayBuffer()) : lockResponse.body;
  const lockContentType = fetchImpl ? (lockResponse.headers.get("content-type") ?? "") : lockResponse.contentType;
  const lockEvidence = {
    path: lockUrl.pathname,
    status: lockResponse.status,
    contentType: lockContentType,
    bytes: servedLockBytes.length,
    sha256: sha256(servedLockBytes),
    expectedBytes: expectedLockBytes.length,
    expectedSha256: sha256(expectedLockBytes),
  };
  if (
    lockResponse.status !== 200
    || !/^application\/json(?:;|$)/i.test(lockEvidence.contentType)
    || !servedLockBytes.equals(expectedLockBytes)
  ) {
    const bodyPreview = boundedText(servedLockBytes.toString("utf8"));
    throw new Error(`Vue runtime lock static serving mismatch\n${staticEvidence({ runtime: runtimeEvidence, lock: lockEvidence, bodyPreview })}`);
  }
  return { runtime: runtimeEvidence, lock: lockEvidence };
}
