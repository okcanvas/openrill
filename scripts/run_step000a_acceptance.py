from __future__ import annotations
import json, re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EXPECTED_SOURCE_SHA='1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82'
REQUIRED=[
 'PACKAGE_MANIFEST.json','README.md','AGENTS.md','PROJECT.md','ARCHITECTURE.md','PLANS.md','ROADMAP.md','SECURITY.md','HANDOFF.md','VALIDATION.md',
 'docs/INDEX.md','docs/product/PRODUCT_IDENTITY.md','docs/product/PRODUCT_BOUNDARY.md',
 'docs/governance/CLEAN_REDESIGN_RULES.md','docs/governance/NAMING_CONVENTIONS.md',
 'docs/adrs/ADR-0013-OPENRILL_PRODUCT_IDENTITY.md',
 'docs/plans/IMPLEMENTATION_SEQUENCE.md','docs/plans/STEP000A_OPENRILL_PRODUCT_IDENTITY_NORMALIZATION.md',
 'reference/openclaw/SOURCE_MANIFEST.json','reference/openclaw/EVIDENCE_INDEX.json',
 'reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json','reference/openclaw/ADOPT_ADAPT_DEFER_REJECT.md'
]

TEXT_SUFFIXES={'.md','.txt','.json','.yaml','.yml','.py','.cmd','.sh'}
IDENTITY_EXCLUDES={
 'reference/openclaw/EVIDENCE_INDEX.json',
 'reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json',
 'reference/openclaw/SOURCE_MANIFEST.json',
 'scripts/run_step000a_acceptance.py',
}

