from __future__ import annotations
import argparse, json, os, re, shutil
from pathlib import Path
from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage

ROOT=Path(__file__).resolve().parents[1]
STEP="STEP020B_DURABLE_TASK_FLOW_REGISTRY_AND_CONTROLLER_LIFECYCLE_FOUNDATION"; VERSION="0.20.1-step020b"; SCHEMA=19
LIVE_HARNESS="STEP020B_H1_TASK_FLOW_PROTOCOL_RESTART_REVISION_AND_CANCELLATION"
BASELINE="STEP020A_DURABLE_BACKGROUND_TASK_LEDGER_AND_RUNTIME_LIFECYCLE_FOUNDATION"; BASELINE_CHECKS="40/40"; BASELINE_SHA="67ac1fa4a5067ff3070f0a990bfdfd262a6d956961ebd221432cdacf567c9a7f"
REPORT=resolve_acceptance_report(ROOT,".artifacts/acceptance/STEP020B_ACCEPTANCE_REPORT.txt"); LOGDIR=REPORT.parent/"STEP020B_STAGES"
PRODUCT=[
 "tests/unit/task-flow-registry-step020b.test.mjs",
 "tests/unit/task-flow-protocol-step020b.test.mjs",
 "tests/unit/task-flow-host-step020b.test.mjs",
]
AFFECTED=[
 "tests/unit/background-task-ledger-step020a.test.mjs","tests/unit/background-task-protocol-step020a.test.mjs",
 "tests/unit/background-task-automation-step020a.test.mjs","tests/unit/background-task-host-step020a.test.mjs",
 "tests/unit/goal-plan-step019a.test.mjs","tests/unit/goal-host-step019a.test.mjs",
 "tests/unit/detached-run-resume-step019b.test.mjs","tests/unit/detached-host-resume-step019b.test.mjs",
 "tests/unit/delegation-execution-step014b.test.mjs","tests/unit/delegation-nested-recovery-step014c.test.mjs",
 "tests/unit/automation-protocol-step012c.test.mjs","tests/unit/conversation-step006.test.mjs",
 "tests/unit/state-step005.test.mjs","tests/unit/local-protocol-step004.test.mjs",
]
GOVERNANCE=[
 "tests/unit/validation-governance-step015a.test.mjs","tests/unit/validation-governance-step015b.test.mjs",
 "tests/unit/validation-governance-step016a.test.mjs","tests/unit/validation-governance-step016b.test.mjs",
 "tests/unit/validation-governance-step016c.test.mjs","tests/unit/validation-governance-step018a.test.mjs",
 "tests/unit/validation-governance-step018b.test.mjs","tests/unit/validation-governance-step018c.test.mjs",
 "tests/unit/validation-governance-step019a.test.mjs","tests/unit/validation-governance-step019a-h1.test.mjs",
 "tests/unit/validation-governance-step019b.test.mjs","tests/unit/validation-governance-step020a.test.mjs",
 "tests/unit/validation-governance-step020b.test.mjs",
]
STAGES=[
 ("source-version-alignment",["python","scripts/verify_source_version_alignment.py"],60),
 ("workspace-lock-alignment",["python","scripts/verify_workspace_lock_alignment.py"],60),
 ("workspace-module-links",["python","scripts/verify_workspace_module_links.py"],60),
 ("source-root-boundary",["python","scripts/check_source_root_boundary.py"],60),
 ("package-manifest-initial",["python","scripts/verify_package_manifest.py"],120),
 ("workspace-build",["node","scripts/workspace-runner.mjs","build"],300),
 ("focused-step020b-product",["node","--test","--test-concurrency=1","--test-reporter=tap",*PRODUCT],360),
 ("affected-task-flow-runtime-regression",["node","--test","--test-concurrency=1","--test-reporter=tap",*AFFECTED],700),
 ("focused-validation-governance",["node","--test","--test-concurrency=1","--test-reporter=tap",*GOVERNANCE],700),
 ("canonical-suite",["node","scripts/run-canonical-unit-batches.mjs"],1100),
 ("architecture",["python","scripts/check_architecture.py"],120),
 ("exports",["node","scripts/check-exports.mjs"],180),
 ("package-manifest-final",["python","scripts/verify_package_manifest.py"],120),
]
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
    counts=(value("tests"),value("pass"),value("fail"),value("skipped"))
    return counts[0]>=0 and counts[0]==counts[1] and counts[2:]==(0,0),counts[0]
def run(name,command,timeout):
    env=os.environ.copy(); env.update({"PYTHONUTF8":"1","PYTHONIOENCODING":"utf-8","NO_COLOR":"1","NODE_DISABLE_COLORS":"1"})
    result=run_stage(name=name,command=command,cwd=ROOT,env=env,timeout_seconds=timeout)
    LOGDIR.mkdir(parents=True,exist_ok=True); path=LOGDIR/f"{name}.log"; path.write_text(result.output,encoding="utf-8")
    print(f"OPENRILL_ACCEPTANCE_STAGE_LOG name={name} path={path.relative_to(ROOT).as_posix()} bytes={path.stat().st_size}",flush=True)
    return result
