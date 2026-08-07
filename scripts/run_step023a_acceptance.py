from __future__ import annotations
import argparse, json, os, re, shutil
from pathlib import Path
from acceptance_stage_runner import run_stage
from acceptance_reports import write_acceptance_report
from step023a_live_marker import load_contract, validate_live_output
ROOT=Path(__file__).resolve().parents[1]
STEP='STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE'; VERSION='0.25.0-step023a'; SCHEMA=26
BASELINE='STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE'; BASELINE_VERSION='0.21.3-step021br2'; BASELINE_CHECKS='82/82'; BASELINE_SHA='4f763933b37235b2ed7f87f1c1922fc934fdf80bb4135b8e37b12b274f1a1ed5'
LIVE_HARNESS='STEP023A_H1_PERIODIC_RETENTION_LEASE_CURSOR_PRUNE_AND_RESTART'; CONTRACT=load_contract()
LOGDIR=ROOT/'.artifacts/acceptance/STEP023A_STAGES'; REPORT=ROOT/'.artifacts/acceptance/STEP023A_ACCEPTANCE.txt'
FOCUSED=['tests/unit/maintenance-retention-step023a.test.mjs','tests/unit/maintenance-host-step023a.test.mjs']
RETAINED=[
 'tests/unit/task-maintenance-step020d.test.mjs','tests/unit/task-flow-maintenance-step020d.test.mjs','tests/unit/maintenance-protocol-step020d.test.mjs','tests/unit/maintenance-host-step020d.test.mjs',
 'tests/unit/task-completion-delivery-step020e.test.mjs','tests/unit/task-completion-host-step020e.test.mjs',
 'tests/unit/task-flow-registry-step020b.test.mjs','tests/unit/task-flow-controller-runtime-step020c.test.mjs',
 'tests/unit/goal-plan-executor-step021a.test.mjs','tests/unit/goal-plan-revision-retry-step021b.test.mjs',
 'tests/unit/connector-runtime-step022b.test.mjs','tests/unit/connector-run-output-step022c.test.mjs'
]
AFFECTED=['tests/unit/config-step003.test.mjs','tests/unit/protocol-step004.test.mjs','tests/unit/local-protocol-step004.test.mjs','tests/unit/host-foundation.test.mjs','tests/unit/host-lifecycle.test.mjs']
GOVERNANCE=lambda:[str(path.relative_to(ROOT)).replace('\\','/') for path in sorted((ROOT/'tests/unit').glob('validation-governance-*.test.mjs'))]

def stages(): return [
 ('source-version-alignment',['python','scripts/verify_source_version_alignment.py'],60),
 ('workspace-lock-alignment',['python','scripts/verify_workspace_lock_alignment.py'],60),
 ('workspace-module-links',['python','scripts/verify_workspace_module_links.py'],60),
 ('source-root-boundary',['python','scripts/check_source_root_boundary.py'],60),
 ('package-manifest-initial',['python','scripts/verify_package_manifest.py'],120),
 ('workspace-build',['node','scripts/workspace-runner.mjs','build'],300),
 ('focused-step023a-maintenance',['node','--test','--test-concurrency=1','--test-reporter=tap',*FOCUSED],500),
 ('retained-durable-state',['node','--test','--test-concurrency=1','--test-reporter=tap',*RETAINED],1200),
 ('affected-config-protocol-host',['node','--test','--test-concurrency=1','--test-reporter=tap',*AFFECTED],800),
 ('focused-validation-governance',['node','--test','--test-concurrency=1','--test-reporter=tap',*GOVERNANCE()],1800),
 ('canonical-suite',['node','scripts/run-canonical-unit-batches.mjs'],3000),
 ('architecture',['python','scripts/check_architecture.py'],120),
 ('exports',['node','scripts/check-exports.mjs'],180),
 ('package-manifest-final',['python','scripts/verify_package_manifest.py'],120),
]

def clean():
    for group in ('apps','services','packages','connectors','skills'):
        parent=ROOT/group
        if parent.exists():
            for directory in parent.iterdir():
                if directory.is_dir(): shutil.rmtree(directory/'dist',ignore_errors=True)
    shutil.rmtree(ROOT/'.artifacts',ignore_errors=True)

