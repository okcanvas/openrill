# STEP012D failure-prevention audit

Before packaging STEP012D, the following previously observed failure classes were audited against current code.

| Failure class | Current prevention |
|---|---|
| Vue compiler / strict CSP | runtime-only Vue, render function, unsafe-eval absent |
| Vue Proxy / structuredClone | transport objects use shallowRef; projection uses Proxy-safe detached copy |
| stale list after domain mutation | `automation.job.updated` reloads jobs/detail; `automation.run.updated` reloads history |
| approval creation refresh gap | retained explicit `approval.updated` path |
| interval drift on unrelated edit | existing anchor preserved when interval duration is unchanged |
| run-now duplicate after reconnect/retry | durable requestKey is separate from each fresh Protocol envelope idempotency key; replay UI plus one-row/one-model ledger assertion |
| revision conflict | update always sends selected job revision; conflict reloads canonical list |
| AutomationRun / AgentRun orphan | retained pre-execution lease-guarded bind |
| async shutdown | retained scheduler abort/quiescence before State close |
| historical acceptance ownership | immutable accepted evidence retained in dedicated files; STEP012D alone owns mutable root documents and current actual browser |
| acceptance report mutation | reports written to `.artifacts`; manifest verified before and after |
| accepted history stale false positive | current identity and immutable accepted evidence are checked separately; accepted version is not treated as stale current ownership |
| Windows browser diagnostics | browser evidence collection, phased startup, bounded waits, ledger assertions, cleanup preservation |
| Host readiness / browser bootstrap race | browser opens only after `READY/readiness=true`; UI exposes fetch/connect/projection phases and redacted startup evidence |

OR-ISSUE-072 records the actual Windows connection wait, READY ownership defect, and phase-collapse diagnostics.

A STEP012D failure must add a new `OR-ISSUE-NNN`, dedicated validation document, registry row, and recurrence gate before closure.

## STEP012DR2 vendor materialization audit

- external vendor acquisition과 Host static-root materialization은 별도 경계다.
- build 전에 vendor env가 없으면 `dist/public/vendor`가 생성되지 않는 것을 코드에서 확인했다.
- 실제 browser fixture는 local vendor read뿐 아니라 Host-served HTTP bytes를 검증해야 한다.
- OR-ISSUE-074와 focused static serving gate가 이 경계를 소유한다.

## STEP012DR3 background process observation audit

- background process `RUNNING`과 첫 stdout flush는 서로 다른 비동기 경계다.
- test는 fixed sleep으로 stdout readiness를 추론하지 않는다.
- delayed-first-output fixture와 bounded status-aware tail polling이 Windows scheduling 차이를 흡수한다.
- OR-ISSUE-075와 focused actual/static gates가 이 경계를 소유한다.

## STEP012DR4 Automation history selector audit

- action testid와 collection-row testid는 broad prefix를 공유하지 않는다.
- `automation-run-now`는 action이며 history row count에 포함되지 않는다.
- visible history는 `automation-history-row-*`만 집계한다.
- DOM one-row와 SQLite one-run/provider one-call을 독립적으로 검증한다.
- OR-ISSUE-076과 focused 4/4 gate가 이 경계를 소유한다.
