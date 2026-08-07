from __future__ import annotations
import argparse, json, os, re, shutil
from pathlib import Path
from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage
from step022a_live_marker import load_contract, validate_live_output

ROOT=Path(__file__).resolve().parents[1]
STEP='STEP022A_LOCAL_EXTENSION_PACKAGE_CONTRACT_AND_RUNTIME_REGISTRY'
VERSION='0.22.0-step022a'
SCHEMA=24
BASELINE='STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE'
BASELINE_VERSION='0.21.3-step021br2'
BASELINE_CHECKS='82/82'
BASELINE_SHA='4f763933b37235b2ed7f87f1c1922fc934fdf80bb4135b8e37b12b274f1a1ed5'
LIVE_HARNESS='STEP022A_H1_LOCAL_EXTENSION_PACKAGE_RUNTIME_RESTART'
CONTRACT=load_contract()
REPORT=resolve_acceptance_report(ROOT,'.artifacts/acceptance/STEP022A_ACCEPTANCE_REPORT.txt')
LOGDIR=REPORT.parent/'STEP022A_STAGES'
FOCUSED=[
 'tests/unit/extension-contract-step022a.test.mjs','tests/unit/extension-runtime-step022a.test.mjs',
 'tests/unit/extension-protocol-step022a.test.mjs','tests/unit/extension-host-step022a.test.mjs']
RETAINED=[
 'tests/unit/goal-plan-executor-step021a.test.mjs','tests/unit/goal-plan-executor-protocol-step021a.test.mjs',
 'tests/unit/goal-plan-executor-host-step021a.test.mjs','tests/unit/goal-plan-revision-retry-step021b.test.mjs',
 'tests/unit/goal-plan-revision-migration-step021b.test.mjs','tests/unit/goal-plan-revision-retry-protocol-step021b.test.mjs',
 'tests/unit/goal-plan-revision-host-step021b.test.mjs','tests/unit/node-tap-summary-step021br2.test.mjs']
AFFECTED=[
 'tests/unit/config-step003.test.mjs','tests/unit/os-secret-provider-step016a.test.mjs',
 'tests/unit/protocol-step004.test.mjs','tests/unit/local-protocol-step004.test.mjs',
 'tests/unit/host-foundation.test.mjs','tests/unit/host-lifecycle.test.mjs']
GOVERNANCE=[str(path.relative_to(ROOT)).replace('\\','/') for path in sorted((ROOT/'tests/unit').glob('validation-governance-*.test.mjs'))]
STAGES=[
 ('source-version-alignment',['python','scripts/verify_source_version_alignment.py'],60),
 ('workspace-lock-alignment',['python','scripts/verify_workspace_lock_alignment.py'],60),
 ('workspace-module-links',['python','scripts/verify_workspace_module_links.py'],60),
 ('source-root-boundary',['python','scripts/check_source_root_boundary.py'],60),
 ('package-manifest-initial',['python','scripts/verify_package_manifest.py'],120),
 ('workspace-build',['node','scripts/workspace-runner.mjs','build'],300),
 ('focused-step022a-extension',['node','--test','--test-concurrency=1','--test-reporter=tap',*FOCUSED],180),
 ('retained-step021br2-product',['node','--test','--test-concurrency=1','--test-reporter=tap',*RETAINED],700),
 ('affected-config-protocol-host',['node','--test','--test-concurrency=1','--test-reporter=tap',*AFFECTED],700),
 ('focused-validation-governance',['node','--test','--test-concurrency=1','--test-reporter=tap',*GOVERNANCE],1200),
 ('canonical-suite',['node','scripts/run-canonical-unit-batches.mjs'],1900),
 ('architecture',['python','scripts/check_architecture.py'],120),
 ('exports',['node','scripts/check-exports.mjs'],180),
 ('package-manifest-final',['python','scripts/verify_package_manifest.py'],120),
]

def clean() -> None:
    for group in ('apps','services','packages','connectors','skills'):
        parent=ROOT/group
        if parent.exists():
            for directory in parent.iterdir():
                if directory.is_dir(): shutil.rmtree(directory/'dist',ignore_errors=True)
    shutil.rmtree(ROOT/'.artifacts',ignore_errors=True)

