from __future__ import annotations
import os, re, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STEP='STEP022CR3_WINDOWS_CMD_ENTRYPOINT_BYTE_CONTRACT_CLOSURE'
PRODUCT_VERSION='0.24.0-step022c'
SCHEMA=25
CMD_FILES=('start-and-run-step022c-live.cmd','start-mattermost-testbed.cmd','stop-mattermost-testbed.cmd','reset-mattermost-testbed.cmd')

def run(command:list[str],cwd:Path|None=None,timeout:int=3000):
 env=os.environ.copy(); env.update({'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8','NO_COLOR':'1','NODE_DISABLE_COLORS':'1'})
 return subprocess.run(command,cwd=cwd or ROOT,env=env,text=True,encoding='utf-8',errors='replace',stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)

def tap_summary(output:str):
 values={name:-1 for name in ('tests','pass','fail','cancelled','skipped','todo')}
 for raw in output.splitlines():
  m=re.fullmatch(r'\s*#\s+(tests|pass|fail|cancelled|skipped|todo)\s+([0-9]+)\s*',raw)
  if m: values[m.group(1)]=int(m.group(2))
 return values

def crlf_ascii(data:bytes)->bool:
 if len(data)<64 or b'\r\n' not in data or any(b>=128 for b in data): return False
 for i,b in enumerate(data):
  if b==10 and (i==0 or data[i-1]!=13): return False
  if b==13 and (i+1>=len(data) or data[i+1]!=10): return False
 return True

def main()->int:
 checks=[]
 def check(name,value,detail=''): checks.append((name,bool(value),str(detail)))
 pkg=(ROOT/'package.json').read_text(encoding='utf-8')
 check('product-version-retained','"version": "0.24.0-step022c"' in pkg)
 check('schema-retained','OPENRILL_STATE_SCHEMA_VERSION = 25' in (ROOT/'packages/state/src/migrations.ts').read_text(encoding='utf-8'))
 for name in CMD_FILES:
  data=(ROOT/name).read_bytes(); check(f'{name}-nonempty',len(data)>=64,len(data)); check(f'{name}-crlf-ascii',crlf_ascii(data),len(data))
 primary=(ROOT/'start-and-run-step022c-live.cmd').read_bytes().decode('ascii')
 check('primary-root','cd /d "%~dp0"' in primary)
 check('primary-pnpm-check','where pnpm >nul 2>nul' in primary)
 check('primary-frozen-install','call pnpm install --frozen-lockfile' in primary)
 check('primary-live','call pnpm mattermost:testbed:live' in primary)
 check('primary-direct','powershell' not in primary.lower() and 'OpenRillRoot' not in primary)
 check('issue-372',(ROOT/'reference/validation/STEP022CR3_OR_ISSUE_372.md').is_file())
 focused=run(['node','--test','--test-concurrency=1','--test-reporter=tap',str((ROOT/'tests/unit/mattermost-testbed-step022cr3.test.mjs').resolve()),str((ROOT/'tests/unit/validation-governance-step022cr3.test.mjs').resolve())],cwd=ROOT.parent,timeout=180)
 tap=tap_summary(focused.stdout)
 check('focused-exit',focused.returncode==0,focused.returncode); check('focused-tests',tap['tests']==5,tap); check('focused-pass',tap['pass']==5,tap); check('focused-clean',tap['fail']==0 and tap['cancelled']==0 and tap['skipped']==0 and tap['todo']==0,tap)
 retained=run([sys.executable,'scripts/run_step022c_acceptance.py'],timeout=3000)
 check('step022c-retained',retained.returncode==0 and 'checks=32/32 state=PASSED' in retained.stdout,retained.returncode)
 passed=sum(1 for _,ok,_ in checks if ok); state='PASSED' if passed==len(checks) else 'FAILED'
 for name,ok,detail in checks:
  if not ok: print(f'OPENRILL_STEP022CR3_FAILURE check={name} detail={detail}')
 print(f'{STEP} checks={passed}/{len(checks)} state={state} product_version={PRODUCT_VERSION} schema={SCHEMA} cmd_byte_contract=CRLF_ASCII_DIRECT zip_postread=REQUIRED focused=5/5 step022c_local=32/32 windows_mattermost_live=PENDING')
 return 0 if state=='PASSED' else 1
if __name__=='__main__': raise SystemExit(main())
