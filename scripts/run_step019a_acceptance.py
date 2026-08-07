from __future__ import annotations
import argparse, json, os, re, shutil
from pathlib import Path
from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage
ROOT=Path(__file__).resolve().parents[1]
STEP="STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE"; VERSION="0.19.0-step019a"; SCHEMA=17
LIVE_HARNESS="STEP019A_H1_STATE_SCHEMA_SOURCE_OF_TRUTH_ALIGNMENT"
BASELINE="STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK"; BASELINE_CHECKS="WINDOWS_AGENT_BENCHMARK_36/36"; BASELINE_SHA="ebc745a8f109cc4dc6cc3d37ea9992adfeb0a7fb3d49920bc22892110a07809d"
REPORT=resolve_acceptance_report(ROOT,".artifacts/acceptance/STEP019A_ACCEPTANCE_REPORT.txt"); LOGDIR=REPORT.parent/"STEP019A_STAGES"
PRODUCT=["tests/unit/goal-plan-step019a.test.mjs","tests/unit/goal-host-step019a.test.mjs"]
AFFECTED=["tests/unit/agent-kernel-step007.test.mjs","tests/unit/conversation-events-step006.test.mjs","tests/unit/memory-agent-recall-step018a.test.mjs","tests/unit/tool-discovery-agent-step018b.test.mjs","tests/unit/agent-task-benchmark-step018c.test.mjs"]
GOVERNANCE=["tests/unit/validation-governance-step015a.test.mjs","tests/unit/validation-governance-step015b.test.mjs","tests/unit/validation-governance-step016a.test.mjs","tests/unit/validation-governance-step016b.test.mjs","tests/unit/validation-governance-step016c.test.mjs","tests/unit/validation-governance-step018a.test.mjs","tests/unit/validation-governance-step018b.test.mjs","tests/unit/validation-governance-step018c.test.mjs","tests/unit/validation-governance-step019a.test.mjs","tests/unit/validation-governance-step019a-h1.test.mjs"]
STAGES=[
 ("source-version-alignment",["python","scripts/verify_source_version_alignment.py"],60),
 ("workspace-lock-alignment",["python","scripts/verify_workspace_lock_alignment.py"],60),
 ("workspace-module-links",["python","scripts/verify_workspace_module_links.py"],60),
 ("source-root-boundary",["python","scripts/check_source_root_boundary.py"],60),
 ("package-manifest-initial",["python","scripts/verify_package_manifest.py"],120),
 ("workspace-build",["node","scripts/workspace-runner.mjs","build"],300),
 ("focused-step019a-product",["node","--test","--test-concurrency=1","--test-reporter=tap",*PRODUCT],300),
 ("affected-goal-agent-regression",["node","--test","--test-concurrency=1","--test-reporter=tap",*AFFECTED],420),
 ("focused-validation-governance",["node","--test","--test-concurrency=1","--test-reporter=tap",*GOVERNANCE],420),
 ("canonical-suite",["node","scripts/run-canonical-unit-batches.mjs"],900),
 ("architecture",["python","scripts/check_architecture.py"],120),
 ("exports",["node","scripts/check-exports.mjs"],180),
 ("package-manifest-final",["python","scripts/verify_package_manifest.py"],120),
]
def clean():
    for group in ("apps","services","packages","connectors","skills"):
        parent=ROOT/group
        if not parent.exists(): continue
        for d in parent.iterdir():
            if d.is_dir(): shutil.rmtree(d/"dist",ignore_errors=True)
    shutil.rmtree(ROOT/".artifacts",ignore_errors=True)
def tap(out):
    def v(n):
        m=list(re.finditer(rf"^# {n} (\d+)$",out,re.M)); return int(m[-1].group(1)) if m else -1
    x=(v("tests"),v("pass"),v("fail"),v("skipped")); return x[0]>=0 and x[0]==x[1] and x[2:]==(0,0),x[0]
