from __future__ import annotations
import argparse,json,os,re,shutil
from pathlib import Path
from acceptance_reports import resolve_acceptance_report,write_acceptance_report
from acceptance_stage_runner import run_stage
from step021a_live_marker import load_contract,validate_live_output
ROOT=Path(__file__).resolve().parents[1]
STEP='STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION';VERSION='0.21.0-step021a';SCHEMA=23
CONTRACT=load_contract();LIVE_HARNESS=CONTRACT['liveHarness']
BASELINE='STEP020ER3_WINDOWS_PYTHON_LIVE_MARKER_VALIDATOR_ENTRYPOINT_CLOSURE';BASELINE_CHECKS='66/66';BASELINE_SHA='7586fad590f11e6f7595582ed58eab2383e8f15f2884fb5d9b8113abaef64dd4'
REPORT=resolve_acceptance_report(ROOT,'.artifacts/acceptance/STEP021A_ACCEPTANCE_REPORT.txt');LOGDIR=REPORT.parent/'STEP021A_STAGES'
PRODUCT=['tests/unit/goal-plan-executor-step021a.test.mjs','tests/unit/goal-plan-executor-protocol-step021a.test.mjs','tests/unit/goal-plan-executor-host-step021a.test.mjs']
AFFECTED=[
 'tests/unit/python-live-marker-validator-entrypoint-step020er3.test.mjs','tests/unit/local-cli-protocol-retry-step020er1.test.mjs',
 'tests/unit/task-completion-delivery-step020e.test.mjs','tests/unit/task-completion-host-step020e.test.mjs','tests/unit/task-completion-migration-step020e.test.mjs',
 'tests/unit/task-maintenance-step020d.test.mjs','tests/unit/task-flow-maintenance-step020d.test.mjs','tests/unit/maintenance-protocol-step020d.test.mjs','tests/unit/maintenance-host-step020d.test.mjs',
 'tests/unit/task-flow-controller-runtime-step020c.test.mjs','tests/unit/task-flow-controller-protocol-step020c.test.mjs','tests/unit/task-flow-controller-host-step020c.test.mjs',
 'tests/unit/task-flow-owner-scope-step020br1.test.mjs','tests/unit/task-flow-registry-step020b.test.mjs','tests/unit/task-flow-protocol-step020b.test.mjs','tests/unit/task-flow-host-step020b.test.mjs',
 'tests/unit/background-task-ledger-step020a.test.mjs','tests/unit/background-task-protocol-step020a.test.mjs','tests/unit/background-task-automation-step020a.test.mjs','tests/unit/background-task-host-step020a.test.mjs',
 'tests/unit/goal-plan-step019a.test.mjs','tests/unit/goal-host-step019a.test.mjs','tests/unit/detached-run-resume-step019b.test.mjs','tests/unit/detached-host-resume-step019b.test.mjs',
 'tests/unit/delegation-execution-step014b.test.mjs','tests/unit/delegation-nested-recovery-step014c.test.mjs','tests/unit/automation-protocol-step012c.test.mjs','tests/unit/conversation-step006.test.mjs','tests/unit/state-step005.test.mjs','tests/unit/local-protocol-step004.test.mjs']
GOVERNANCE=[
 'tests/unit/validation-governance-step015a.test.mjs','tests/unit/validation-governance-step015b.test.mjs','tests/unit/validation-governance-step016a.test.mjs','tests/unit/validation-governance-step016b.test.mjs','tests/unit/validation-governance-step016c.test.mjs',
 'tests/unit/validation-governance-step018a.test.mjs','tests/unit/validation-governance-step018b.test.mjs','tests/unit/validation-governance-step018c.test.mjs',
 'tests/unit/validation-governance-step019a.test.mjs','tests/unit/validation-governance-step019a-h1.test.mjs','tests/unit/validation-governance-step019b.test.mjs',
 'tests/unit/validation-governance-step020a.test.mjs','tests/unit/validation-governance-step020b.test.mjs','tests/unit/validation-governance-step020br1.test.mjs','tests/unit/validation-governance-step020c.test.mjs','tests/unit/validation-governance-step020d.test.mjs','tests/unit/validation-governance-step020e.test.mjs','tests/unit/validation-governance-step020er1.test.mjs','tests/unit/validation-governance-step020er2.test.mjs','tests/unit/validation-governance-step020er3.test.mjs','tests/unit/validation-governance-step021a.test.mjs']
