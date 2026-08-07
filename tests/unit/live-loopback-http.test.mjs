import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  LiveLoopbackHttpError,
  getLoopbackBuffer,
  getLoopbackJson,
  getLoopbackText,
  requestLoopback,
} from "../../scripts/live-loopback-http.mjs";

async function waitUntil(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  } while (Date.now() < deadline);
  assert.fail("condition did not become true before timeout");
}

async function withServer(handler, body) {
  const sockets = new Set();
  const server = createServer(handler);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    return await body(`http://127.0.0.1:${address.port}`, { sockets });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("bounded loopback client consumes chunked JSON and emits start/end evidence", async () => {
  const logs = [];
  await withServer((request, response) => {
    assert.equal(request.headers.connection, "close");
    assert.equal(request.headers["accept-encoding"], "identity");
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "transfer-encoding": "chunked" });
    response.write('{"ok":');
    setTimeout(() => response.end("true}"), 5);
  }, async (base) => {
    const result = await getLoopbackJson(`${base}/chunked?secret=hidden`, {
      label: "chunked-json",
      expectedStatus: 200,
      contentTypePattern: /^application\/json(?:;|$)/i,
      log: (line) => logs.push(line),
    });
    assert.deepEqual(result.json, { ok: true });
    assert.equal(result.body.toString("utf8"), '{"ok":true}');
  });
  assert.equal(logs.length, 2);
  assert.match(logs[0], /^OPENRILL_LIVE_HTTP_START /);
  assert.match(logs[1], /state=PASS/);
  assert.doesNotMatch(logs.join("\n"), /secret=hidden/);
});

test("bounded loopback client supports text and binary responses", async () => {
  await withServer((request, response) => {
    if (request.url === "/text") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("hello");
      return;
    }
    response.writeHead(200, { "content-type": "application/octet-stream", "content-length": "4" });
    response.end(Buffer.from([0, 1, 2, 3]));
  }, async (base) => {
    const text = await getLoopbackText(`${base}/text`, { expectedStatus: 200, log: () => {} });
    assert.equal(text.text, "hello");
    const binary = await getLoopbackBuffer(`${base}/binary`, { expectedStatus: 200, log: () => {} });
    assert.deepEqual([...binary.body], [0, 1, 2, 3]);
  });
});

test("bounded loopback client fails closed on oversized and timed out responses", async () => {
  await withServer((request, response) => {
    if (request.url === "/large") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("0123456789");
      return;
    }
    setTimeout(() => {
      if (!response.destroyed) response.end("late");
    }, 100);
  }, async (base, { sockets }) => {
    await assert.rejects(
      getLoopbackBuffer(`${base}/large`, { maxBytes: 4, log: () => {} }),
      (error) => error instanceof LiveLoopbackHttpError && error.code === "LIVE_HTTP_BODY_TOO_LARGE",
    );
    await waitUntil(() => sockets.size === 0);
    await assert.rejects(
      getLoopbackBuffer(`${base}/slow`, { timeoutMs: 20, log: () => {} }),
      (error) => error instanceof LiveLoopbackHttpError && error.code === "LIVE_HTTP_TIMEOUT",
    );
    await waitUntil(() => sockets.size === 0);
  });
});

test("bounded loopback client rejects non-loopback, credentials, bad status, and invalid JSON", async () => {
  await assert.rejects(
    requestLoopback({ url: "http://example.com/", log: () => {} }),
    (error) => error instanceof LiveLoopbackHttpError && error.code === "LIVE_HTTP_HOST_NOT_LOOPBACK",
  );
  await assert.rejects(
    requestLoopback({ url: "http://user:pass@127.0.0.1/", log: () => {} }),
    (error) => error instanceof LiveLoopbackHttpError && error.code === "LIVE_HTTP_CREDENTIALS_NOT_ALLOWED",
  );
  await withServer((_request, response) => {
    response.writeHead(404, { "content-type": "application/json" });
    response.end("not-json");
  }, async (base) => {
    await assert.rejects(
      getLoopbackBuffer(`${base}/`, { expectedStatus: 200, log: () => {} }),
      (error) => error instanceof LiveLoopbackHttpError && error.code === "LIVE_HTTP_UNEXPECTED_STATUS",
    );
    await assert.rejects(
      getLoopbackJson(`${base}/`, { log: () => {} }),
      (error) => error instanceof LiveLoopbackHttpError && error.code === "LIVE_HTTP_INVALID_JSON",
    );
  });
});