def tap_summary(output: str) -> tuple[bool,int]:
    values={name:-1 for name in ('tests','pass','fail','cancelled','skipped','todo')}
    for raw in output.splitlines():
        match=re.fullmatch(r'\s*#\s+(tests|pass|fail|cancelled|skipped|todo)\s+([0-9]+)\s*',raw)
        if match: values[match.group(1)]=int(match.group(2))
    ok=values['tests']>=0 and values['tests']==values['pass'] and values['fail']==0 and values['cancelled']==0 and values['skipped']==0 and values['todo']==0
    return ok,values['tests']

def run(name: str, command: list[str], timeout: float):
    env=os.environ.copy();env.update({'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8','NO_COLOR':'1','NODE_DISABLE_COLORS':'1'})
    result=run_stage(name=name,command=command,cwd=ROOT,env=env,timeout_seconds=timeout)
    LOGDIR.mkdir(parents=True,exist_ok=True)
    path=LOGDIR/f'{name}.log';path.write_text(result.output,encoding='utf-8')
    print(f'OPENRILL_ACCEPTANCE_STAGE_LOG name={name} path={path.relative_to(ROOT).as_posix()} bytes={path.stat().st_size}',flush=True)
    return result

def main() -> int:
    parser=argparse.ArgumentParser();parser.add_argument('--require-windows-extension-live',action='store_true');args=parser.parse_args()
    print('OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal',flush=True);clean();print('OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal',flush=True)
    checks=[];counts={};seconds=0.0
    def check(name,value,detail=''): checks.append((name,bool(value),str(detail)))
    pkg=json.loads((ROOT/'package.json').read_text(encoding='utf-8'));scripts=pkg['scripts'];baseline=json.loads((ROOT/'config/current-accepted-baseline.json').read_text(encoding='utf-8'))
    check('root-version',pkg.get('version')==VERSION,pkg.get('version'));check('root-description','STEP022A' in pkg.get('description',''))
    check('acceptance-script',scripts.get('acceptance:step022a')=='python scripts/run_step022a_acceptance.py')
    check('live-acceptance-script',scripts.get('acceptance:step022a:live')=='python scripts/run_step022a_acceptance.py --require-windows-extension-live')
    check('live-harness-script',scripts.get('windows-extension-live:step022a')=='node scripts/run-step022a-windows-extension-live.mjs')
    check('package-script',scripts.get('package:step022a')=='python scripts/package_step022a.py --output ../openrill-step022a-local-extension-package-contract-runtime-registry-v1.zip')
    check('baseline-step',baseline.get('step')==BASELINE,baseline.get('step'));check('baseline-version',baseline.get('version')==BASELINE_VERSION,baseline.get('version'))
    check('baseline-checks',baseline.get('checks')==BASELINE_CHECKS,baseline.get('checks'));check('baseline-sha',baseline.get('zipSha256')==BASELINE_SHA,baseline.get('zipSha256'))
    check('baseline-schema',baseline.get('stateSchema')==SCHEMA,baseline.get('stateSchema'))
    check('contract-step',CONTRACT.get('step')==STEP);check('contract-version',CONTRACT.get('version')==VERSION);check('contract-schema',CONTRACT.get('schema')==SCHEMA)
    check('contract-checks',CONTRACT.get('expectedChecks')=='43/43');check('contract-harness',CONTRACT.get('liveHarness')==LIVE_HARNESS)
    required=[
      'packages/extension-sdk/src/types.ts','packages/extension-sdk/src/validation.ts','packages/extension-sdk/src/compatibility.ts',
      'services/agent-host/src/extension-runtime.ts','packages/protocol/src/extension-operations.ts',
      'tests/unit/extension-contract-step022a.test.mjs','tests/unit/extension-runtime-step022a.test.mjs',
      'tests/unit/extension-protocol-step022a.test.mjs','tests/unit/extension-host-step022a.test.mjs',
      'tests/unit/validation-governance-step022a.test.mjs','scripts/run_step022a_acceptance.py',
      'scripts/run-step022a-windows-extension-live.mjs','scripts/package_step022a.py','scripts/step022a-live-marker.mjs',
      'scripts/step022a_live_marker.py','config/step022a-live-marker-contract.json',
      'docs/plans/STEP022A_LOCAL_EXTENSION_PACKAGE_CONTRACT_AND_RUNTIME_REGISTRY.md','docs/contracts/LOCAL_EXTENSIONS.md',
      'docs/research/STEP022A_OPENCLAW_EXTENSION_PACKAGE_AND_RUNTIME_REGISTRY_AUDIT.md',
      'reference/validation/STEP021BR2_WINDOWS_TAP_SUMMARY_LIVE_ACCEPTANCE.md',
      *[f'reference/validation/STEP022A_OR_ISSUE_{number}.md' for number in range(307,322)],
    ]
    for path in required: check('required:'+path,(ROOT/path).is_file())
    for name,command,timeout in STAGES:
        result=run(name,command,timeout);seconds+=result.elapsed_seconds;ok=result.ok
        if name in ('focused-step022a-extension','retained-step021br2-product','affected-config-protocol-host','focused-validation-governance'):
            ok,total=tap_summary(result.output);counts[name]=total
        if name=='canonical-suite':
            match=re.search(r'OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0',result.output)
            ok=bool(match);counts[name]=int(match.group(3)) if match else 0;counts['canonical-files']=int(match.group(1)) if match else 0
        if name=='architecture':
            match=re.search(r'OPENRILL_ARCHITECTURE_PASS packages=(\d+) edges=(\d+) sources=(\d+)',result.output)
            if match: counts['architecture']=tuple(map(int,match.groups()))
        check(name,ok,result.output[-4000:])
    if args.require_windows_extension_live:
        result=run('windows-extension-live',['node','scripts/run-step022a-windows-extension-live.mjs'],900);seconds+=result.elapsed_seconds
        marker_ok,detail=validate_live_output(result.output,CONTRACT);check('windows-extension-live',result.ok and marker_ok,f'result_ok={result.ok} {detail}\n{result.output[-6000:]}')
    passed=sum(1 for _,ok,_ in checks if ok);total=len(checks);state='PASSED' if passed==total else 'FAILED'
    live='PASSED' if args.require_windows_extension_live and state=='PASSED' else 'PENDING_ENV' if not args.require_windows_extension_live else 'FAILED'
    promotion='READY' if live=='PASSED' else 'WINDOWS_EXTENSION_LIVE_PENDING' if live=='PENDING_ENV' else 'BLOCKED'
    architecture=counts.get('architecture',(0,0,0))
    marker=(f'{STEP} checks={passed}/{total} state={state} version={VERSION} schema={SCHEMA} accepted_product_baseline={BASELINE} accepted_checks={BASELINE_CHECKS} manifest_contract=CLOSED_V1 discovery=EXPLICIT_ROOTS_DETERMINISTIC activation=BOUNDED_ISOLATED capability_ownership=UNIQUE secrets=REFERENCE_ONLY state_authority=NOT_GRANTED runtime_toggle=HOST_EFFECTIVE_ONLY restart=DUPLICATE_FREE marketplace=NOT_IMPLEMENTED connector=DEFERRED_STEP022B focused_extension={counts.get("focused-step022a-extension",0)} retained_product={counts.get("retained-step021br2-product",0)} affected_regression={counts.get("affected-config-protocol-host",0)} governance={counts.get("focused-validation-governance",0)} canonical_files={counts.get("canonical-files",0)} canonical_tests={counts.get("canonical-suite",0)} architecture={architecture[0]}_packages/{architecture[1]}_edges/{architecture[2]}_sources windows_extension_live={live} live_harness={LIVE_HARNESS} promotion={promotion} automated_run_seconds={seconds:.3f}')
    lines=[marker]+[f'OPENRILL_STEP022A_FAILURE check={name}\n{detail}' for name,ok,detail in checks if not ok]
    write_acceptance_report(REPORT,'\n'.join(lines)+'\n');print(marker);[print(line) for line in lines[1:]]
    return 0 if state=='PASSED' else 1
if __name__=='__main__': raise SystemExit(main())