def tap_summary(output):
    values={name:-1 for name in ('tests','pass','fail','cancelled','skipped','todo')}
    for raw in output.splitlines():
        m=re.fullmatch(r'\s*#\s+(tests|pass|fail|cancelled|skipped|todo)\s+([0-9]+)\s*',raw)
        if m: values[m.group(1)]=int(m.group(2))
    ok=values['tests']>=0 and values['tests']==values['pass'] and values['fail']==0 and values['cancelled']==0 and values['skipped']==0 and values['todo']==0
    return ok,values['tests']

def run(name,command,timeout):
    env=os.environ.copy(); env.update({'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8','NO_COLOR':'1','NODE_DISABLE_COLORS':'1'})
    result=run_stage(name=name,command=command,cwd=ROOT,env=env,timeout_seconds=timeout)
    LOGDIR.mkdir(parents=True,exist_ok=True); path=LOGDIR/f'{name}.log'; path.write_text(result.output,encoding='utf-8')
    print(f'OPENRILL_ACCEPTANCE_STAGE_LOG name={name} path={path.relative_to(ROOT).as_posix()} bytes={path.stat().st_size}',flush=True)
    return result

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--require-windows-maintenance-retention-live',action='store_true'); args=parser.parse_args()
    print('OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal',flush=True); clean(); print('OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal',flush=True)
    checks=[]; counts={}; seconds=0.0
    def check(name,value,detail=''): checks.append((name,bool(value),str(detail)))
    pkg=json.loads((ROOT/'package.json').read_text(encoding='utf-8')); scripts=pkg['scripts']; baseline=json.loads((ROOT/'config/current-accepted-baseline.json').read_text(encoding='utf-8'))
    check('root-version',pkg.get('version')==VERSION,pkg.get('version')); check('root-description','STEP023A' in pkg.get('description',''))
    check('acceptance-script',scripts.get('acceptance:step023a')=='python scripts/run_step023a_acceptance.py')
    check('live-acceptance-script',scripts.get('acceptance:step023a:live')=='python scripts/run_step023a_acceptance.py --require-windows-maintenance-retention-live')
    check('live-harness-script',scripts.get('maintenance-retention-live:step023a')=='node scripts/run-step023a-maintenance-retention-live.mjs')
    check('package-script',scripts.get('package:step023a')=='python scripts/package_step023a.py --output ../openrill-step023a-periodic-maintenance-physical-retention-prune-v1.zip')
    check('baseline-step',baseline.get('step')==BASELINE,baseline.get('step')); check('baseline-version',baseline.get('version')==BASELINE_VERSION,baseline.get('version')); check('baseline-checks',baseline.get('checks')==BASELINE_CHECKS,baseline.get('checks')); check('baseline-sha',baseline.get('zipSha256')==BASELINE_SHA,baseline.get('zipSha256')); check('baseline-schema',baseline.get('stateSchema')==24,baseline.get('stateSchema'))
    check('contract-step',CONTRACT.get('step')==STEP); check('contract-version',CONTRACT.get('version')==VERSION); check('contract-schema',CONTRACT.get('schema')==SCHEMA); check('contract-checks',CONTRACT.get('expectedChecks')=='28/28'); check('contract-harness',CONTRACT.get('liveHarness')==LIVE_HARNESS)
    required=['packages/state/migrations/026_periodic_maintenance_physical_retention.sql','packages/state/src/retention-repository.ts','services/agent-host/src/maintenance-retention.ts','packages/protocol/src/maintenance-operations.ts','tests/unit/maintenance-retention-step023a.test.mjs','tests/unit/maintenance-host-step023a.test.mjs','tests/unit/validation-governance-step023a.test.mjs','docs/contracts/MAINTENANCE_RETENTION.md','docs/plans/STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE.md','docs/research/STEP023A_OPENCLAW_MAINTENANCE_REFERENCE_AUDIT.md','GITHUB_PUBLISHING.md','reference/validation/STEP023AR1_GITHUB_PUBLISHING_READINESS_AUDIT.md','scripts/run_step023a_acceptance.py','scripts/run-step023a-maintenance-retention-live.mjs','scripts/package_step023a.py','scripts/verify_step023a_fresh.py','config/step023a-live-marker-contract.json']
    check('required-assets',all((ROOT/p).is_file() for p in required),[p for p in required if not (ROOT/p).is_file()])
    issue_paths=[ROOT/(f'reference/validation/STEP023A_OR_ISSUE_{n}.md' if n<=404 else f'reference/validation/STEP023AR1_OR_ISSUE_{n}.md') for n in range(376,411)]; check('issue-assets',all(p.is_file() for p in issue_paths),[p.name for p in issue_paths if not p.is_file()])
    for name,command,timeout in stages():
        result=run(name,command,timeout); seconds+=result.elapsed_seconds; ok=result.ok
        if name in ('focused-step023a-maintenance','retained-durable-state','affected-config-protocol-host','focused-validation-governance'):
            ok,total=tap_summary(result.output); counts[name]=total
        if name=='canonical-suite':
            m=re.search(r'OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0',result.output); ok=bool(m); counts[name]=int(m.group(3)) if m else 0; counts['canonical-files']=int(m.group(1)) if m else 0
        if name=='architecture':
            m=re.search(r'OPENRILL_ARCHITECTURE_PASS packages=(\d+) edges=(\d+) sources=(\d+)',result.output); counts['architecture']=tuple(map(int,m.groups())) if m else (0,0,0)
        check(name,ok,result.output[-4000:])
        if not ok: break
    if args.require_windows_maintenance_retention_live and all(ok for _,ok,_ in checks):
        result=run('windows-maintenance-retention-live',['node','scripts/run-step023a-maintenance-retention-live.mjs'],900); seconds+=result.elapsed_seconds
        marker_ok,detail=validate_live_output(result.output,CONTRACT); check('windows-maintenance-retention-live',result.ok and marker_ok,f'result_ok={result.ok} {detail}\n{result.output[-9000:]}')
    elif args.require_windows_maintenance_retention_live:
        check('windows-maintenance-retention-live',False,'prior acceptance stage failed')
    passed=sum(1 for _,ok,_ in checks if ok); total=len(checks); state='PASSED' if passed==total else 'FAILED'
    live='PASSED' if args.require_windows_maintenance_retention_live and state=='PASSED' else 'PENDING_WINDOWS' if not args.require_windows_maintenance_retention_live else 'FAILED'
    promotion='READY' if live=='PASSED' else 'WINDOWS_MAINTENANCE_RETENTION_LIVE_PENDING' if live=='PENDING_WINDOWS' else 'BLOCKED'
    architecture=counts.get('architecture',(0,0,0))
    marker=(f'{STEP} checks={passed}/{total} state={state} version={VERSION} schema={SCHEMA} accepted_product_baseline={BASELINE} accepted_checks={BASELINE_CHECKS} maintenance=HOST_OWNED_PERIODIC ownership=DURABLE_LEASE cursor=PERSISTED_RESTART_CONTINUATION prune=PROTECTION_RECHECK_TOMBSTONE_FIRST connector=SAFE_TERMINAL_RECEIPT_REQUIRED mattermost=PREPARING_LIVE_PENDING_NON_BLOCKING focused_product={counts.get("focused-step023a-maintenance",0)} retained_product={counts.get("retained-durable-state",0)} affected_regression={counts.get("affected-config-protocol-host",0)} governance={counts.get("focused-validation-governance",0)} canonical_files={counts.get("canonical-files",0)} canonical_tests={counts.get("canonical-suite",0)} architecture={architecture[0]}_packages/{architecture[1]}_edges/{architecture[2]}_sources windows_maintenance_retention_live={live} live_harness={LIVE_HARNESS} promotion={promotion} automated_run_seconds={seconds:.3f}')
    lines=[marker]+[f'OPENRILL_STEP023A_FAILURE check={name}\n{detail}' for name,ok,detail in checks if not ok]; write_acceptance_report(REPORT,'\n'.join(lines)+'\n'); print(marker); [print(line) for line in lines[1:]]
    return 0 if state=='PASSED' else 1
if __name__=='__main__': raise SystemExit(main())