def run(name,cmd,timeout):
    env=os.environ.copy(); env.update({"PYTHONUTF8":"1","PYTHONIOENCODING":"utf-8","NO_COLOR":"1","NODE_DISABLE_COLORS":"1"})
    r=run_stage(name=name,command=cmd,cwd=ROOT,env=env,timeout_seconds=timeout)
    LOGDIR.mkdir(parents=True,exist_ok=True); p=LOGDIR/f"{name}.log"; p.write_text(r.output,encoding="utf-8")
    print(f"OPENRILL_ACCEPTANCE_STAGE_LOG name={name} path={p.relative_to(ROOT).as_posix()} bytes={p.stat().st_size}",flush=True); return r
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--require-windows-goal-live",action="store_true"); args=ap.parse_args()
    print("OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal",flush=True); clean(); print("OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal",flush=True)
    checks=[]; seconds=0.0; counts={}
    def check(n,o,d=""): checks.append((n,bool(o),d))
    pkg=json.loads((ROOT/"package.json").read_text()); scripts=pkg["scripts"]
    check("root-version",pkg.get("version")==VERSION,str(pkg.get("version"))); check("root-description","STEP019A" in pkg.get("description",""))
    check("acceptance-script",scripts.get("acceptance:step019a")=="python scripts/run_step019a_acceptance.py")
    check("live-script",scripts.get("acceptance:step019a:live")=="python scripts/run_step019a_acceptance.py --require-windows-goal-live")
    check("goal-live-script",scripts.get("goal-live:step019a")=="node scripts/run-step019a-goal-live.mjs")
    baseline=json.loads((ROOT/"config/current-accepted-baseline.json").read_text())
    check("baseline-step",baseline.get("step")==BASELINE); check("baseline-checks",baseline.get("checks")==BASELINE_CHECKS); check("baseline-sha",baseline.get("zipSha256")==BASELINE_SHA)
    required=["packages/state/migrations/017_durable_goal_plan_state.sql","packages/state/src/goal-repository.ts","packages/goals/src/service.ts","packages/tools-goals/src/index.ts",*PRODUCT,"tests/unit/validation-governance-step019a.test.mjs","docs/research/OPENCLAW_GOAL_TASK_FLOW_CODE_AUDIT.md","docs/plans/STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE.md","reference/validation/STEP018C_WINDOWS_AGENT_BENCHMARK_LIVE_ACCEPTANCE.md","reference/validation/STEP019A_OR_ISSUE_226.md","reference/validation/STEP019A_OR_ISSUE_227.md","reference/validation/STEP019A_OR_ISSUE_229.md","reference/validation/STEP019A_WINDOWS_GOAL_LIVE_ATTEMPT_1.md","reference/validation/STEP019A_H1_HARNESS_ACCEPTANCE.md","tests/unit/validation-governance-step019a-h1.test.mjs"]
    for x in required: check("required:"+x,(ROOT/x).is_file())
    for name,cmd,timeout in STAGES:
        r=run(name,cmd,timeout); seconds+=r.elapsed_seconds; ok=r.ok
        if name.startswith("focused-") or name.startswith("affected-"): ok,n=tap(r.output); counts[name]=n
        if name=="canonical-suite":
            m=re.search(r"OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0",r.output)
            ok=bool(m); counts[name]=int(m.group(3)) if m else 0; counts["canonical-files"]=int(m.group(1)) if m else 0
        check(name,ok,r.output[-1800:])
    if args.require_windows_goal_live:
        r=run("windows-goal-live",["node","scripts/run-step019a-goal-live.mjs"],360); seconds+=r.elapsed_seconds
        marker=f"{STEP} checks=10/10 state=PASSED version={VERSION} schema={SCHEMA} goal=DURABLE_CONVERSATION plan=REVISIONED_ORDERED task_state=CHECKPOINTED_PROGRESS continuation=HOST_RESTART_INJECTED blocker=THREE_CONSECUTIVE completion=ALL_STEPS_REQUIRED provider=SCRIPTED_LOCAL live_harness={LIVE_HARNESS}"
        check("windows-goal-live",r.ok and marker in r.output,r.output[-3200:])
    passed=sum(1 for _,ok,_ in checks if ok); total=len(checks); state="PASSED" if passed==total else "FAILED"
    live="PASSED" if args.require_windows_goal_live and state=="PASSED" else "PENDING_ENV" if not args.require_windows_goal_live else "FAILED"
    promotion="READY" if live=="PASSED" else "WINDOWS_GOAL_LIVE_PENDING" if live=="PENDING_ENV" else "BLOCKED"
    marker=(f"{STEP} checks={passed}/{total} state={state} version={VERSION} schema={SCHEMA} accepted_product_baseline={BASELINE} accepted_checks={BASELINE_CHECKS} goal=DURABLE_CONVERSATION plan=REVISIONED_ORDERED task_state=CHECKPOINTED_PROGRESS continuation=HOST_RESTART_INJECTED blocker=THREE_CONSECUTIVE completion=ALL_STEPS_REQUIRED provenance=WORKSPACE_CONVERSATION_RUN_ATTEMPT openclaw_reference=GOAL_TASK_FLOW_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product={counts.get('focused-step019a-product',0)} affected_regression={counts.get('affected-goal-agent-regression',0)} governance={counts.get('focused-validation-governance',0)} canonical_files={counts.get('canonical-files',0)} canonical_tests={counts.get('canonical-suite',0)} windows_goal_live={live} live_harness={LIVE_HARNESS} promotion={promotion} automated_run_seconds={seconds:.3f}")
    lines=[marker]+[f"OPENRILL_STEP019A_FAILURE check={n}\n{d}" for n,ok,d in checks if not ok]
    write_acceptance_report(REPORT,"\n".join(lines)+"\n"); print(marker)
    for line in lines[1:]: print(line)
    return 0 if state=="PASSED" else 1
if __name__=="__main__": raise SystemExit(main())
