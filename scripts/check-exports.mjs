import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const packageRoots = [];
for (const group of ["apps", "services", "packages", "connectors", "skills"]) {
  const base = path.join(root, group);
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (entry.isDirectory()) packageRoots.push(path.join(base, entry.name));
  }
}
let checked = 0;
for (const packageRoot of packageRoots.sort()) {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  const target = path.join(packageRoot, manifest.exports["."].import);
  const loaded = await import(pathToFileURL(target).href);
  if (!loaded.PACKAGE_NAME || loaded.PACKAGE_NAME !== manifest.name) {
    throw new Error(`export identity mismatch: ${manifest.name}`);
  }
  checked += 1;
}
process.stdout.write(`OPENRILL_PACKAGE_EXPORT_PASS packages=${checked}\n`);
