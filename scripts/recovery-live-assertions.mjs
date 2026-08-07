import assert from "node:assert/strict";

export function assertInterruptedModelInvocation(row) {
  assert.ok(row !== null && typeof row === "object", "interrupted model invocation row missing");
  assert.equal(row.status, "FAILED", "interrupted model invocation status mismatch");
  assert.equal(row.errorCode, "MODEL_INTERRUPTED_BY_RESTART", "interrupted model invocation error code mismatch");
}
