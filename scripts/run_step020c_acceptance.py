from __future__ import annotations
import argparse, json, os, re, shutil
from pathlib import Path
from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage
ROOT=Path(__file__).resolve().parents[1]
STEP="STEP020C_BOUND_TASK_FLOW_CONTROLLER_RUNTIME_AND_ATOMIC_CHILD_TASK_ADMISSION"; VERSION="0.20.3-step020c"; SCHEMA=20
LIVE_HARNESS="STEP020C_H1_BOUND_CONTROLLER_ATOMIC_CHILD_ADMISSION_RESTART_AND_CANCELLATION"
BASELINE="STEP020BR1_TASK_FLOW_OWNER_SCOPE_AND_CANCEL_ADMISSION_CLOSURE"; BASELINE_CHECKS="35/35"; BASELINE_SHA="5ed9f739ce3244c4f3c0ff583fdc05dcecdf11d0dfe1d9db69c77de4b28fa747"
REPORT=resolve_acceptance_report(ROOT,".artifacts/acceptance/STEP020C_ACCEPTANCE_REPORT.txt"); LOGDIR=REPORT.parent/"STEP020C_STAGES"
PRODUCT=[
 "tests/unit/task-flow-controller-runtime-step020c.test.mjs",
 "tests/unit/task-flow-controller-protocol-step020c.test.mjs",
 "tests/unit/task-flow-controller-host-step020c.test.mjs",
 "tests/unit/task-flow-owner-scope-step020br1.test.mjs",
 "tests/unit/task-flow-registry-step020b.test.mjs",
 "tests/unit/task-flow-protocol-step020b.test.mjs",
 "tests/unit/task-flow-host-step020b.test.mjs",
]
AFFECTED=["tests/unit/background-task-ledger-step020a.test.mjs","tests/unit/background-task-protocol-step020a.test.mjs","tests/unit/background-task-automation-step020a.test.mjs","tests/unit/background-task-host-step020a.test.mjs","tests/unit/goal-plan-step019a.test.mjs","tests/unit/goal-host-step019a.test.mjs","tests/unit/detached-run-resume-step019b.test.mjs","tests/unit/detached-host-resume-step019b.test.mjs","tests/unit/delegation-execution-step014b.test.mjs","tests/unit/delegation-nested-recovery-step014c.test.mjs","tests/unit/automation-protocol-step012c.test.mjs","tests/unit/conversation-step006.test.mjs","tests/unit/state-step005.test.mjs","tests/unit/local-protocol-step004.test.mjs"]
GOVERNANCE=["tests/unit/validation-governance-step015a.test.mjs","tests/unit/validation-governance-step015b.test.mjs","tests/unit/validation-governance-step016a.test.mjs","tests/unit/validation-governance-step016b.test.mjs","tests/unit/validation-governance-step016c.test.mjs","tests/unit/validation-governance-step018a.test.mjs","tests/unit/validation-governance-step018b.test.mjs","tests/unit/validation-governance-step018c.test.mjs","tests/unit/validation-governance-step019a.test.mjs","tests/unit/validation-governance-step019a-h1.test.mjs","tests/unit/validation-governance-step019b.test.mjs","tests/unit/validation-governance-step020a.test.mjs","tests/unit/validation-governance-step020b.test.mjs","tests/unit/validation-governance-step020br1.test.mjs","tests/unit/validation-governance-step020c.test.mjs"]
STAGES=[("source-version-alignment",["python","scripts/verify_source_version_alignment.py"],60),("workspace-lock-alignment",["python","scripts/verify_workspace_lock_alignment.py"],60),("workspace-module-links",["python","scripts/verify_workspace_module_links.py"],60),("source-root-boundary",["python","scripts/check_source_root_boundary.py"],60),("package-manifest-initial",["python","scripts/verify_package_manifest.py"],120),("workspace-build",["node","scripts/workspace-runner.mjs","build"],300),("focused-step020c-product",["node","--test","--test-concurrency=1","--test-reporter=tap",*PRODUCT],500),("affected-bound-controller-regression",["node","--test","--test-concurrency=1","--test-reporter=tap",*AFFECTED],800),("focused-validation-governance",["node","--test","--test-concurrency=1","--test-reporter=tap",*GOVERNANCE],900),("canonical-suite",["node","scripts/run-canonical-unit-batches.mjs"],1400),("architecture",["python","scripts/check_architecture.py"],120),("exports",["node","scripts/check-exports.mjs"],180),("package-manifest-final",["python","scripts/verify_package_manifest.py"],120)]
def clean():
    for group in ("apps","services","packages","connectors","skills"):
        parent=ROOT/group
        if not parent.exists(): continue
        for directory in parent.iterdir():
            if directory.is_dir(): shutil.rmtree(directory/"dist",ignore_errors=True)
    shutil.rmtree(ROOT/".artifacts",ignore_errors=True)
