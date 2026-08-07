# OR-ISSUE-086 — STEP013AR1 Windows root workspace scope layout assumption

## Exact symptom
`pnpm install --frozen-lockfile` 이후 STEP013AR1 acceptance에서 lock importer alignment는 통과했지만 다음이 실패했다.

```text
OPENRILL_WORKSPACE_MODULE_LINKS_FAIL reason=scope_missing
focused-workspace-lock-alignment FAIL
canonical-suite 254/255
STEP013AR1 160/163 FAILED
```

## Root cause
Code-confirmed:
`verify_workspace_module_links.py`는 오직 root `node_modules/@openrill` 디렉터리를 찾고, 없으면 즉시 실패했다. 그러나 root package는 `@openrill/*` dependency를 선언하지 않는다. pnpm isolated workspace layout은 각 importer package의 `node_modules`에 direct workspace links를 materialize할 수 있으며 root scope는 필수 계약이 아니다. 따라서 `scope_missing`은 cross-root contamination 증거가 아니었다.

## Impact
정상적인 Windows pnpm layout이 제품·lock·BrowserRuntime 검증 전에 거부됐다. 반대로 검증은 실제 importer가 어느 workspace package를 해석하는지 확인하지 않았다.

## Pre-fix reproduction and evidence
Root scope가 없는 fixture에서 `packages/a`가 `@openrill/b`를 package-local junction으로 current root에 연결해도 기존 verifier는 `reason=scope_missing`으로 실패한다. 실제 Windows 결과도 lock alignment, build, BrowserRuntime, boundaries, historical Host fixture가 모두 통과한 뒤 동일 이유로 실패했다.

## Fix
Verifier는 모든 workspace manifests를 읽고 내부 dependency edge를 만든다. 각 importer에서 Node module ancestor 탐색 순서로 visible link를 찾고, resolved target이 current root 내부의 정확한 workspace package path와 같은지 검증한다. Root scope는 optional이며, 존재하면 추가 materialized-link audit 대상이다.

## Automated recurrence prevention
- root scope absent + package-local current-root link positive fixture
- package-local outside-root junction negative fixture
- current workspace 모든 internal dependency edge resolution gate
- initial/final package manifest changed=0
- focused and canonical skipped-zero gates

## Closure condition
STEP013AR2 Windows final marker와 module layout `RESOLUTION_AWARE`가 확인되어야 종료한다.