STAGES=[
 ('source-version-alignment',['python','scripts/verify_source_version_alignment.py'],60),('workspace-lock-alignment',['python','scripts/verify_workspace_lock_alignment.py'],60),('workspace-module-links',['python','scripts/verify_workspace_module_links.py'],60),('source-root-boundary',['python','scripts/check_source_root_boundary.py'],60),('package-manifest-initial',['python','scripts/verify_package_manifest.py'],120),
 ('workspace-build',['node','scripts/workspace-runner.mjs','build'],300),('focused-step021a-product',['node','--test','--test-concurrency=1','--test-reporter=tap',*PRODUCT],600),('affected-goal-plan-regression',['node','--test','--test-concurrency=1','--test-reporter=tap',*AFFECTED],1000),('focused-validation-governance',['node','--test','--test-concurrency=1','--test-reporter=tap',*GOVERNANCE],1100),('canonical-suite',['node','scripts/run-canonical-unit-batches.mjs'],1700),('architecture',['python','scripts/check_architecture.py'],120),('exports',['node','scripts/check-exports.mjs'],180),('package-manifest-final',['python','scripts/verify_package_manifest.py'],120)]
def clean():
 for group in ('apps','services','packages','connectors','skills'):
  parent=ROOT/group
  if parent.exists():
   for d in parent.iterdir():
    if d.is_dir():shutil.rmtree(d/'dist',ignore_errors=True)
 shutil.rmtree(ROOT/'.artifacts',ignore_errors=True)
def tap(output):
 def value(name):
  matches=list(re.finditer(rf'^# {name} (\d+)$',output,re.M));return int(matches[-1].group(1)) if matches else -1
 counts=(value('tests'),value('pass'),value('fail'),value('skipped'));return counts[0]>=0 and counts[0]==counts[1] and counts[2:]==(0,0),counts[0]
