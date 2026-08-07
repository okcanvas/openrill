from __future__ import annotations
import argparse, json, os, re, shutil
from pathlib import Path
from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage
ROOT=Path(__file__).resolve().parents[1]
STEP="STEP020E_DURABLE_TASK_COMPLETION_DELIVERY_CONTROLLER_WAKE_AND_REQUIRED_COMPLETION_SEMANTICS"; VERSION="0.20.5-step020e"; SCHEMA=22
LIVE_HARNESS="STEP020E_H1_DURABLE_COMPLETION_DELIVERY_CONTROLLER_WAKE_RESTART_AND_SEMANTICS"
BASELINE="STEP020D_TASK_AND_TASK_FLOW_RECONCILIATION_LOST_AND_RETENTION_FOUNDATION"; BASELINE_CHECKS="53/53"; BASELINE_SHA="5a3b83b35e52176fad6b5525991e2da7eaf1ab16aac25c566d4a63027518b450"
REPORT=resolve_acceptance_report(ROOT,".artifacts/acceptance/STEP020E_ACCEPTANCE_REPORT.txt"); LOGDIR=REPORT.parent/"STEP020E_STAGES"
PRODUCT=[
 "tests/unit/task-completion-delivery-step020e.test.mjs",
 "tests/unit/task-completion-host-step020e.test.mjs",
 "tests/unit/task-completion-migration-step020e.test.mjs",
]
AFFECTED=[
 "tests/unit/task-maintenance-step020d.test.mjs",
 "tests/unit/task-flow-maintenance-step020d.test.mjs",
 "tests/unit/maintenance-protocol-step020d.test.mjs",
 "tests/unit/maintenance-host-step020d.test.mjs",
 "tests/unit/task-flow-controller-runtime-step020c.test.mjs",
 "tests/unit/task-flow-controller-protocol-step020c.test.mjs",
 "tests/unit/task-flow-controller-host-step020c.test.mjs",
 "tests/unit/task-flow-owner-scope-step020br1.test.mjs",
 "tests/unit/task-flow-registry-step020b.test.mjs",
 "tests/unit/task-flow-protocol-step020b.test.mjs",
 "tests/unit/task-flow-host-step020b.test.mjs",
 "tests/unit/background-task-ledger-step020a.test.mjs",
 "tests/unit/background-task-protocol-step020a.test.mjs",
 "tests/unit/background-task-automation-step020a.test.mjs",
 "tests/unit/background-task-host-step020a.test.mjs",
 "tests/unit/goal-plan-step019a.test.mjs",
 "tests/unit/goal-host-step019a.test.mjs",
 "tests/unit/detached-run-resume-step019b.test.mjs",
 "tests/unit/detached-host-resume-step019b.test.mjs",
 "tests/unit/delegation-execution-step014b.test.mjs",
 "tests/unit/delegation-nested-recovery-step014c.test.mjs",
 "tests/unit/automation-protocol-step012c.test.mjs",
 "tests/unit/conversation-step006.test.mjs",
 "tests/unit/state-step005.test.mjs",
 "tests/unit/local-protocol-step004.test.mjs",
]
GOVERNANCE=[
 "tests/unit/validation-governance-step015a.test.mjs","tests/unit/validation-governance-step015b.test.mjs",
 "tests/unit/validation-governance-step016a.test.mjs","tests/unit/validation-governance-step016b.test.mjs","tests/unit/validation-governance-step016c.test.mjs",
 "tests/unit/validation-governance-step018a.test.mjs","tests/unit/validation-governance-step018b.test.mjs","tests/unit/validation-governance-step018c.test.mjs",
 "tests/unit/validation-governance-step019a.test.mjs","tests/unit/validation-governance-step019a-h1.test.mjs","tests/unit/validation-governance-step019b.test.mjs",
 "tests/unit/validation-governance-step020a.test.mjs","tests/unit/validation-governance-step020b.test.mjs","tests/unit/validation-governance-step020br1.test.mjs","tests/unit/validation-governance-step020c.test.mjs","tests/unit/validation-governance-step020d.test.mjs","tests/unit/validation-governance-step020e.test.mjs",
]
STAGES=[
 ("source-version-alignment",["python","scripts/verify_source_version_alignment.py"],60),
 ("workspace-lock-alignment",["python","scripts/verify_workspace_lock_alignment.py"],60),
 ("workspace-module-links",["python","scripts/verify_workspace_module_links.py"],60),
 ("source-root-boundary",["python","scripts/check_source_root_boundary.py"],60),
 ("package-manifest-initial",["python","scripts/verify_package_manifest.py"],120),
 ("workspace-build",["node","scripts/workspace-runner.mjs","build"],300),
 ("focused-step020e-product",["node","--test","--test-concurrency=1","--test-reporter=tap",*PRODUCT],500),
 ("affected-completion-regression",["node","--test","--test-concurrency=1","--test-reporter=tap",*AFFECTED],900),
 ("focused-validation-governance",["node","--test","--test-concurrency=1","--test-reporter=tap",*GOVERNANCE],1000),
 ("canonical-suite",["node","scripts/run-canonical-unit-batches.mjs"],1600),
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
    counts=(value("tests"),value("pass"),value("fail"),value("skipped")); return counts[0]>=0 and counts[0]==counts[1] and counts[2:]==(0,0),counts[0]
def run(name,command,timeout):
    env=os.environ.copy(); env.update({"PYTHONUTF8":"1","PYTHONIOENCODING":"utf-8","NO_COLOR":"1","NODE_DISABLE_COLORS":"1"})
    result=run_stage(name=name,command=command,cwd=ROOT,env=env,timeout_seconds=timeout); LOGDIR.mkdir(parents=True,exist_ok=True); path=LOGDIR/f"{name}.log"; path.write_text(result.output,encoding="utf-8"); print(f"OPENRILL_ACCEPTANCE_STAGE_LOG name={name} path={path.relative_to(ROOT).as_posix()} bytes={path.stat().st_size}",flush=True); return result
def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--require-windows-completion-live",action="store_true"); args=parser.parse_args()
    print("OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal",flush=True); clean(); print("OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal",flush=True)
    checks=[]; seconds=0.0; counts={}; check=lambda name,outcome,detail="":checks.append((name,bool(outcome),detail))
    package=json.loads((ROOT/"package.json").read_text()); scripts=package["scripts"]
    check("root-version",package.get("version")==VERSION,str(package.get("version"))); check("root-description","STEP020E" in package.get("description",""));
    check("acceptance-script",scripts.get("acceptance:step020e")=="python scripts/run_step020e_acceptance.py"); check("live-script",scripts.get("acceptance:step020e:live")=="python scripts/run_step020e_acceptance.py --require-windows-completion-live"); check("completion-live-script",scripts.get("completion-live:step020e")=="node scripts/run-step020e-completion-live.mjs")
    baseline=json.loads((ROOT/"config/current-accepted-baseline.json").read_text()); check("baseline-step",baseline.get("step")==BASELINE); check("baseline-checks",baseline.get("checks")==BASELINE_CHECKS); check("baseline-sha",baseline.get("zipSha256")==BASELINE_SHA)
    required=[
      "packages/state/migrations/022_durable_task_completion_delivery_and_controller_wake.sql","packages/state/src/task-completion.ts","packages/state/src/task-delivery-repository.ts","packages/state/src/task-repository.ts",
      "packages/task-flows/src/completion-delivery.ts","services/agent-host/src/task-flow-controller-tools.ts","services/agent-host/src/lifecycle.ts","packages/agent-kernel/src/kernel.ts",
      *PRODUCT,"tests/unit/validation-governance-step020e.test.mjs","docs/research/STEP020E_OPENCLAW_COMPLETION_DELIVERY_AND_CONTROLLER_WAKE_AUDIT.md","docs/plans/STEP020E_DURABLE_TASK_COMPLETION_DELIVERY_CONTROLLER_WAKE_AND_REQUIRED_COMPLETION_SEMANTICS.md",
      "reference/validation/STEP020D_WINDOWS_MAINTENANCE_LIVE_ACCEPTANCE.md","reference/validation/STEP020E_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md",*[f"reference/validation/STEP020E_OR_ISSUE_{number}.md" for number in range(259,269)],
      "scripts/run-step020e-completion-live.mjs","scripts/package_step020e.py",
    ]
    for path in required: check("required:"+path,(ROOT/path).is_file())
    for name,command,timeout in STAGES:
        result=run(name,command,timeout); seconds+=result.elapsed_seconds; ok=result.ok
        if name.startswith("focused-") or name.startswith("affected-"): ok,total=tap(result.output); counts[name]=total
        if name=="canonical-suite":
            match=re.search(r"OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0",result.output); ok=bool(match); counts[name]=int(match.group(3)) if match else 0; counts["canonical-files"]=int(match.group(1)) if match else 0
        check(name,ok,result.output[-3000:])
    if args.require_windows_completion_live:
        result=run("windows-completion-live",["node","scripts/run-step020e-completion-live.mjs"],700); seconds+=result.elapsed_seconds
        marker=f"{STEP} checks=18/18 state=PASSED version={VERSION} schema={SCHEMA} delivery=DURABLE_TASK_EVENT semantics=REQUIRED_COMPLETION controller=OWNER_CONVERSATION_WAKE queue=SYSTEM_MESSAGE_WAKE_RUN restart=PENDING_DRAIN_IDENTITY_STABLE scope=CONTROLLER_TOOLS_DURABLE decision=EXPLICIT_TOOL_REQUIRED migration=TERMINAL_CHILD_SAFE_BACKFILL flow=CONTROLLER_OWNED_OUTCOME plan_executor=DEFERRED provider=SCRIPTED_LOCAL live_harness={LIVE_HARNESS}"
        check("windows-completion-live",result.ok and marker in result.output,result.output[-5000:])
    passed=sum(1 for _,ok,_ in checks if ok); total=len(checks); state="PASSED" if passed==total else "FAILED"; live="PASSED" if args.require_windows_completion_live and state=="PASSED" else "PENDING_ENV" if not args.require_windows_completion_live else "FAILED"; promotion="READY" if live=="PASSED" else "WINDOWS_COMPLETION_LIVE_PENDING" if live=="PENDING_ENV" else "BLOCKED"
    marker=(f"{STEP} checks={passed}/{total} state={state} version={VERSION} schema={SCHEMA} accepted_product_baseline={BASELINE} accepted_checks={BASELINE_CHECKS} delivery=DURABLE_TASK_EVENT semantics=REQUIRED_COMPLETION controller=OWNER_CONVERSATION_WAKE queue=SYSTEM_MESSAGE_WAKE_RUN restart=PENDING_DRAIN_IDENTITY_STABLE scope=CONTROLLER_TOOLS_DURABLE decision=EXPLICIT_TOOL_REQUIRED migration=TERMINAL_CHILD_SAFE_BACKFILL flow=CONTROLLER_OWNED_OUTCOME plan_executor=DEFERRED openclaw_reference=COMPLETION_DELIVERY_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product={counts.get('focused-step020e-product',0)} affected_regression={counts.get('affected-completion-regression',0)} governance={counts.get('focused-validation-governance',0)} canonical_files={counts.get('canonical-files',0)} canonical_tests={counts.get('canonical-suite',0)} windows_completion_live={live} live_harness={LIVE_HARNESS} promotion={promotion} automated_run_seconds={seconds:.3f}")
    lines=[marker]+[f"OPENRILL_STEP020E_FAILURE check={name}\n{detail}" for name,ok,detail in checks if not ok]; write_acceptance_report(REPORT,"\n".join(lines)+"\n"); print(marker); [print(line) for line in lines[1:]]; return 0 if state=="PASSED" else 1
if __name__=="__main__": raise SystemExit(main())
