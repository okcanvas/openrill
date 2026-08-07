# OR-ISSUE-286 — Governance flattened a multiline Task Flow runtime signature

| Field | Value |
|---|---|
| First observed | STEP021A current governance |
| Classification | Validation governance / formatting dependence |
| Direct cause | The hook-bearing `runTask` signature is multiline, while governance required a literal one-line `runTask(input, hook`. |
| Correction | Assert `TaskFlowChildAdmissionHook` and the actual `hook?:` parameter independently of formatting. |
| Product impact | none |
| Recurrence gate | corrected STEP021A governance plus cumulative canonical suite |
