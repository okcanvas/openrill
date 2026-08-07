import { access, cp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const [task, packageDirRaw = "."] = process.argv.slice(2);
const packageDir = path.resolve(process.cwd(), packageDirRaw);
const config = path.join(packageDir, "tsconfig.json");

if (task === "clean") {
  await rm(path.join(packageDir, "dist"), { recursive: true, force: true });
  process.exit(0);
}
const args = task === "typecheck" ? ["-p", config, "--noEmit"] : ["-p", config];
const result = spawnSync("tsc", args, { stdio: "inherit", shell: process.platform === "win32" });
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

if (task === "build") {
  const migrations = path.join(packageDir, "migrations");
  try {
    await access(migrations, constants.R_OK);
    await cp(migrations, path.join(packageDir, "dist", "migrations"), {
      recursive: true,
      force: true,
    });
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}
