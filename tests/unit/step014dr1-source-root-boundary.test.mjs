import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function run(root){return spawnSync("python",["scripts/check_source_root_boundary.py","--root",root],{cwd:new URL("../..",import.meta.url),encoding:"utf8"});}

test("source-root boundary accepts source roots without immutable release archives",async()=>{
  const root=await mkdtemp(join(tmpdir(),"openrill-root-boundary-pass-"));
  try{const result=run(root);assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/OPENRILL_SOURCE_ROOT_ARCHIVE_PASS/);}finally{await rm(root,{recursive:true,force:true});}
});

test("source-root boundary rejects OpenRill release ZIPs with actionable relocation guidance",async()=>{
  const root=await mkdtemp(join(tmpdir(),"openrill-root-boundary-fail-"));
  try{
    await writeFile(join(root,"openrill-step013cr2-sqlite-null-prototype-live-assertion-alignment-v1.zip"),"fixture");
    const result=run(root);assert.equal(result.status,1);assert.match(result.stdout,/OPENRILL_SOURCE_ROOT_ARCHIVE_FAIL/);assert.match(result.stdout,/action=move_archives_outside_source_root/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test("source-root boundary does not reject unrelated source files",async()=>{
  const root=await mkdtemp(join(tmpdir(),"openrill-root-boundary-source-"));
  try{await writeFile(join(root,"notes.zip.txt"),"fixture");const result=run(root);assert.equal(result.status,0,result.stdout+result.stderr);}finally{await rm(root,{recursive:true,force:true});}
});
