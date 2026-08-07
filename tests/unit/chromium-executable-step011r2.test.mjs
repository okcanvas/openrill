import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  CHROMIUM_EXECUTABLE_NOT_FOUND,
  captureChildSpawnFailure,
  chromiumExecutableCandidates,
  describeChromiumSpawnFailure,
  resolveChromiumExecutable,
} from "../../scripts/chromium-executable.mjs";

function fakeAccess(existing) {
  const normalized = new Set(existing.map((value) => value.toLowerCase()));
  return async (candidate) => {
    if (!normalized.has(String(candidate).toLowerCase())) {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    }
  };
}

test("explicit Chromium executable override has first priority", async () => {
  const executable = "C:\\portable\\chrome.exe";
  const result = await resolveChromiumExecutable({
    platform: "win32",
    env: { OPENRILL_CHROMIUM_EXECUTABLE: executable, PATH: "C:\\bin" },
    accessFile: fakeAccess([executable]),
  });
  assert.deepEqual(result, { executable, source: "ENV_OVERRIDE", platform: "win32" });
});

test("Windows discovery includes PATH, system Chrome, Edge and user Chromium locations", () => {
  const candidates = chromiumExecutableCandidates({
    platform: "win32",
    env: {
      PATH: "C:\\Tools;D:\\Browsers",
      PROGRAMFILES: "C:\\Program Files",
      "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
      LOCALAPPDATA: "C:\\Users\\fixture\\AppData\\Local",
    },
  });
  const values = candidates.map((candidate) => candidate.executable.toLowerCase());
  assert.equal(values[0], "c:\\tools\\chrome.exe");
  assert.ok(values.includes("c:\\program files\\google\\chrome\\application\\chrome.exe"));
  assert.ok(values.includes("c:\\program files (x86)\\microsoft\\edge\\application\\msedge.exe"));
  assert.ok(values.includes("c:\\users\\fixture\\appdata\\local\\chromium\\application\\chrome.exe"));
});

test("Windows resolution accepts installed Edge when Chrome is absent", async () => {
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const result = await resolveChromiumExecutable({
    platform: "win32",
    env: { PATH: "", "PROGRAMFILES(X86)": "C:\\Program Files (x86)" },
    accessFile: fakeAccess([edge]),
  });
  assert.equal(result.executable, edge);
  assert.equal(result.source, "WINDOWS_STANDARD");
});

test("POSIX discovery retains the canonical Chromium location", async () => {
  const result = await resolveChromiumExecutable({
    platform: "linux",
    env: { PATH: "" },
    accessFile: fakeAccess(["/usr/bin/chromium"]),
  });
  assert.equal(result.executable, "/usr/bin/chromium");
  assert.equal(result.source, "POSIX_STANDARD");
});

test("missing browser fails with a stable actionable code", async () => {
  await assert.rejects(
    resolveChromiumExecutable({ platform: "win32", env: {}, accessFile: fakeAccess([]) }),
    (error) => error.code === CHROMIUM_EXECUTABLE_NOT_FOUND
      && /OPENRILL_CHROMIUM_EXECUTABLE/.test(error.message)
      && error.candidateBasenames.includes("chrome.exe")
      && error.candidateBasenames.includes("msedge.exe"),
  );
});

test("spawn failure diagnostics preserve the OS code and attempted executable", () => {
  const error = new Error("spawn C:\\missing\\chrome.exe ENOENT");
  error.code = "ENOENT";
  const detail = describeChromiumSpawnFailure(error, "C:\\missing\\chrome.exe");
  assert.match(detail, /code=ENOENT/);
  assert.match(detail, /C:\\\\missing\\\\chrome\.exe/);
  assert.match(detail, /spawn/);
});


test("real child spawn errors are captured before they can become empty Chromium output", async () => {
  const missing = process.platform === "win32" ? "Z:\\openrill-missing\\chrome.exe" : "/openrill-missing/chromium";
  const child = spawn(missing, [], { stdio: "ignore" });
  const diagnostics = [];
  const state = captureChildSpawnFailure(child, { executable: missing, onDiagnostic: (detail) => diagnostics.push(detail) });
  await new Promise((resolveClose) => child.once("close", resolveClose));
  assert.ok(state.failure);
  assert.equal(state.failure.code, "ENOENT");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0], /code=ENOENT/);
  assert.match(diagnostics[0], /openrill-missing/);
});
