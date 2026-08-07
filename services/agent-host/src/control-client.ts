import http from "node:http";
import type { HostStatusPayload, HostStopPayload } from "@openrill/protocol";
import type { HostPrivateMetadata } from "./metadata.js";

async function requestJson<T>(metadata: HostPrivateMetadata, method: "GET" | "POST", path: string, timeoutMs: number): Promise<T | null> {
  return await new Promise<T | null>((resolve) => {
    const request = http.request({
      hostname: metadata.bind,
      port: metadata.port,
      method,
      path,
      headers: { authorization: `Bearer ${metadata.controlToken}`, connection: "close" },
    });
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    request.on("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode >= 300) return finish(null);
        try { finish(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T); } catch { finish(null); }
      });
    });
    request.on("error", () => finish(null));
    request.end();
  });
}

export async function probeHostStatus(metadata: HostPrivateMetadata, timeoutMs = 500): Promise<HostStatusPayload | null> {
  const status = await requestJson<HostStatusPayload>(metadata, "GET", "/lifecycle/status", timeoutMs);
  return status?.instanceId === metadata.instanceId ? status : null;
}

export async function requestHostStop(metadata: HostPrivateMetadata, timeoutMs = 1000): Promise<HostStopPayload | null> {
  const response = await requestJson<HostStopPayload>(metadata, "POST", "/lifecycle/stop", timeoutMs);
  return response?.instanceId === metadata.instanceId ? response : null;
}
