from __future__ import annotations
import argparse, json, os, re, shutil
from pathlib import Path
from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage

ROOT=Path(__file__).resolve().parents[1]
STEP="STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK"; VERSION="0.18.2-step018c"; SCHEMA=16
BASELINE="STEP018B_SKILL_OPERATIONS_AND_STRUCTURED_TOOL_DISCOVERY"; BASELINE_CHECKS="WINDOWS_AGENT_CAPABILITY_32/32"; BASELINE_SHA="1cbe66542c9a41a71567e9c7b0978cbc5ba7afba906ebe158721d7c1b2bc2831"
REPORT=resolve_acceptance_report(ROOT,".artifacts/acceptance/STEP018C_ACCEPTANCE_REPORT.txt"); LOGDIR=REPORT.parent/"STEP018C_STAGES"
PRODUCT=["tests/unit/agent-benchmark-catalog-step018c.test.mjs","tests/unit/agent-benchmark-runner-step018c.test.mjs","tests/unit/agent-task-benchmark-step018c.test.mjs"]
AFFECTED=["tests/unit/agent-kernel-step007.test.mjs","tests/unit/memory-agent-recall-step018a.test.mjs","tests/unit/tool-discovery-agent-step018b.test.mjs","tests/unit/process-approval-step009.test.mjs","tests/unit/delegation-control-step014d.test.mjs"]
GOVERNANCE=["tests/unit/validation-governance-step015a.test.mjs","tests/unit/validation-governance-step015b.test.mjs","tests/unit/validation-governance-step016a.test.mjs","tests/unit/validation-governance-step016b.test.mjs","tests/unit/validation-governance-step016c.test.mjs","tests/unit/validation-governance-step018a.test.mjs","tests/unit/validation-governance-step018b.test.mjs","tests/unit/validation-governance-step018c.test.mjs"]
STAGES=[
 ("source-version-alignment",["python","scripts/verify_source_version_alignment.py"],60),
 ("workspace-lock-alignment",["python","scripts/verify_workspace_lock_alignment.py"],60),
 ("workspace-module-links",["python","scripts/verify_workspace_module_links.py"],60),
 ("source-root-boundary",["python","scripts/check_source_root_boundary.py"],60),
 ("package-manifest-initial",["python","scripts/verify_package_manifest.py"],120),
 ("workspace-build",["node","scripts/workspace-runner.mjs","build"],300),
 ("focused-step018c-product",["node","--test","--test-concurrency=1","--test-reporter=tap",*PRODUCT],300),
 ("affected-agent-capability-regression",["node","--test","--test-concurrency=1","--test-reporter=tap",*AFFECTED],360),
 ("focused-validation-governance",["node","--test","--test-concurrency=1","--test-reporter=tap",*GOVERNANCE],360),
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
    print(f"OPENRILL_ACCEPTANCE_STAGE_LOG name={name} path={p.relative_to(ROOT).as_posix()} bytes={p.stat().st_size}",flush=True)
    return r
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--require-windows-benchmark-live",action="store_true"); args=ap.parse_args()
    print("OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal",flush=True); clean(); print("OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal",flush=True)
    checks=[]; seconds=0.0; counts={}
    def check(n,o,d=""): checks.append((n,bool(o),d))
    pkg=json.loads((ROOT/"package.json").read_text()); scripts=pkg["scripts"]
    check("root-version",pkg.get("version")==VERSION,str(pkg.get("version")))
    check("root-description","STEP018C" in pkg.get("description",""))
    check("acceptance-script",scripts.get("acceptance:step018c")=="python scripts/run_step018c_acceptance.py")
    check("live-script",scripts.get("acceptance:step018c:live")=="python scripts/run_step018c_acceptance.py --require-windows-benchmark-live")
    check("benchmark-script",scripts.get("benchmark:agent")=="node scripts/run-agent-task-benchmark.mjs --profile agent-core --repetitions 2")
    baseline=json.loads((ROOT/"config/current-accepted-baseline.json").read_text())
    check("baseline-step",baseline.get("step")==BASELINE); check("baseline-checks",baseline.get("checks")==BASELINE_CHECKS); check("baseline-sha",baseline.get("zipSha256")==BASELINE_SHA)
    required=["packages/agent-benchmark/src/index.ts","benchmarks/agent-tasks/index.json","benchmarks/agent-tasks/taxonomy.json","scripts/run-agent-task-benchmark.mjs","scripts/run-step018c-agent-benchmark-live.mjs",*PRODUCT,"reference/openclaw/OPENCLAW_SOURCE_BASELINE.md","docs/research/OPENCLAW_PERSONAL_AGENT_BENCHMARK_PACK_CODE_AUDIT.md","docs/plans/STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK.md","reference/validation/STEP018B_WINDOWS_AGENT_CAPABILITY_LIVE_ACCEPTANCE.md","reference/validation/STEP018C_OR_ISSUE_224.md","reference/validation/STEP018C_OR_ISSUE_225.md"]
    for x in required: check("required:"+x,(ROOT/x).is_file())
    for name,cmd,timeout in STAGES:
        r=run(name,cmd,timeout); seconds+=r.elapsed_seconds; ok=r.ok
        if name.startswith("focused-") or name.startswith("affected-"):
            ok,n=tap(r.output); counts[name]=n
        if name=="canonical-suite":
            m=re.search(r"OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0",r.output)
            ok=bool(m); counts[name]=int(m.group(3)) if m else 0; counts["canonical-files"]=int(m.group(1)) if m else 0
        check(name,ok,r.output[-1600:])
    if args.require_windows_benchmark_live:
        r=run("windows-agent-benchmark-live",["node","scripts/run-step018c-agent-benchmark-live.mjs"],360); seconds+=r.elapsed_seconds
        marker=f"{STEP} checks=16/16 state=PASSED version={VERSION} schema={SCHEMA}"
        check("windows-agent-benchmark-live",r.ok and marker in r.output,r.output[-3200:])
    passed=sum(1 for _,ok,_ in checks if ok); total=len(checks); state="PASSED" if passed==total else "FAILED"
    live="PASSED" if args.require_windows_benchmark_live and state=="PASSED" else "PENDING_ENV" if not args.require_windows_benchmark_live else "FAILED"
    promotion="READY" if live=="PASSED" else "WINDOWS_AGENT_BENCHMARK_LIVE_PENDING" if live=="PENDING_ENV" else "BLOCKED"
    marker=(f"{STEP} checks={passed}/{total} state={state} version={VERSION} schema={SCHEMA} accepted_product_baseline={BASELINE} accepted_checks={BASELINE_CHECKS} benchmark=REPO_BACKED_AGENT_CORE scenarios=10 repetitions=2 provider=SCRIPTED_LOCAL scoring=ASSERTION_BUDGET_EVIDENCE reliability_target=100_PERCENT artifact=SHARE_SAFE openclaw_reference=PERSONAL_AGENT_PACK_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product={counts.get('focused-step018c-product',0)} affected_regression={counts.get('affected-agent-capability-regression',0)} governance={counts.get('focused-validation-governance',0)} canonical_files={counts.get('canonical-files',0)} canonical_tests={counts.get('canonical-suite',0)} windows_agent_benchmark_live={live} promotion={promotion} automated_run_seconds={seconds:.3f}")
    lines=[marker]+[f"OPENRILL_STEP018C_FAILURE check={n}\n{d}" for n,ok,d in checks if not ok]
    write_acceptance_report(REPORT,"\n".join(lines)+"\n"); print(marker)
    for line in lines[1:]: print(line)
    return 0 if state=="PASSED" else 1
if __name__=="__main__": raise SystemExit(main())
