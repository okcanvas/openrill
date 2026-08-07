import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeProfileName, resolveProfilePaths } from "../../packages/config/dist/index.js";

test("profile names are canonical and path-safe", () => {
  assert.equal(canonicalizeProfileName(" Work-01 "), "work-01");
  assert.throws(() => canonicalizeProfileName("../escape"));
  assert.throws(() => canonicalizeProfileName("CON"));
});

test("explicit platform selects path semantics independently of the host OS", () => {
  const win = resolveProfilePaths({
    profile: "alpha",
    platform: "win32",
    homeDir: "C:/Users/test",
    env: { LOCALAPPDATA: "C:/Local", APPDATA: "C:/Roaming" },
  });
  assert.deepEqual(win, {
    profile: "alpha",
    dataRoot: "C:\\Local\\OpenRill\\alpha",
    configRoot: "C:\\Roaming\\OpenRill\\alpha",
    runtimeDir: "C:\\Local\\OpenRill\\alpha\\runtime",
    lockPath: "C:\\Local\\OpenRill\\alpha\\runtime\\host.lock",
    metadataPath: "C:\\Local\\OpenRill\\alpha\\runtime\\host.json",
  });

  const unix = resolveProfilePaths({
    profile: "alpha",
    platform: "linux",
    homeDir: "/home/test",
    env: {},
  });
  assert.deepEqual(unix, {
    profile: "alpha",
    dataRoot: "/home/test/.local/share/openrill/alpha",
    configRoot: "/home/test/.config/openrill/alpha",
    runtimeDir: "/home/test/.local/share/openrill/alpha/runtime",
    lockPath: "/home/test/.local/share/openrill/alpha/runtime/host.lock",
    metadataPath: "/home/test/.local/share/openrill/alpha/runtime/host.json",
  });
});

test("platform-specific environment overrides preserve their own path grammar", () => {
  const win = resolveProfilePaths({
    profile: "beta",
    platform: "win32",
    homeDir: "C:/Users/test",
    env: {
      OPENRILL_DATA_ROOT: "D:/OpenRillData",
      OPENRILL_CONFIG_ROOT: "E:/OpenRillConfig",
    },
  });
  assert.equal(win.runtimeDir, "D:\\OpenRillData\\beta\\runtime");
  assert.equal(win.configRoot, "E:\\OpenRillConfig\\beta");

  const unix = resolveProfilePaths({
    profile: "beta",
    platform: "darwin",
    homeDir: "/Users/test",
    env: {
      OPENRILL_DATA_ROOT: "/srv/openrill-data",
      OPENRILL_CONFIG_ROOT: "/srv/openrill-config",
    },
  });
  assert.equal(unix.runtimeDir, "/srv/openrill-data/beta/runtime");
  assert.equal(unix.configRoot, "/srv/openrill-config/beta");
});
