# STEP013C Failure Prevention Audit

## Code-confirmed risks and gates

| Risk | Code correction | Mandatory gate |
|---|---|---|
| historical B3 tests freeze schema 10 or exact current release | historical assertions own minimum schema/retained 15 Tool surface; C owns exact schema 11 | boundary source scan plus retained B3 focused tests |
| raw Browser arguments persist passwords/text | operation schema stores only `input_sha256`; wrapper canonical-hashes input | migration/static gate and ledger unit test |
| unfinished operation looks successful after restart | STARTED operations become INTERRUPTED with typed error/event | restart repository unit test |
| completed Browser Tool is executed twice | durable `run.checkpoint` keyed by Tool call and replay checkpoint | Kernel scripted-model test |
| latest `model.requested` hides a safe checkpoint | recovery scans from latest checkpoint and permits only request/retry events | Conversation and C focused tests |
| model invocation remains STARTED forever | restart closes it FAILED with `MODEL_INTERRUPTED_BY_RESTART` | state row assertion |
| Automation creates a second conversation/run | existing runId goes directly to `executeUntilTerminal` | executor unit test and live same-run assertion |
| stale Browser identity is silently restored | old session must fail `BROWSER_SESSION_NOT_FOUND`; explicit reopen required | two-Host live fixture |
| evidence table duplicates arbitrary console secrets | text/stack stored as SHA-256 plus length; network URL re-redacted | safe-evidence unit/static gate |
| process crash fixture accidentally performs graceful cleanup | first child uses taskkill `/F` or SIGKILL | live source gate |
| Windows graceful stop bypasses Host cleanup because SIGTERM maps to process termination | second child receives explicit `CLOSE` over stdin and awaits Host shutdown | child/live source gate |
| forced-process SQLite/WAL handles make one-shot fixture deletion fail | bounded retry cleanup reuses the accepted STEP011 helper and preserves the primary error | cleanup source gate |
| live success leaves Chromium children | unique command-line marker and process-table scan | `process_count=0 chromium_orphan=0` |

## Validation order

```text
source/version
lock/module links
initial package manifest
workspace build
STEP013C focused ledger
STEP013C focused boundaries
retained B3/B2/B1/A focused suites
canonical unit suite
architecture
exports
real two-Host Browser live
final package manifest
```

All Node focused commands explicitly use TAP.