def tap(output):
    def value(name):
        matches=list(re.finditer(rf"^# {name} (\d+)$",output,re.M)); return int(matches[-1].group(1)) if matches else -1
    counts=(value("tests"),value("pass"),value("fail"),value("skipped")); return counts[0]>=0 and counts[0]==counts[1] and counts[2:]==(0,0),counts[0]
def run(name,command,timeout):
    env=os.environ.copy(); env.update({"PYTHONUTF8":"1","PYTHONIOENCODING":"utf-8","NO_COLOR":"1","NODE_DISABLE_COLORS":"1"})
    result=run_stage(name=name,command=command,cwd=ROOT,env=env,timeout_seconds=timeout); LOGDIR.mkdir(parents=True,exist_ok=True); path=LOGDIR/f"{name}.log"; path.write_text(result.output,encoding="utf-8"); print(f"OPENRILL_ACCEPTANCE_STAGE_LOG name={name} path={path.relative_to(ROOT).as_posix()} bytes={path.stat().st_size}",flush=True); return result
def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--require-windows-bound-controller-live",action="store_true"); args=parser.parse_args()
    print("OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal",flush=True); clean(); print("OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal",flush=True)
    checks=[]; seconds=0.0; counts={}; check=lambda name,outcome,detail="":checks.append((name,bool(outcome),detail))
    package=json.loads((ROOT/"package.json").read_text()); scripts=package["scripts"]
    check("root-version",package.get("version")==VERSION,str(package.get("version"))); check("root-description","STEP020C" in package.get("description","")); check("acceptance-script",scripts.get("acceptance:step020c")=="python scripts/run_step020c_acceptance.py"); check("live-script",scripts.get("acceptance:step020c:live")=="python scripts/run_step020c_acceptance.py --require-windows-bound-controller-live"); check("bound-controller-live-script",scripts.get("bound-controller-live:step020c")=="node scripts/run-step020c-bound-controller-live.mjs")
    baseline=json.loads((ROOT/"config/current-accepted-baseline.json").read_text()); check("baseline-step",baseline.get("step")==BASELINE); check("baseline-checks",baseline.get("checks")==BASELINE_CHECKS); check("baseline-sha",baseline.get("zipSha256")==BASELINE_SHA)
    required=["packages/task-flows/src/controller-runtime.ts","packages/conversations/src/service.ts","packages/protocol/src/task-flow-operations.ts","services/agent-host/src/transport/operation-registry.ts",*PRODUCT,"tests/unit/validation-governance-step020c.test.mjs","docs/research/STEP020C_OPENCLAW_BOUND_CONTROLLER_RUNTIME_AND_TASK_ADMISSION_AUDIT.md","docs/plans/STEP020C_BOUND_TASK_FLOW_CONTROLLER_RUNTIME_AND_ATOMIC_CHILD_TASK_ADMISSION.md","reference/validation/STEP020BR1_WINDOWS_TASK_FLOW_OWNER_LIVE_ACCEPTANCE.md","reference/validation/STEP020C_OR_ISSUE_242.md","reference/validation/STEP020C_OR_ISSUE_243.md","reference/validation/STEP020C_OR_ISSUE_244.md","reference/validation/STEP020C_OR_ISSUE_245.md","reference/validation/STEP020C_OR_ISSUE_246.md","scripts/materialize_resolved_dependencies_for_fresh_verify.py"]
    for path in required: check("required:"+path,(ROOT/path).is_file())
    for name,command,timeout in STAGES:
        result=run(name,command,timeout); seconds+=result.elapsed_seconds; ok=result.ok
        if name.startswith("focused-") or name.startswith("affected-"): ok,total=tap(result.output); counts[name]=total
        if name=="canonical-suite":
            match=re.search(r"OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0",result.output); ok=bool(match); counts[name]=int(match.group(3)) if match else 0; counts["canonical-files"]=int(match.group(1)) if match else 0
        check(name,ok,result.output[-2600:])
    if args.require_windows_bound_controller_live:
        result=run("windows-bound-controller-live",["node","scripts/run-step020c-bound-controller-live.mjs"],600); seconds+=result.elapsed_seconds
        marker=f"{STEP} checks=15/15 state=PASSED version={VERSION} schema={SCHEMA} controller=CONVERSATION_BOUND flow=DETERMINISTIC_MANAGED admission=ATOMIC_RUN_TASK_FLOW execution=HOST_SCHEDULED replay=IDENTITY_STABLE_TERMINAL_NOT_RESCHEDULED restart=RUNTIME_REBOUND cancellation=CHILD_CASCADE executor=EXISTING_RUN_COORDINATOR plan_executor=DEFERRED provider=SCRIPTED_LOCAL live_harness={LIVE_HARNESS}"
        check("windows-bound-controller-live",result.ok and marker in result.output,result.output[-4000:])
    passed=sum(1 for _,ok,_ in checks if ok); total=len(checks); state="PASSED" if passed==total else "FAILED"; live="PASSED" if args.require_windows_bound_controller_live and state=="PASSED" else "PENDING_ENV" if not args.require_windows_bound_controller_live else "FAILED"; promotion="READY" if live=="PASSED" else "WINDOWS_BOUND_CONTROLLER_LIVE_PENDING" if live=="PENDING_ENV" else "BLOCKED"
    marker=(f"{STEP} checks={passed}/{total} state={state} version={VERSION} schema={SCHEMA} accepted_product_baseline={BASELINE} accepted_checks={BASELINE_CHECKS} controller=CONVERSATION_BOUND flow=DETERMINISTIC_MANAGED admission=ATOMIC_RUN_TASK_FLOW execution=EXISTING_RUN_COORDINATOR replay=IDENTITY_STABLE_TERMINAL_NOT_RESCHEDULED restart=RUNTIME_REBOUND cancellation=CHILD_CASCADE plan_executor=DEFERRED openclaw_reference=BOUND_RUNTIME_AND_TASK_EXECUTOR_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product={counts.get('focused-step020c-product',0)} affected_regression={counts.get('affected-bound-controller-regression',0)} governance={counts.get('focused-validation-governance',0)} canonical_files={counts.get('canonical-files',0)} canonical_tests={counts.get('canonical-suite',0)} windows_bound_controller_live={live} live_harness={LIVE_HARNESS} promotion={promotion} automated_run_seconds={seconds:.3f}")
    lines=[marker]+[f"OPENRILL_STEP020C_FAILURE check={name}\n{detail}" for name,ok,detail in checks if not ok]; write_acceptance_report(REPORT,"\n".join(lines)+"\n"); print(marker); [print(line) for line in lines[1:]]; return 0 if state=="PASSED" else 1
if __name__=="__main__": raise SystemExit(main())