def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--require-windows-task-flow-live",action="store_true"); args=parser.parse_args()
    print("OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal",flush=True); clean(); print("OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal",flush=True)
    checks=[]; seconds=0.0; counts={}
    def check(name,outcome,detail=""): checks.append((name,bool(outcome),detail))
    package=json.loads((ROOT/"package.json").read_text()); scripts=package["scripts"]
    check("root-version",package.get("version")==VERSION,str(package.get("version"))); check("root-description","STEP020B" in package.get("description",""))
    check("acceptance-script",scripts.get("acceptance:step020b")=="python scripts/run_step020b_acceptance.py")
    check("live-script",scripts.get("acceptance:step020b:live")=="python scripts/run_step020b_acceptance.py --require-windows-task-flow-live")
    check("task-flow-live-script",scripts.get("task-flow-live:step020b")=="node scripts/run-step020b-task-flow-live.mjs")
    baseline=json.loads((ROOT/"config/current-accepted-baseline.json").read_text())
    check("baseline-step",baseline.get("step")==BASELINE); check("baseline-checks",baseline.get("checks")==BASELINE_CHECKS); check("baseline-sha",baseline.get("zipSha256")==BASELINE_SHA)
    required=[
      "packages/state/migrations/019_durable_task_flow_registry.sql","packages/state/src/task-flow-repository.ts",
      "packages/task-flows/src/service.ts","packages/protocol/src/task-flow-operations.ts",
      "services/agent-host/src/lifecycle.ts",*PRODUCT,"tests/unit/validation-governance-step020b.test.mjs",
      "docs/research/STEP020B_OPENCLAW_TASK_FLOW_REFERENCE_AUDIT.md",
      "docs/plans/STEP020B_DURABLE_TASK_FLOW_REGISTRY_AND_CONTROLLER_LIFECYCLE_FOUNDATION.md",
      "reference/validation/STEP020A_WINDOWS_TASK_LIVE_ACCEPTANCE.md","reference/validation/STEP020B_OR_ISSUE_237.md",
      "reference/validation/STEP020B_OR_ISSUE_238.md",
      "reference/validation/STEP020B_OR_ISSUE_239.md",
    ]
    for path in required: check("required:"+path,(ROOT/path).is_file())
    for name,command,timeout in STAGES:
        result=run(name,command,timeout); seconds+=result.elapsed_seconds; ok=result.ok
        if name.startswith("focused-") or name.startswith("affected-"): ok,total=tap(result.output); counts[name]=total
        if name=="canonical-suite":
            match=re.search(r"OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0",result.output)
            ok=bool(match); counts[name]=int(match.group(3)) if match else 0; counts["canonical-files"]=int(match.group(1)) if match else 0
        check(name,ok,result.output[-2600:])
    if args.require_windows_task_flow_live:
        result=run("windows-task-flow-live",["node","scripts/run-step020b-task-flow-live.mjs"],480); seconds+=result.elapsed_seconds
        marker=f"{STEP} checks=12/12 state=PASSED version={VERSION} schema={SCHEMA} task_flow=CONTROLLER_OWNED_REGISTRY revision=OPTIMISTIC_CAS restart=FLOW_IDENTITY_STABLE tasks=ONE_FLOW_MANY_TASKS cancellation=CHILD_TASK_CASCADE terminal=MONOTONE executor=DEFERRED provider=SCRIPTED_LOCAL live_harness={LIVE_HARNESS}"
        check("windows-task-flow-live",result.ok and marker in result.output,result.output[-4000:])
    passed=sum(1 for _,ok,_ in checks if ok); total=len(checks); state="PASSED" if passed==total else "FAILED"
    live="PASSED" if args.require_windows_task_flow_live and state=="PASSED" else "PENDING_ENV" if not args.require_windows_task_flow_live else "FAILED"
    promotion="READY" if live=="PASSED" else "WINDOWS_TASK_FLOW_LIVE_PENDING" if live=="PENDING_ENV" else "BLOCKED"
    marker=(f"{STEP} checks={passed}/{total} state={state} version={VERSION} schema={SCHEMA} accepted_product_baseline={BASELINE} accepted_checks={BASELINE_CHECKS} task_flow=CONTROLLER_OWNED_REGISTRY revision=OPTIMISTIC_CAS wait=WAITING_BLOCKED_RESUME tasks=ONE_FLOW_MANY_TASKS restart=FLOW_IDENTITY_STABLE cancellation=CHILD_TASK_CASCADE terminal=MONOTONE executor=DEFERRED openclaw_reference=TASK_FLOW_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product={counts.get('focused-step020b-product',0)} affected_regression={counts.get('affected-task-flow-runtime-regression',0)} governance={counts.get('focused-validation-governance',0)} canonical_files={counts.get('canonical-files',0)} canonical_tests={counts.get('canonical-suite',0)} windows_task_flow_live={live} live_harness={LIVE_HARNESS} promotion={promotion} automated_run_seconds={seconds:.3f}")
    lines=[marker]+[f"OPENRILL_STEP020B_FAILURE check={name}\n{detail}" for name,ok,detail in checks if not ok]
    write_acceptance_report(REPORT,"\n".join(lines)+"\n"); print(marker)
    for line in lines[1:]: print(line)
    return 0 if state=="PASSED" else 1
if __name__=="__main__": raise SystemExit(main())
