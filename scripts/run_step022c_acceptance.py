from __future__ import annotations
import argparse, json, os, re, shutil
from pathlib import Path
from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage
from step022c_live_marker import load_contract, validate_live_output

ROOT=Path(__file__).resolve().parents[1]
STEP='STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE'
VERSION='0.24.0-step022c'
SCHEMA=25
BASELINE='STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE'
BASELINE_VERSION='0.21.3-step021br2'
BASELINE_CHECKS='82/82'
BASELINE_SHA='4f763933b37235b2ed7f87f1c1922fc934fdf80bb4135b8e37b12b274f1a1ed5'
LIVE_HARNESS='STEP022C_H1_REAL_MATTERMOST_DM_MENTION_THREAD_DELIVERY_AND_RESTART'
CONTRACT=load_contract()
REPORT=resolve_acceptance_report(ROOT,'.artifacts/acceptance/STEP022C_ACCEPTANCE_REPORT.txt')
LOGDIR=REPORT.parent/'STEP022C_STAGES'
FOCUSED=[
 'tests/unit/mattermost-client-step022c.test.mjs','tests/unit/mattermost-routing-step022c.test.mjs',
 'tests/unit/connector-run-output-step022c.test.mjs','tests/unit/mattermost-runtime-step022c.test.mjs',
 'tests/unit/mattermost-extension-step022c.test.mjs','tests/unit/connector-observability-step022c.test.mjs',
 'tests/unit/mattermost-host-step022c.test.mjs']
RETAINED=[
 'tests/unit/connector-runtime-step022b.test.mjs','tests/unit/extension-connector-step022b.test.mjs','tests/unit/connector-protocol-step022b.test.mjs','tests/unit/connector-host-step022b.test.mjs',
 'tests/unit/extension-contract-step022a.test.mjs','tests/unit/extension-runtime-step022a.test.mjs','tests/unit/extension-protocol-step022a.test.mjs','tests/unit/extension-host-step022a.test.mjs',
 'tests/unit/goal-plan-executor-step021a.test.mjs','tests/unit/goal-plan-executor-protocol-step021a.test.mjs','tests/unit/goal-plan-executor-host-step021a.test.mjs',
 'tests/unit/goal-plan-revision-retry-step021b.test.mjs','tests/unit/goal-plan-revision-migration-step021b.test.mjs','tests/unit/goal-plan-revision-retry-protocol-step021b.test.mjs','tests/unit/goal-plan-revision-host-step021b.test.mjs',
 'tests/unit/node-tap-summary-step021br2.test.mjs']