def run(name,command,timeout):
 env=os.environ.copy();env.update({'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8','NO_COLOR':'1','NODE_DISABLE_COLORS':'1'});result=run_stage(name=name,command=command,cwd=ROOT,env=env,timeout_seconds=timeout);LOGDIR.mkdir(parents=True,exist_ok=True);path=LOGDIR/f'{name}.log';path.write_text(result.output,encoding='utf-8');print(f'OPENRILL_ACCEPTANCE_STAGE_LOG name={name} path={path.relative_to(ROOT).as_posix()} bytes={path.stat().st_size}',flush=True);return result
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--require-windows-goal-plan-executor-live',action='store_true');args=parser.parse_args();print('OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal',flush=True);clean();print('OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal',flush=True)
 checks=[];seconds=0.0;counts={};check=lambda n,o,d='':checks.append((n,bool(o),d));pkg=json.loads((ROOT/'package.json').read_text());scripts=pkg['scripts'];baseline=json.loads((ROOT/'config/current-accepted-baseline.json').read_text())
 check('root-version',pkg.get('version')==VERSION,str(pkg.get('version')));check('root-description','STEP021A' in pkg.get('description',''));check('acceptance-script',scripts.get('acceptance:step021a')=='python scripts/run_step021a_acceptance.py');check('live-script',scripts.get('acceptance:step021a:live')=='python scripts/run_step021a_acceptance.py --require-windows-goal-plan-executor-live');check('goal-live-script',scripts.get('goal-plan-executor-live:step021a')=='node scripts/run-step021a-goal-plan-executor-live.mjs')
 check('baseline-step',baseline.get('step')==BASELINE);check('baseline-checks',baseline.get('checks')==BASELINE_CHECKS);check('baseline-sha',baseline.get('zipSha256')==BASELINE_SHA);check('contract-step',CONTRACT.get('step')==STEP);check('contract-version',CONTRACT.get('version')==VERSION);check('contract-schema',CONTRACT.get('schema')==SCHEMA);check('contract-checks',CONTRACT.get('expectedChecks')=='22/22')
 required=['packages/state/migrations/023_goal_plan_task_flow_executor.sql','packages/goal-executor/src/service.ts','packages/protocol/src/goal-execution-operations.ts','tests/unit/goal-plan-executor-step021a.test.mjs','tests/unit/goal-plan-executor-protocol-step021a.test.mjs','tests/unit/goal-plan-executor-host-step021a.test.mjs','tests/unit/validation-governance-step021a.test.mjs','scripts/run_step021a_acceptance.py','scripts/run-step021a-goal-plan-executor-live.mjs','scripts/package_step021a.py','config/step021a-live-marker-contract.json','reference/validation/STEP021A_OPENCLAW_SOURCE_AUDIT.md','reference/validation/STEP021A_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md','reference/validation/STEP020ER3_WINDOWS_PYTHON_VALIDATOR_LIVE_ACCEPTANCE.md','docs/plans/STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION.md',*[f'reference/validation/STEP021A_OR_ISSUE_{i}.md' for i in range(274,291)]]
 for path in required:check('required:'+path,(ROOT/path).is_file())
 for name,command,timeout in STAGES:
  result=run(name,command,timeout);seconds+=result.elapsed_seconds;ok=result.ok
  if name.startswith('focused-') or name.startswith('affected-'):ok,total=tap(result.output);counts[name]=total
  if name=='canonical-suite':
   match=re.search(r'OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0',result.output);ok=bool(match);counts[name]=int(match.group(3)) if match else 0;counts['canonical-files']=int(match.group(1)) if match else 0
  check(name,ok,result.output[-3000:])
 if args.require_windows_goal_plan_executor_live:
  result=run('windows-goal-plan-executor-live',['node','scripts/run-step021a-goal-plan-executor-live.mjs'],900);seconds+=result.elapsed_seconds;marker_ok,detail=validate_live_output(result.output,CONTRACT);check('windows-goal-plan-executor-live',result.ok and marker_ok,f'result_ok={result.ok} {detail}\n{result.output[-5000:]}')
 passed=sum(1 for _,ok,_ in checks if ok);total=len(checks);state='PASSED' if passed==total else 'FAILED';live='PASSED' if args.require_windows_goal_plan_executor_live and state=='PASSED' else 'PENDING_ENV' if not args.require_windows_goal_plan_executor_live else 'FAILED';promotion='READY' if live=='PASSED' else 'WINDOWS_GOAL_PLAN_EXECUTOR_LIVE_PENDING' if live=='PENDING_ENV' else 'BLOCKED'
 marker=(f'{STEP} checks={passed}/{total} state={state} version={VERSION} schema={SCHEMA} accepted_product_baseline={BASELINE} accepted_checks={BASELINE_CHECKS} executor=SINGLE_ACTIVE_STEP ownership=GOAL_PLAN_EXECUTION flow=ONE_GOAL_ONE_CONTROLLER_FLOW admission=ATOMIC_STEP_RUN_TASK_FLOW continuation=DELIVERY_CONTROLLER_DECISION completion=SEMANTIC_REQUIRED restart=IDENTITY_STABLE_NO_DUPLICATE blocked=EXPLICIT_RESUME_NEW_ATTEMPT mutation=EXECUTOR_OWNED cancellation=RECOVERY_PROJECTED parallel=DEFERRED openclaw_reference=BOUND_CONTROLLER_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product={counts.get("focused-step021a-product",0)} affected_regression={counts.get("affected-goal-plan-regression",0)} governance={counts.get("focused-validation-governance",0)} canonical_files={counts.get("canonical-files",0)} canonical_tests={counts.get("canonical-suite",0)} windows_goal_plan_executor_live={live} live_harness={LIVE_HARNESS} promotion={promotion} automated_run_seconds={seconds:.3f}')
 lines=[marker]+[f'OPENRILL_STEP021A_FAILURE check={name}\n{detail}' for name,ok,detail in checks if not ok];write_acceptance_report(REPORT,'\n'.join(lines)+'\n');print(marker);[print(x) for x in lines[1:]];return 0 if state=='PASSED' else 1
if __name__=='__main__':raise SystemExit(main())
