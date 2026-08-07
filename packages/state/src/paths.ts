import { posix, win32 } from "node:path";
import type { OpenRillProfilePaths } from "@openrill/config";
import type { OpenRillStatePaths } from "./types.js";

type PathSemantics = Pick<typeof posix, "resolve">;

function selectPathSemantics(platform: NodeJS.Platform): PathSemantics {
  return platform === "win32" ? win32 : posix;
}

export function resolveStatePaths(
  profilePaths: OpenRillProfilePaths,
  options: { readonly platform?: NodeJS.Platform } = {},
): OpenRillStatePaths {
  const pathSemantics = selectPathSemantics(options.platform ?? process.platform);
  const stateDir = pathSemantics.resolve(profilePaths.dataRoot, "state");
  return {
    stateDir,
    databasePath: pathSemantics.resolve(stateDir, "agent.db"),
    backupsDir: pathSemantics.resolve(stateDir, "backups"),
  };
}
