# STEP013CR1 Failure Prevention Audit

| Risk | Correction | Mandatory gate |
|---|---|---|
| recovered Run has no current attempt before execution preflight | retain pointer to ABORTED/HOST_RESTART attempt | real `executeAgentRun()` recovery test requires attempt 2 completion |
| old attempt accidentally resumes as RUNNING | `startExecution()` creates a distinct next attempt | old/new attempt ID and status assertions |
| Conversation recovery error becomes generic Automation failure | typed `AUTOMATION_CONVERSATION_<CODE>` mapping | executor unit test |
| live failure deletes exact state evidence | privacy-safe DB diagnostic snapshot before assertion/cleanup | live source and acceptance log gates |
| corrective step widens Browser/schema surface | retain schema 11 and exact 15 Browser Tools | static and retained focused suites |
| Windows Browser child survives failure | existing marker process scan and bounded cleanup | `process_count=0 chromium_orphan=0` |

Validation order remains source/version, lock/module links, manifest, build, focused recovery/Browser suites, canonical suite, architecture, exports, real two-Host Browser live, final manifest.
