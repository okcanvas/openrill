from __future__ import annotations
import argparse, hashlib, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
EXCLUDED_DIRS={".git","node_modules","dist",".artifacts","__pycache__"}
def main():
    p=argparse.ArgumentParser(description="Create deterministic OpenRill STEP018B source ZIP"); p.add_argument("--output",type=Path,required=True); a=p.parse_args()
    out=a.output.resolve(); out.parent.mkdir(parents=True,exist_ok=True)
    files=[]
    for path in ROOT.rglob("*"):
        if not path.is_file(): continue
        rel=path.relative_to(ROOT)
        if any(part in EXCLUDED_DIRS for part in rel.parts) or path.suffix in {".pyc",".pyo"}: continue
        files.append(path)
    files.sort(key=lambda x:x.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(out,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for path in files:
            rel=path.relative_to(ROOT).as_posix(); info=zipfile.ZipInfo(rel,(1980,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; info.external_attr=0o100644<<16; z.writestr(info,path.read_bytes())
    digest=hashlib.sha256(out.read_bytes()).hexdigest(); print(f"OPENRILL_STEP018B_PACKAGE_PASS files={len(files)} sha256={digest}")
    return 0
if __name__=="__main__": raise SystemExit(main())
