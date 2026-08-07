from __future__ import annotations
import argparse, hashlib, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STEP="STEP020BR1_TASK_FLOW_OWNER_SCOPE_AND_CANCEL_ADMISSION_CLOSURE"; VERSION="0.20.2-step020br1"
EXCLUDED_DIRS={".git","node_modules","dist",".artifacts","__pycache__"}
def main():
    p=argparse.ArgumentParser(description=f"Create deterministic OpenRill {STEP} source ZIP {VERSION}"); p.add_argument("--output",type=Path,required=True); a=p.parse_args()
    out=a.output.resolve(); out.parent.mkdir(parents=True,exist_ok=True); files=[]
    for path in ROOT.rglob("*"):
        if not path.is_file(): continue
        rel=path.relative_to(ROOT)
        if any(part in EXCLUDED_DIRS for part in rel.parts) or path.suffix in {".pyc",".pyo"}: continue
        files.append(path)
    files.sort(key=lambda item:item.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(out,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for path in files:
            rel=path.relative_to(ROOT).as_posix(); info=zipfile.ZipInfo(rel,(1980,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; info.external_attr=0o100644<<16; archive.writestr(info,path.read_bytes())
    digest=hashlib.sha256(out.read_bytes()).hexdigest(); print(f"OPENRILL_STEP020BR1_PACKAGE_PASS step={STEP} version={VERSION} files={len(files)} sha256={digest}")
    return 0
if __name__=="__main__": raise SystemExit(main())
