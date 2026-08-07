from __future__ import annotations
import argparse, hashlib, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STEP='STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING'
VERSION='0.23.0-step022b'
EXCLUDED_DIRS={'.git','node_modules','dist','.artifacts','__pycache__'}
def main()->int:
 parser=argparse.ArgumentParser(description=f'Create deterministic OpenRill {STEP} source ZIP {VERSION}');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();output=args.output.resolve();output.parent.mkdir(parents=True,exist_ok=True)
 files=[]
 for path in ROOT.rglob('*'):
  if not path.is_file():continue
  rel=path.relative_to(ROOT)
  if any(part in EXCLUDED_DIRS for part in rel.parts) or path.suffix in {'.pyc','.pyo'}:continue
  files.append(path)
 files.sort(key=lambda path:path.relative_to(ROOT).as_posix())
 with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
  for path in files:
   info=zipfile.ZipInfo(path.relative_to(ROOT).as_posix(),(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;archive.writestr(info,path.read_bytes())
 digest=hashlib.sha256(output.read_bytes()).hexdigest();print(f'OPENRILL_STEP022B_PACKAGE_PASS step={STEP} version={VERSION} files={len(files)} sha256={digest}');return 0
if __name__=='__main__':raise SystemExit(main())
