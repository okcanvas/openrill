from __future__ import annotations
import argparse, json, os, re, shutil
from pathlib import Path
from acceptance_reports import resolve_acceptance_report, write_acceptance_report
from acceptance_stage_runner import run_stage

ROOT=Path(__file__).resolve().parents[1]
STEP="STEP018B_SKILL_OPERATIONS_AND_STRUCTURED_TOOL_DISCOVERY"; VERSION="0.18.1-step018b"; SCHEMA=16
BASELINE="STEP018A_DURABLE_AGENT_MEMORY_AND_CONTEXT_RECALL_FOUNDATION"; BASELINE_CHECKS="WINDOWS_MEMORY_33/33"; BASELINE_SHA="c9e5350dd5bd791a4e3412090e0c76cc0f0ac2bbfc9ed383e98666a1d42fb5c8"
REPORT=resolve_acceptance_report(ROOT,".artifacts/acceptance/STEP018B_ACCEPTANCE_REPORT.txt"); LOGDIR=REPORT.parent/"STEP018B_STAGES"
PRODUCT=["tests/unit/tool-discovery-step018b.test.mjs","tests/unit/tool-discovery-agent-step018b.test.mjs","tests/unit/tool-discovery-host-step018b.test.mjs","tests/unit/skill-operations-step018b.test.mjs"]
GOVERNANCE=["tests/unit/validation-governance-step015a.test.mjs","tests/unit/validation-governance-step015b.test.mjs","tests/unit/validation-governance-step016a.test.mjs","tests/unit/validation-governance-step016b.test.mjs","tests/unit/validation-governance-step016c.test.mjs","tests/unit/validation-governance-step018a.test.mjs","tests/unit/validation-governance-step018b.test.mjs"]
STAGES=[
 ("source-version-alignment",["python","scripts/verify_source_version_alignment.py"],60),
 ("workspace-lock-alignment",["python","scripts/verify_workspace_lock_alignment.py"],60),
 ("workspace-module-links",["python","scripts/verify_workspace_module_links.py"],60),
 ("source-root-boundary",["python","scripts/check_source_root_boundary.py"],60),
 ("package-manifest-initial",["python","scripts/verify_package_manifest.py"],120),
 ("workspace-build",["node","scripts/workspace-runner.mjs","build"],300),
 ("focused-step018b-product",["node","--test","--test-concurrency=1","--test-reporter=tap",*PRODUCT],240),
 ("affected-agent-skill-regression",["node","--test","--test-concurrency=1","--test-reporter=tap","tests/unit/agent-kernel-step007.test.mjs","tests/unit/skills-step010.test.mjs","tests/unit/host-lifecycle.test.mjs","tests/unit/memory-agent-recall-step018a.test.mjs"],300),
 ("focused-validation-governance",["node","--test","--test-concurrency=1","--test-reporter=tap",*GOVERNANCE],300),
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
    ap=argparse.ArgumentParser(); ap.add_argument("--require-windows-agent-live",action="store_true"); args=ap.parse_args()
    print("OPENRILL_ACCEPTANCE_STAGE_START name=cleanup timeout_seconds=internal",flush=True); clean(); print("OPENRILL_ACCEPTANCE_STAGE_END name=cleanup state=PASS returncode=0 elapsed_seconds=internal",flush=True)
    checks=[]; seconds=0.0; counts={}
    def check(n,o,d=""): checks.append((n,bool(o),d))
    pkg=json.loads((ROOT/"package.json").read_text()); scripts=pkg["scripts"]
    check("root-version",pkg.get("version")==VERSION,str(pkg.get("version")))
    check("root-description","STEP018B" in pkg.get("description",""))
    check("acceptance-script",scripts.get("acceptance:step018b")=="python scripts/run_step018b_acceptance.py")
    check("live-script",scripts.get("acceptance:step018b:live")=="python scripts/run_step018b_acceptance.py --require-windows-agent-live")
    baseline=json.loads((ROOT/"config/current-accepted-baseline.json").read_text())
    check("baseline-step",baseline.get("step")==BASELINE); check("baseline-checks",baseline.get("checks")==BASELINE_CHECKS); check("baseline-sha",baseline.get("zipSha256")==BASELINE_SHA)
    required=["packages/tool-discovery/src/index.ts","apps/agent-cli/src/skill-operations.ts",*PRODUCT,"reference/openclaw/OPENCLAW_SOURCE_BASELINE.md","docs/research/OPENCLAW_SKILL_AND_TOOL_SEARCH_CODE_AUDIT.md","docs/plans/STEP018B_SKILL_OPERATIONS_AND_STRUCTURED_TOOL_DISCOVERY.md","reference/validation/STEP018A_WINDOWS_MEMORY_LIVE_ACCEPTANCE.md","reference/validation/STEP018B_OR_ISSUE_220.md"]
    for x in required: check("required:"+x,(ROOT/x).is_file())
    for name,cmd,timeout in STAGES:
        r=run(name,cmd,timeout); seconds+=r.elapsed_seconds; ok=r.ok
        if name.startswith("focused-") or name.startswith("affected-"):
            ok,n=tap(r.output); counts[name]=n
        if name=="canonical-suite":
            m=re.search(r"OPENRILL_CANONICAL_BATCHES_PASS files=(\d+) batches=(\d+) tests=(\d+) pass=(\d+) fail=0 skipped=0",r.output)
            ok=bool(m); counts[name]=int(m.group(3)) if m else 0; counts["canonical-files"]=int(m.group(1)) if m else 0
        check(name,ok,r.output[-1200:])
    if args.require_windows_agent_live:
        r=run("windows-agent-capability-live",["node","scripts/run-step018b-agent-live.mjs"],300); seconds+=r.elapsed_seconds
        marker=f"{STEP} checks=11/11 state=PASSED version={VERSION} schema={SCHEMA}"
        check("windows-agent-capability-live",r.ok and marker in r.output,r.output[-2400:])
    passed=sum(1 for _,ok,_ in checks if ok); total=len(checks); state="PASSED" if passed==total else "FAILED"
    live="PASSED" if args.require_windows_agent_live and state=="PASSED" else "PENDING_ENV" if not args.require_windows_agent_live else "FAILED"
    promotion="READY" if live=="PASSED" else "WINDOWS_AGENT_CAPABILITY_LIVE_PENDING" if live=="PENDING_ENV" else "BLOCKED"
    marker=(f"{STEP} checks={passed}/{total} state={state} version={VERSION} schema={SCHEMA} accepted_product_baseline={BASELINE} accepted_checks={BASELINE_CHECKS} skills=OPERABLE eligibility=CONFIGURED_TOOL_SET tool_discovery=STRUCTURED_SEARCH_DESCRIBE_CALL schema_visibility=BOUNDED_SKILL_PREFERRED execution=EXISTING_TOOL_REGISTRY delegation_scope=PRESERVED openclaw_reference=SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM windows_agent_capability_live={live} promotion={promotion} automated_run_seconds={seconds:.3f}")
    lines=[marker]+[f"OPENRILL_STEP018B_FAILURE check={n}\n{d}" for n,ok,d in checks if not ok]
    write_acceptance_report(REPORT,"\n".join(lines)+"\n"); print(marker)
    for line in lines[1:]: print(line)
    return 0 if state=="PASSED" else 1
if __name__=="__main__": raise SystemExit(main())
