import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (relative) => JSON.parse(await readFile(new URL(`../../${relative}`, import.meta.url), "utf8"));

test("base TypeScript config closes ambient types", async () => {
  const config = await readJson("tsconfig.base.json");
  assert.deepEqual(config.compilerOptions.types, []);
});

test("Node TypeScript config explicitly enables Node declarations", async () => {
  const config = await readJson("tsconfig.node.json");
  assert.deepEqual(config.compilerOptions.types, ["node"]);
});

test("web TypeScript config does not inherit Node ambient declarations", async () => {
  const config = await readJson("tsconfig.web.json");
  assert.deepEqual(config.compilerOptions.types, []);
  assert.ok(config.compilerOptions.lib.includes("DOM"));
});

test("root owns the single Node declaration dependency", async () => {
  const manifest = await readJson("package.json");
  assert.equal(manifest.devDependencies["@types/node"], "22.20.1");
});
