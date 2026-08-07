# STEP011 Failure History and Prevention Matrix

| Issue | Actual failure | Code-confirmed cause | Permanent prevention |
|---|---|---|---|
| OR-ISSUE-037 | real `model.text_delta` rendered unknown | fixture row shape treated as live `{type,data}` envelope | exact live envelope and compatibility-branch tests |
| OR-ISSUE-038 | notice gap could permanently skip a missing frame | cursor advanced before contiguity was proven | contiguous-only cursor and typed resync tests |
| OR-ISSUE-039 | Windows cleanup hit `agent.db-shm` EBUSY | Chromium/SQLite handles were not awaited | child-exit wait and bounded transient cleanup retry |
| OR-ISSUE-040 | cleanup error hid the primary browser failure | cleanup independently threw from `finally` | primary-failure preservation and cleanup aggregation |
| OR-ISSUE-041 | correction release identity drift | feature and release identity shared one literal | explicit release identity and manifest coherence |
| OR-ISSUE-042 | Windows Chromium spawn `-4058` | POSIX executable path was hardcoded | cross-platform executable resolver |
| OR-ISSUE-043 | spawn failure detail was empty | child `error` event was not captured | executable/error-code evidence gate |
| OR-ISSUE-044 | UI boot timed out without cause | CDP instrumentation attached after navigation | attach/enable before navigate |
| OR-ISSUE-045 | browser timeout reported only `last=false` | final predicate was stored without page evidence | bounded browser evidence block |
| OR-ISSUE-046 | additive tests made a healthy suite fail | expected test/file inventory was stale | inventory derived from the canonical runner |
| OR-ISSUE-047 | source/fresh failure reports differed | paths, ports, and durations remained dynamic | stable normalization and byte-identity gate |
| OR-ISSUE-048 | Vue mount failed under strict CSP | compiler build and runtime template used `Function` | runtime-only Vue and `h()` render function |
| OR-ISSUE-049 | implicit favicon request produced 404 | favicon was not declared | packaged same-origin favicon |
| OR-ISSUE-050 | same-route approval deep-link did not react | global hash lacked a reactive owner | reactive hash owner and hashchange fixture |
| OR-ISSUE-051 | approval expired before UI action | process timeout was reused as approval TTL | independent config fields and wiring |
| OR-ISSUE-052 | `structuredClone` threw on Vue Proxy | deep ref Proxy crossed the projection boundary | shallow transport refs and Proxy-safe detached copy |
| OR-ISSUE-053 | all assertions passed then file wrapper failed | ProcessManager returned before Windows child quiescence | async close, shutdown order, delayed-child fixture |
| OR-ISSUE-054 | connected UI showed `No approvals.` | creation emitted `run.event` but not `approval.updated` | creation domain notice and explicit list reload |
| OR-ISSUE-055 | accepted source still described the old baseline | no immutable post-acceptance closure workflow | accepted artifact + closure bundle + next-step coherence gate |

A failure is not closed without the raw symptom, code-confirmed cause, impact, pre-fix reproduction or detailed evidence, fix, and automated recurrence gate.
