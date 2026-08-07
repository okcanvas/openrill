import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const python = process.env.PYTHON || "python";

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function runPython(args, options = {}) {
  return spawnSync(python, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", ...options.env },
  });
}

test("manifest verifier reports the exact changed repository-relative path", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "openrill-manifest-r1-"));
  try {
    const currentIdentity = JSON.parse(await readFile(join(root, "PACKAGE_MANIFEST.json"), "utf8"));
    const original = Buffer.from("immutable\n", "utf8");
    await writeFile(join(fixture, "a.txt"), original);
    await writeFile(join(fixture, "PACKAGE_MANIFEST.json"), JSON.stringify({
      schemaVersion: 1,
      project: "OpenRill",
      step: currentIdentity.step,
      version: currentIdentity.version,
      filesExcludingManifest: 1,
      files: [{ path: "a.txt", size: original.length, sha256: sha256(original) }],
    }, null, 2) + "\n");

    const pass = runPython(["scripts/verify_package_manifest.py", "--root", fixture]);
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    assert.match(pass.stdout, /OPENRILL_PACKAGE_MANIFEST_PASS/);

    await writeFile(join(fixture, "a.txt"), "mutated\n", "utf8");
    const fail = runPython(["scripts/verify_package_manifest.py", "--root", fixture]);
    assert.equal(fail.status, 1, fail.stdout + fail.stderr);
    assert.match(fail.stdout, /declared=1 actual=1 missing=0 extra=0 changed=1/);
    assert.match(fail.stdout, /changed_paths=a\.txt/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("acceptance report helper resolves default and relative override paths", () => {
  const code = [
    "from pathlib import Path",
    "from acceptance_reports import resolve_acceptance_report",
    "root=Path.cwd()",
    "print(resolve_acceptance_report(root, 'reference/default.txt').relative_to(root).as_posix())",
  ].join(";");
  const defaultResult = runPython(["-c", code], {
    env: { PYTHONPATH: join(root, "scripts"), OPENRILL_ACCEPTANCE_REPORT_PATH: "" },
  });
  assert.equal(defaultResult.status, 0, defaultResult.stdout + defaultResult.stderr);
  assert.equal(defaultResult.stdout.trim(), "reference/default.txt");

  const overrideResult = runPython(["-c", code], {
    env: { PYTHONPATH: join(root, "scripts"), OPENRILL_ACCEPTANCE_REPORT_PATH: ".artifacts/nested/report.txt" },
  });
  assert.equal(overrideResult.status, 0, overrideResult.stdout + overrideResult.stderr);
  assert.equal(overrideResult.stdout.trim(), ".artifacts/nested/report.txt");
});

test("nested STEP011 report supports an override instead of forcing the packaged report", async () => {
  const source = await readFile(join(root, "scripts/run_step011_acceptance.py"), "utf8");
  assert.match(source, /resolve_acceptance_report\(ROOT, "reference\/validation\/STEP011_ACCEPTANCE_REPORT\.txt"\)/);
  assert.match(source, /write_acceptance_report\(REPORT,/);
  assert.doesNotMatch(source, /REPORT = ROOT \/ "reference\/validation\/STEP011_ACCEPTANCE_REPORT\.txt"/);
});

test("current acceptance isolates nested and current reports outside the package manifest", async () => {
  const source = await readFile(join(root, "scripts/run_step012ar1_acceptance.py"), "utf8");
  assert.match(source, /\.artifacts\/acceptance\/STEP012AR1_ACCEPTANCE_REPORT\.txt/);
  assert.match(source, /\.artifacts\/nested\/STEP011_ACCEPTANCE_REPORT\.txt/);
  assert.match(source, /package-manifest-initial/);
  assert.match(source, /package-manifest-final/);
  assert.match(source, /nested-step011-packaged-report-immutable/);
});
