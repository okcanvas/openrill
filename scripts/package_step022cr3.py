from __future__ import annotations
import argparse, hashlib, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STEP='STEP022CR3_WINDOWS_CMD_ENTRYPOINT_BYTE_CONTRACT_CLOSURE'
PRODUCT_VERSION='0.24.0-step022c'
EXCLUDED_DIRS={'.git','node_modules','dist','.artifacts','__pycache__'}
CMD_FILES=('start-and-run-step022c-live.cmd','start-mattermost-testbed.cmd','stop-mattermost-testbed.cmd','reset-mattermost-testbed.cmd')

def valid_cmd(data:bytes,name:str)->None:
 if len(data)<64: raise RuntimeError(f'ZIP_CMD_BYTE_CONTRACT:{name}:EMPTY_OR_TOO_SMALL:{len(data)}')
 if any(b>=128 for b in data): raise RuntimeError(f'ZIP_CMD_BYTE_CONTRACT:{name}:NON_ASCII')
 if b'\r\n' not in data: raise RuntimeError(f'ZIP_CMD_BYTE_CONTRACT:{name}:NO_CRLF')
 for i,b in enumerate(data):
  if b==10 and (i==0 or data[i-1]!=13): raise RuntimeError(f'ZIP_CMD_BYTE_CONTRACT:{name}:BARE_LF:{i}')
  if b==13 and (i+1>=len(data) or data[i+1]!=10): raise RuntimeError(f'ZIP_CMD_BYTE_CONTRACT:{name}:BARE_CR:{i}')
 if b'cd /d "%~dp0"' not in data: raise RuntimeError(f'ZIP_CMD_BYTE_CONTRACT:{name}:ROOT_MISSING')
 if b'OpenRillRoot' in data: raise RuntimeError(f'ZIP_CMD_BYTE_CONTRACT:{name}:EXTERNAL_ROOT_FORBIDDEN')
 if name=='start-and-run-step022c-live.cmd':
  for token in (b'call pnpm install --frozen-lockfile',b'call pnpm mattermost:testbed:live'):
   if token not in data: raise RuntimeError(f'ZIP_CMD_BYTE_CONTRACT:{name}:COMMAND_MISSING:{token!r}')
  if b'powershell' in data.lower(): raise RuntimeError(f'ZIP_CMD_BYTE_CONTRACT:{name}:POWERSHELL_DEPENDENCY')

def main()->int:
 parser=argparse.ArgumentParser(description=f'Create deterministic OpenRill {STEP} full source ZIP'); parser.add_argument('--output',type=Path,required=True); args=parser.parse_args(); output=args.output.resolve(); output.parent.mkdir(parents=True,exist_ok=True)
 for name in CMD_FILES: valid_cmd((ROOT/name).read_bytes(),name)
 files=[]
 for path in ROOT.rglob('*'):
  if not path.is_file(): continue
  rel=path.relative_to(ROOT)
  if any(part in EXCLUDED_DIRS for part in rel.parts) or path.suffix in {'.pyc','.pyo'}: continue
  files.append(path)
 files.sort(key=lambda p:p.relative_to(ROOT).as_posix())
 with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
  for path in files:
   info=zipfile.ZipInfo(path.relative_to(ROOT).as_posix(),(1980,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; info.external_attr=0o100644<<16; archive.writestr(info,path.read_bytes())
 with zipfile.ZipFile(output) as archive:
  for name in CMD_FILES:
   info=archive.getinfo(name); data=archive.read(name)
   if info.file_size != len(data): raise RuntimeError(f'ZIP_CMD_BYTE_CONTRACT:{name}:SIZE_MISMATCH')
   valid_cmd(data,name)
 digest=hashlib.sha256(output.read_bytes()).hexdigest(); print(f'OPENRILL_STEP022CR3_PACKAGE_PASS step={STEP} product_version={PRODUCT_VERSION} files={len(files)} sha256={digest} cmd_byte_contract=PASSED'); return 0
if __name__=='__main__': raise SystemExit(main())
