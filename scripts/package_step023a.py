from __future__ import annotations
import argparse, hashlib, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; STEP='STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE'; VERSION='0.25.0-step023a'
EXCLUDED_DIRS={'.git','node_modules','dist','.artifacts','__pycache__'}
def collect():
    files=[]
    for path in ROOT.rglob('*'):
        if not path.is_file(): continue
        rel=path.relative_to(ROOT)
        if any(part in EXCLUDED_DIRS for part in rel.parts) or path.suffix in {'.pyc','.pyo'}: continue
        files.append(path)
    return sorted(files,key=lambda p:p.relative_to(ROOT).as_posix())
def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--output',type=Path,required=True); args=parser.parse_args(); output=args.output.resolve(); output.parent.mkdir(parents=True,exist_ok=True); files=collect()
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for path in files:
            info=zipfile.ZipInfo(path.relative_to(ROOT).as_posix(),(1980,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; info.external_attr=0o100644<<16; z.writestr(info,path.read_bytes())
    with zipfile.ZipFile(output) as z:
        bad=z.testzip(); names=z.namelist()
        if bad is not None or len(names)!=len(set(names)): raise SystemExit('OPENRILL_STEP023A_PACKAGE_INTEGRITY_FAILED')
    digest=hashlib.sha256(output.read_bytes()).hexdigest(); print(f'OPENRILL_STEP023A_PACKAGE_PASS step={STEP} version={VERSION} files={len(files)} sha256={digest}'); return 0
if __name__=='__main__': raise SystemExit(main())
