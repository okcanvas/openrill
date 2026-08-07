from __future__ import annotations
import argparse, hashlib, json, shutil, subprocess, sys, zipfile
from pathlib import Path

EXCLUDED_DIRS={'.git','node_modules','dist','.artifacts','__pycache__'}
EXCLUDED_SUFFIXES={'.pyc','.pyo'}
REQUIRED_CHECKS=[
 ['python','scripts/verify_source_version_alignment.py'],
 ['python','scripts/verify_workspace_lock_alignment.py'],
 ['python','scripts/check_source_root_boundary.py'],
 ['python','scripts/verify_package_manifest.py'],
 ['python','scripts/check_architecture.py'],
 ['node','--test','--test-reporter=tap','tests/unit/validation-governance-step023a.test.mjs'],
]

def safe_names(names:list[str])->bool:
    for name in names:
        p=Path(name)
        if p.is_absolute() or '..' in p.parts or not name or '\\' in name:
            return False
    return True

def generated_violation(name:str)->bool:
    p=Path(name)
    return any(part in EXCLUDED_DIRS for part in p.parts) or p.suffix in EXCLUDED_SUFFIXES

def run_checked(command:list[str], cwd:Path)->str:
    result=subprocess.run(command,cwd=cwd,text=True,encoding='utf-8',errors='replace',stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    sys.stdout.write(result.stdout)
    if result.returncode != 0:
        raise SystemExit(f'OPENRILL_STEP023A_FRESH_COMMAND_FAILED command={command!r} returncode={result.returncode}')
    return result.stdout

def main()->int:
    parser=argparse.ArgumentParser(description='Verify STEP023A source ZIP from an existing parent workdir')
    parser.add_argument('--zip',dest='zip_path',type=Path,required=True)
    parser.add_argument('--extract-dir',type=Path,required=True)
    parser.add_argument('--repack',type=Path,required=True)
    args=parser.parse_args()
    source_zip=args.zip_path.resolve(); extract=args.extract_dir.resolve(); repack=args.repack.resolve()
    if not source_zip.is_file(): raise SystemExit('OPENRILL_STEP023A_FRESH_ZIP_MISSING')
    if extract == Path(__file__).resolve().parents[1]: raise SystemExit('OPENRILL_STEP023A_FRESH_EXTRACT_SOURCE_ROOT_FORBIDDEN')
    if extract.exists(): shutil.rmtree(extract)
    extract.parent.mkdir(parents=True,exist_ok=True); repack.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(source_zip) as z:
        names=z.namelist()
        if z.testzip() is not None: raise SystemExit('OPENRILL_STEP023A_FRESH_CRC_FAILED')
        if len(names)!=len(set(names)): raise SystemExit('OPENRILL_STEP023A_FRESH_DUPLICATE_ENTRY')
        if not safe_names(names): raise SystemExit('OPENRILL_STEP023A_FRESH_UNSAFE_ENTRY')
        bad=[name for name in names if generated_violation(name)]
        if bad: raise SystemExit(f'OPENRILL_STEP023A_FRESH_GENERATED_OUTPUT {bad[:5]!r}')
        extract.mkdir(parents=True,exist_ok=False)
        z.extractall(extract)
    for command in REQUIRED_CHECKS: run_checked(command,extract)
    manifest=json.loads((extract/'PACKAGE_MANIFEST.json').read_text(encoding='utf-8'))
    run_checked(['python','scripts/package_step023a.py','--output',str(repack)],extract)
    source_bytes=source_zip.read_bytes(); repack_bytes=repack.read_bytes()
    if source_bytes != repack_bytes: raise SystemExit('OPENRILL_STEP023A_FRESH_REPACK_NOT_BYTE_IDENTICAL')
    print(f'OPENRILL_STEP023A_FRESH_PASS source_sha256={hashlib.sha256(source_bytes).hexdigest()} zip_entries={len(names)} manifest_files={manifest["filesExcludingManifest"]} deterministic_repack=BYTE_IDENTICAL')
    return 0
if __name__=='__main__': raise SystemExit(main())
