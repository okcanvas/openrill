import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { CONTROL_UI_MODULE_ENTRYPOINT, controlUiAssetRelativePath, controlUiModuleEntrypointFromHtml } from "./control-ui-static-contract.mjs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const task = process.argv[2];
if (!new Set(["clean", "build", "typecheck"]).has(task)) {
  throw new Error(`unsupported workspace task: ${task}`);
}

if (task === "clean") {
  for (const group of ["apps", "services", "packages", "connectors", "skills"]) {
    const base = path.join(repoRoot, group);
    for (const entry of await readdir(base, { withFileTypes: true })) {
      if (entry.isDirectory()) await rm(path.join(base, entry.name, "dist"), { recursive: true, force: true });
    }
  }
  await rm(path.join(repoRoot, ".artifacts"), { recursive: true, force: true });
  process.stdout.write("OPENRILL_WORKSPACE_CLEAN_PASS\n");
  process.exit(0);
}

await mkdir(path.join(repoRoot, ".artifacts", "tsbuild"), { recursive: true });
const tscArgs = task === "typecheck" ? ["-b", "tsconfig.build.json", "--pretty", "false", "--noEmit"] : ["-b", "tsconfig.build.json", "--pretty", "false"];
const result = spawnSync("tsc", tscArgs, { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

if (task === "build") {
  const webRoot = path.join(repoRoot, "apps", "agent-web");
  const webPublicSource = path.join(webRoot, "public");
  const webPublicDestination = path.join(webRoot, "dist", "public");
  await rm(webPublicDestination, { recursive: true, force: true });
  await mkdir(webPublicDestination, { recursive: true });
  await cp(webPublicSource, webPublicDestination, { recursive: true });

  const externalVendorRoot = process.env.OPENRILL_VUE_RUNTIME_VENDOR_DIR;
  if (externalVendorRoot) {
    const vendorSource = path.resolve(externalVendorRoot);
    const vendorDestination = path.join(webPublicDestination, "vendor");
    await mkdir(vendorDestination, { recursive: true });
    for (const fileName of ["vue.runtime.global.prod.js", "LICENSE.vue.txt", "vue.runtime.lock.json"]) {
      await cp(path.join(vendorSource, fileName), path.join(vendorDestination, fileName));
    }
  }

  const indexHtml = await readFile(path.join(webPublicSource, "index.html"), "utf8");
  controlUiModuleEntrypointFromHtml(indexHtml);
  const browserEntryDestination = path.join(webPublicDestination, controlUiAssetRelativePath(CONTROL_UI_MODULE_ENTRYPOINT));
  await mkdir(path.dirname(browserEntryDestination), { recursive: true });
  await cp(path.join(webRoot, "dist", "browser-app.js"), browserEntryDestination);

  const webAssetDestination = path.join(webPublicDestination, "assets", "web");
  await mkdir(path.join(webAssetDestination, "api"), { recursive: true });
  for (const relativePath of ["control-ui-projection.js", "api/local-protocol-client.js"]) {
    await cp(path.join(webRoot, "dist", relativePath), path.join(webAssetDestination, relativePath));
  }

  const protocolDist = path.join(repoRoot, "packages", "protocol", "dist");
  const protocolAssetDestination = path.join(webPublicDestination, "assets", "protocol");
  await mkdir(protocolAssetDestination, { recursive: true });
  for (const entry of await readdir(protocolDist, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".js")) {
      await cp(path.join(protocolDist, entry.name), path.join(protocolAssetDestination, entry.name));
    }
  }

  const stateMigrationsSource = path.join(repoRoot, "packages", "state", "migrations");
  const stateMigrationsDestination = path.join(repoRoot, "packages", "state", "dist", "migrations");
  await mkdir(stateMigrationsDestination, { recursive: true });
  await cp(stateMigrationsSource, stateMigrationsDestination, { recursive: true });
}
process.stdout.write(`OPENRILL_WORKSPACE_${task.toUpperCase()}_PASS\n`);
