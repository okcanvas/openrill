import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStep020er3LiveMarkerContract, renderStep020er3LiveMarker } from "../../scripts/step020er3-live-marker.mjs";

const ROOT=fileURLToPath(new URL("../../",import.meta.url));
const VALIDATOR=fileURLToPath(new URL("../../scripts/step020er3_live_marker.py",import.meta.url));

function runValidator(marker,cwd){
  return new Promise((resolve,reject)=>{
    const child=spawn("python",[VALIDATOR,"--validate-stdin"],{cwd,stdio:["pipe","pipe","pipe"]});
    let output="";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data",chunk=>output+=chunk); child.stderr.on("data",chunk=>output+=chunk);
    child.once("error",reject); child.once("exit",exitCode=>resolve({exitCode,output}));
    child.stdin.end(marker+"\n");
  });
}

async function withExternalCwd(run){
  const cwd=await mkdtemp(path.join(tmpdir(),"openrill step020er3 external cwd "));
  try{return await run(cwd);}finally{await rm(cwd,{recursive:true,force:true});}
}

test("STEP020ER3 validator is invoked through an absolute Python file entrypoint",async()=>{
  assert.ok(path.isAbsolute(ROOT));
  assert.ok(path.isAbsolute(VALIDATOR));
  assert.match(VALIDATOR,/step020er3_live_marker\.py$/);
});

test("STEP020ER3 validator accepts a reordered marker from an external cwd without PYTHONPATH",async()=>{
  const contract=await loadStep020er3LiveMarkerContract();
  const marker=renderStep020er3LiveMarker(contract,{passed:26,total:26,state:"PASSED"});
  const [step,...tokens]=marker.split(" ");
  const reordered=[step,...tokens.reverse()].join(" ");
  const result=await withExternalCwd(cwd=>runValidator(reordered,cwd));
  assert.equal(result.exitCode,0,result.output);
  assert.match(result.output,/PASS/);
});

test("STEP020ER3 validator rejects missing queue and migration fields from an external cwd",async()=>{
  const contract=await loadStep020er3LiveMarkerContract();
  const marker=renderStep020er3LiveMarker(contract,{passed:26,total:26,state:"PASSED"});
  const broken=marker.replace(" queue=SYSTEM_MESSAGE_WAKE_RUN","").replace(" migration=TERMINAL_CHILD_SAFE_BACKFILL","");
  const result=await withExternalCwd(cwd=>runValidator(broken,cwd));
  assert.notEqual(result.exitCode,0,result.output);
  assert.match(result.output,/queue/);
  assert.match(result.output,/migration/);
});

test("STEP020ER3 validator ignores a shadow scripts package in the caller cwd",async()=>{
  const contract=await loadStep020er3LiveMarkerContract();
  const marker=renderStep020er3LiveMarker(contract,{passed:26,total:26,state:"PASSED"});
  const result=await withExternalCwd(async cwd=>{
    const shadow=path.join(cwd,"scripts"); await mkdir(shadow);
    await writeFile(path.join(shadow,"step020er3_live_marker.py"),"raise SystemExit(88)\n","utf8");
    return await runValidator(marker,cwd);
  });
  assert.equal(result.exitCode,0,result.output);
  assert.match(result.output,/PASS/);
});
