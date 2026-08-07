# STEP013A Browser Runtime failure-prevention audit

## 기준

- accepted source: STEP012DR4 Windows 180/180, immutable ZIP SHA `46097b9ec753b46741705823a5a9a67ab191d6fe3350db43f64e43b516807658`;
- OpenClaw reference: ZIP SHA `1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82`;
- current cut: STEP013A, version `0.13.0-step013a`, schema 9.

## 사전 감사 표

| 위험 | 코드 확인 | STEP013A 결정 | 자동 gate |
|---|---|---|---|
| launch 중복 | concurrent session이 process를 중복 launch할 수 있음 | `#launchPromise` single-flight | concurrent session actual test |
| stale actor | crash 후 과거 handle 재사용 | generation 증가·stale fail closed | disconnect/fresh generation test |
| ownership 누수 | 다른 Run의 context/page 정리 | owner 4-tuple, `cancelRun(runId)` | scoped cancellation test |
| actor 폭증 | context/page 생성 후 limit 판정 | 생성 전 max check | session/page limit test |
| timeout hang | adapter가 AbortSignal 무시 | referenced Promise.race timeout | never-resolving driver test |
| shutdown 신규 작업 | close await 중 새 operation 진입 | 첫 await 전 CLOSING | in-flight navigation/close test |
| incomplete drain | Browser/Process보다 SQLite 먼저 close | parallel drains awaited before DB | Host lifecycle source/actual test |
| lock leak | driver 없는 enabled config가 lock 후 실패 | pre-lock preflight | static ordering test |
| URL credential 노출 | userinfo 포함 URL error echo | credential-specific redacted rejection | policy test |
| scheme 우회 | file/data/javascript URL | http/https/about:blank only | policy test |
| DNS rebinding/final redirect | requested URL만 검사 | DNS all + final URL recheck | local redirect test |
| private network | loopback/RFC1918 접근 | default deny, explicit allow | policy test |
| popup/download escape | child page/download 무제한 | popup close, download cancel | actor callback test |
| persistent state | cookies/profile/download 잔존 | context persistent/download false | driver options assertion |
| external source coupling | OpenClaw code/dependency 포함 | hashes/evidence only | architecture/dependency scan |
| release drift | manifest와 source identity 불일치 | dedicated verifier | 26/25/3 alignment gate |
| historical fixture drift | additive config/drain 미반영 | complete fixture + ownership assertion | canonical suite |
| accepted cutover drift | superseded baseline을 current root에 강제 | latest accepted와 historical evidence 분리 | manifest-dynamic historical test |

## 실제 이슈

### OR-ISSUE-077
Accepted DR4 source version identity drift. 모든 current manifest/source/Host literal을 STEP013A로 정렬하고 dedicated verifier를 추가했다.

### OR-ISSUE-078
Browser driver preflight가 lock 뒤에 놓일 near-miss. pre-lock으로 이동했다.

### OR-ISSUE-079
Awaited timeout timer `unref()`와 adapter non-cooperation으로 test가 `cancelledByParent`. referenced race로 수정했다.

### OR-ISSUE-080
Shutdown test가 event-loop turn으로 lifecycle 진입을 추정. explicit barrier로 수정했다.

### OR-ISSUE-081
Historical Host config가 browser section을 누락하고 shutdown gate가 old direct process close를 고정. complete config와 Browser/Process drain contract로 수정했다.

### OR-ISSUE-082
Historical root test가 current/latest accepted/historical evidence를 혼동해 DR4 승격을 거부했다. mutable root는 current+latest accepted, 과거 marker는 dedicated evidence로 분리했다.

## STEP013B 전달 조건

STEP013B는 STEP013A Windows acceptance 후에만 다음을 추가한다.

- concrete Playwright adapter;
- executable discovery/install policy;
- public Browser Tool validators/registry;
- screenshot/download Artifact;
- actual Windows autonomous Browser Tool vertical slice.

## STEP013AR1 package dependency closure

OR-ISSUE-083 proved that BrowserRuntime product tests can pass while the packaged dependency graph is stale. Every workspace manifest/importer is now compared exactly, Host BrowserRuntime linkage is lock-owned, and pnpm script execution is forbidden from implicitly installing or mutating the candidate.

## STEP013AR1 corrective-release and validation-root closure

OR-ISSUE-084 separates retained STEP013A feature assertions from current corrective release identity. OR-ISSUE-085 requires every materialized `@openrill` workspace module link to resolve inside the active validation root before tests execute.

## STEP013AR2 validation-layout correction
OR-ISSUE-086에 따라 root `node_modules/@openrill` 존재 자체를 요구하지 않는다. 각 importer의 declared internal dependency가 current source root의 exact workspace package로 resolve되는지 확인하고, package-local current-root layout은 허용하며 outside-root target은 차단한다.

OR-ISSUE-087: successful workspace-link evidence is normalized across valid physical layouts; raw layout diagnostics are retained only for failures.

## STEP013AR3 acceptance liveness audit

- OR-ISSUE-088: aggregate child stages must be visible and bounded.
- every external child uses the shared acceptance stage runner.
- Windows timeout cleanup owns the complete child process tree.
- repository cleanup scans prune `node_modules`, `dist`, `.artifacts`, and `.git`.
- STEP013B cannot begin until the STEP013AR3 Windows marker is accepted.

## STEP013AR4 acceptance fixture import audit

- OR-ISSUE-089: Windows `python -c` fixture may not assume the repository root is on `sys.path`.
- timeout fixture loads the exact helper file by absolute identity and executes under unrelated cwd plus safe-path isolation.
- STEP013B cannot begin until the STEP013AR4 Windows marker is accepted.