AFFECTED=['tests/unit/config-step003.test.mjs','tests/unit/protocol-step004.test.mjs','tests/unit/local-protocol-step004.test.mjs','tests/unit/host-foundation.test.mjs','tests/unit/host-lifecycle.test.mjs']
GOVERNANCE=[str(path.relative_to(ROOT)).replace('\\','/') for path in sorted((ROOT/'tests/unit').glob('validation-governance-*.test.mjs'))]
STAGES=[
 ('source-version-alignment',['python','scripts/verify_source_version_alignment.py'],60),
 ('workspace-lock-alignment',['python','scripts/verify_workspace_lock_alignment.py'],60),
 ('workspace-module-links',['python','scripts/verify_workspace_module_links.py'],60),
 ('source-root-boundary',['python','scripts/check_source_root_boundary.py'],60),
 ('package-manifest-initial',['python','scripts/verify_package_manifest.py'],120),
 ('workspace-build',['node','scripts/workspace-runner.mjs','build'],300),
 ('focused-step022c-mattermost',['node','--test','--test-concurrency=1','--test-reporter=tap',*FOCUSED],400),
 ('retained-step022b-step022a-step021br2',['node','--test','--test-concurrency=1','--test-reporter=tap',*RETAINED],1000),
 ('affected-config-protocol-host',['node','--test','--test-concurrency=1','--test-reporter=tap',*AFFECTED],700),
 ('focused-validation-governance',['node','--test','--test-concurrency=1','--test-reporter=tap',*GOVERNANCE],1500),
 ('canonical-suite',['node','scripts/run-canonical-unit-batches.mjs'],2400),
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
        match=re.fullmatch(r'\s*#\s+(tests|pass|fail|cancelled|skipped|todo)\s+([0-9]+)\s*',raw)
        if match: values[match.group(1)]=int(match.group(2))
    ok=values['tests']>=0 and values['tests']==values['pass'] and values['fail']==0 and values['cancelled']==0 and values['skipped']==0 and values['todo']==0
    return ok,values['tests']

def run(name,command,timeout):
    env=os.environ.copy(); env.update({'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8','NO_COLOR':'1','NODE_DISABLE_COLORS':'1'})
    result=run_stage(name=name,command=command,cwd=ROOT,env=env,timeout_seconds=timeout)
    LOGDIR.mkdir(parents=True,exist_ok=True); path=LOGDIR/f'{name}.log'; path.write_text(result.output,encoding='utf-8')
    print(f'OPENRILL_ACCEPTANCE_STAGE_LOG name={name} path={path.relative_to(ROOT).as_posix()} bytes={path.stat().st_size}',flush=True)
    return result

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--require-windows-mattermost-live',action='store_true'); args=parser.parse_args()
    print('OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal',flush=True); clean(); print('OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal',flush=True)
    checks=[]; counts={}; seconds=0.0
    def check(name,value,detail=''): checks.append((name,bool(value),str(detail)))
    pkg=json.loads((ROOT/'package.json').read_text(encoding='utf-8')); scripts=pkg['scripts']; baseline=json.loads((ROOT/'config/current-accepted-baseline.json').read_text(encoding='utf-8'))
    check('root-version',pkg.get('version')==VERSION,pkg.get('version')); check('root-description','STEP022C' in pkg.get('description',''))
    check('acceptance-script',scripts.get('acceptance:step022c')=='python scripts/run_step022c_acceptance.py')
    check('live-acceptance-script',scripts.get('acceptance:step022c:live')=='python scripts/run_step022c_acceptance.py --require-windows-mattermost-live')
    check('live-harness-script',scripts.get('mattermost-live:step022c')=='node scripts/run-step022c-mattermost-live.mjs')
    check('package-script',scripts.get('package:step022c')=='python scripts/package_step022c.py --output ../openrill-step022c-mattermost-real-connector-durable-vertical-slice-v1.zip')
    check('baseline-step',baseline.get('step')==BASELINE,baseline.get('step')); check('baseline-version',baseline.get('version')==BASELINE_VERSION,baseline.get('version'))
    check('baseline-checks',baseline.get('checks')==BASELINE_CHECKS,baseline.get('checks')); check('baseline-sha',baseline.get('zipSha256')==BASELINE_SHA,baseline.get('zipSha256')); check('baseline-schema',baseline.get('stateSchema')==24,baseline.get('stateSchema'))
    check('contract-step',CONTRACT.get('step')==STEP); check('contract-version',CONTRACT.get('version')==VERSION); check('contract-schema',CONTRACT.get('schema')==SCHEMA); check('contract-checks',CONTRACT.get('expectedChecks')=='56/56'); check('contract-harness',CONTRACT.get('liveHarness')==LIVE_HARNESS)
    required=['connectors/mattermost/openrill.extension.json','connectors/mattermost/src/client.ts','connectors/mattermost/src/normalize.ts','connectors/mattermost/src/runtime.ts','connectors/mattermost/src/extension.ts','tests/unit/mattermost-client-step022c.test.mjs','tests/unit/mattermost-routing-step022c.test.mjs','tests/unit/connector-run-output-step022c.test.mjs','tests/unit/mattermost-runtime-step022c.test.mjs','tests/unit/mattermost-extension-step022c.test.mjs','tests/unit/connector-observability-step022c.test.mjs','tests/unit/mattermost-host-step022c.test.mjs','tests/unit/validation-governance-step022c.test.mjs','scripts/run_step022c_acceptance.py','scripts/run-step022c-mattermost-live.mjs','scripts/package_step022c.py','scripts/step022c-live-marker.mjs','scripts/step022c_live_marker.py','config/step022c-live-marker-contract.json','docs/contracts/MATTERMOST_CONNECTOR.md','docs/plans/STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE.md','docs/research/STEP022C_OPENCLAW_MATTERMOST_CONNECTOR_AUDIT.md','reference/validation/STEP022C_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md']
    check('required-assets',all((ROOT/path).is_file() for path in required),[path for path in required if not (ROOT/path).is_file()])
    issue_paths=[ROOT/f'reference/validation/STEP022C_OR_ISSUE_{number}.md' for number in range(341,366)]
    check('issue-assets',all(path.is_file() for path in issue_paths),[path.name for path in issue_paths if not path.is_file()])
    for name,command,timeout in STAGES:
        result=run(name,command,timeout); seconds+=result.elapsed_seconds; ok=result.ok
        if name in ('focused-step022c-mattermost','retained-step022b-step022a-step021br2','affected-config-protocol-host','focused-validation-governance'):
            ok,total=tap_summary(result.output); counts[name]=total
        if name=='canonical-suite':
            match=re.search(r'OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0',result.output)
            ok=bool(match); counts[name]=int(match.group(3)) if match else 0; counts['canonical-files']=int(match.group(1)) if match else 0
        if name=='architecture':
            match=re.search(r'OPENRILL_ARCHITECTURE_PASS packages=(\d+) edges=(\d+) sources=(\d+)',result.output)
            if match: counts['architecture']=tuple(map(int,match.groups()))
        check(name,ok,result.output[-4000:])
    if args.require_windows_mattermost_live:
        result=run('windows-mattermost-live',['node','scripts/run-step022c-mattermost-live.mjs'],1800); seconds+=result.elapsed_seconds
        marker_ok,detail=validate_live_output(result.output,CONTRACT); check('windows-mattermost-live',result.ok and marker_ok,f'result_ok={result.ok} {detail}\n{result.output[-9000:]}')
    passed=sum(1 for _,ok,_ in checks if ok); total=len(checks); state='PASSED' if passed==total else 'FAILED'
    live='PASSED' if args.require_windows_mattermost_live and state=='PASSED' else 'PENDING_ENV' if not args.require_windows_mattermost_live else 'FAILED'
    promotion='READY' if live=='PASSED' else 'WINDOWS_MATTERMOST_REAL_LIVE_PENDING' if live=='PENDING_ENV' else 'BLOCKED'
    architecture=counts.get('architecture',(0,0,0))
    marker=(f'{STEP} checks={passed}/{total} state={state} version={VERSION} schema={SCHEMA} accepted_product_baseline={BASELINE} accepted_checks={BASELINE_CHECKS} mattermost=REAL_REST_WEBSOCKET routing=DM_MENTION_THREAD ingress=PERSIST_BEFORE_ACK execution=ADOPTED_RUN_SCHEDULED delivery=TERMINAL_RUN_TO_RECEIPT ambiguity=MAYBE_ACCEPTED_NO_REPLAY doctor=REST_AND_WEBSOCKET_AUTH_PROBE restart=REMOTE_REPLY_DUPLICATE_FREE extension=DYNAMIC_IMPORT_SECRETREF protocol=REDACTED_STATUS_DOCTOR model=SCRIPTED_LOCAL focused_mattermost={counts.get("focused-step022c-mattermost",0)} retained_product={counts.get("retained-step022b-step022a-step021br2",0)} affected_regression={counts.get("affected-config-protocol-host",0)} governance={counts.get("focused-validation-governance",0)} canonical_files={counts.get("canonical-files",0)} canonical_tests={counts.get("canonical-suite",0)} architecture={architecture[0]}_packages/{architecture[1]}_edges/{architecture[2]}_sources windows_mattermost_live={live} live_harness={LIVE_HARNESS} promotion={promotion} automated_run_seconds={seconds:.3f}')
    lines=[marker]+[f'OPENRILL_STEP022C_FAILURE check={name}\n{detail}' for name,ok,detail in checks if not ok]
    write_acceptance_report(REPORT,'\n'.join(lines)+'\n'); print(marker); [print(line) for line in lines[1:]]
    return 0 if state=='PASSED' else 1
if __name__=='__main__': raise SystemExit(main())