def main():
 checks=[]
 def check(name, ok, detail=''):
  checks.append((name,bool(ok),detail))

 for rel in REQUIRED:
  check('required:'+rel,(ROOT/rel).is_file())

 manifest=json.loads((ROOT/'reference/openclaw/SOURCE_MANIFEST.json').read_text(encoding='utf-8'))
 check('source-sha',manifest.get('sha256')==EXPECTED_SOURCE_SHA,manifest.get('sha256',''))
 check('source-version',manifest.get('package',{}).get('version')=='2026.7.2')
 check('source-file-count',manifest.get('fileCounts',{}).get('total')==30307,str(manifest.get('fileCounts',{}).get('total')))

 evidence=json.loads((ROOT/'reference/openclaw/EVIDENCE_INDEX.json').read_text(encoding='utf-8'))
 check('evidence-count',len(evidence)==75,str(len(evidence)))
 check('evidence-unique',len({e['id'] for e in evidence})==len(evidence))
 check('evidence-shape',all(set(['id','domain','statement','needle','path','line','excerpt']).issubset(e) for e in evidence))
 report=json.loads((ROOT/'reference/openclaw/EVIDENCE_VERIFICATION_REPORT.json').read_text(encoding='utf-8'))
 check('evidence-report-count',report.get('evidenceCount')==len(evidence),str(report.get('evidenceCount')))
 check('evidence-report-verified',report.get('allVerified') is True and report.get('verifiedCount')==len(evidence),str(report.get('verifiedCount')))
 check('evidence-report-source-sha',report.get('sourceSha256')==EXPECTED_SOURCE_SHA,str(report.get('sourceSha256')))

 step_files=sorted((ROOT/'docs/plans').glob('STEP*.md'))
 check('step-count',len(step_files)==22,str(len(step_files)))
 for p in step_files:
  text=p.read_text(encoding='utf-8')
  for heading in ['## 목적','## Reference Evidence','## 구현 범위','## Acceptance','## 제외']:
   check(f'plan-heading:{p.name}:{heading}',heading in text)

 package_manifest=json.loads((ROOT/'PACKAGE_MANIFEST.json').read_text(encoding='utf-8'))
 check('package-manifest-project',package_manifest.get('project')=='OpenRill',str(package_manifest.get('project')))
 check('package-manifest-step',package_manifest.get('step')=='STEP000A_OPENRILL_PRODUCT_IDENTITY_NORMALIZATION',str(package_manifest.get('step')))
 check('package-manifest-version',package_manifest.get('version')=='0.0.1-step000a',str(package_manifest.get('version')))
 listed={item['path']:(item['size'],item['sha256']) for item in package_manifest.get('files',[])}
 actual={}
 import hashlib
 for fp in ROOT.rglob('*'):
  if fp.is_file() and fp.name!='PACKAGE_MANIFEST.json' and '__pycache__' not in fp.parts:
   rel=fp.relative_to(ROOT).as_posix(); data=fp.read_bytes(); actual[rel]=(len(data),hashlib.sha256(data).hexdigest())
 check('package-manifest-count',package_manifest.get('filesExcludingManifest')==len(actual),f"declared={package_manifest.get('filesExcludingManifest')} actual={len(actual)}")
 check('package-manifest-paths',set(listed)==set(actual),f"missing={sorted(set(actual)-set(listed))[:5]} extra={sorted(set(listed)-set(actual))[:5]}")
 check('package-manifest-hashes',listed==actual)

 pkg=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
 check('project-package-name',pkg.get('name')=='openrill',str(pkg.get('name')))
 check('project-version',pkg.get('version')=='0.0.1-step000a',str(pkg.get('version')))
 deps={**pkg.get('dependencies',{}),**pkg.get('devDependencies',{}),**pkg.get('optionalDependencies',{})}
 check('no-openclaw-dependency',not any('openclaw' in k.lower() for k in deps),','.join(deps))

 identity=(ROOT/'docs/product/PRODUCT_IDENTITY.md').read_text(encoding='utf-8')
 required_identity=['OpenRill','`openrill`','`@openrill/*`','`openrill.yaml`','`OPENRILL_`','OKCanvas Agent Runtime','OpenClaw']
 for value in required_identity:
  check('identity:'+value,value in identity)
 check('identity-no-server-rename','| **OpenRill Agent Runtime**' not in (ROOT/'README.md').read_text(encoding='utf-8') and '| **OpenRill Runtime**' not in (ROOT/'README.md').read_text(encoding='utf-8'))

 forbidden_identity=[]
 forbidden_tokens=['okcanvas-agent','@okcanvas/agent-','%LOCALAPPDATA%\\OKCanvas\\Agent','%APPDATA%\\OKCanvas\\Agent']
 for p in ROOT.rglob('*'):
  if not p.is_file() or p.suffix.lower() not in TEXT_SUFFIXES:
   continue
  rel=p.relative_to(ROOT).as_posix()
  if rel in IDENTITY_EXCLUDES:
   continue
  try: text=p.read_text(encoding='utf-8')
  except UnicodeDecodeError: continue
  for token in forbidden_tokens:
   if token.lower() in text.lower():
    forbidden_identity.append(f'{rel}:{token}')
 check('no-obsolete-local-identifiers',not forbidden_identity,','.join(forbidden_identity[:10]))

 check('readme-product-name',(ROOT/'README.md').read_text(encoding='utf-8').startswith('# OpenRill'))
 check('server-runtime-separation','OKCanvas Agent Runtime' in (ROOT/'docs/product/PRODUCT_BOUNDARY.md').read_text(encoding='utf-8') and '선택적' in (ROOT/'docs/product/PRODUCT_BOUNDARY.md').read_text(encoding='utf-8'))
 check('clean-redesign-rule','OpenClaw' in (ROOT/'docs/governance/CLEAN_REDESIGN_RULES.md').read_text(encoding='utf-8') and '금지' in (ROOT/'docs/governance/CLEAN_REDESIGN_RULES.md').read_text(encoding='utf-8'))

 forbidden_source=[]
 for base in ['apps','services','packages','connectors','skills']:
  for p in (ROOT/base).rglob('*'):
   if p.is_file() and p.suffix.lower() in {'.ts','.tsx','.js','.mjs','.cjs','.swift','.kt','.rs','.sql'}:
    forbidden_source.append(str(p.relative_to(ROOT)))
 check('no-product-source-copied',not forbidden_source,','.join(forbidden_source[:10]))

 link_pattern=re.compile(r'(?<!!)\[[^\]]+\]\(([^)]+)\)')
 broken=[]; link_count=0
 for md in ROOT.rglob('*.md'):
  for target in link_pattern.findall(md.read_text(encoding='utf-8')):
   target=target.strip().split('#',1)[0]
   if not target or '://' in target or target.startswith('mailto:'):
    continue
   link_count+=1
   if not (md.parent/target).resolve().exists():
    broken.append(f'{md.relative_to(ROOT)}->{target}')
 check('markdown-links',not broken,f'checked={link_count} broken={broken[:5]}')

 passed=sum(1 for _,ok,_ in checks if ok)
 for name,ok,detail in checks:
  print(f'[{"PASS" if ok else "FAIL"}] {name}'+(f' :: {detail}' if detail else ''))
 print(f'STEP000A_OPENRILL_PRODUCT_IDENTITY_NORMALIZATION checks={passed}/{len(checks)} state={"PASSED" if passed==len(checks) else "FAILED"}')
 return 0 if passed==len(checks) else 1

if __name__=='__main__':
 raise SystemExit(main())
