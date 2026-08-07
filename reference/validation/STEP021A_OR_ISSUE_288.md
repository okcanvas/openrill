# OR-ISSUE-288 — Current root handoff omitted the accepted ZIP SHA

| Field | Value |
|---|---|
| First observed | STEP021A cumulative governance |
| Classification | Continuation documentation / dynamic accepted evidence |
| Direct cause | The STEP021A current block named STEP020ER3 and 66/66 but omitted its immutable ZIP SHA, breaking dynamic accepted-evidence gates. |
| Correction | Expose accepted version, schema, ZIP, SHA and evidence path in every root handoff document. |
| Product impact | none |
| Recurrence gate | dynamic accepted evidence and historical ownership governance |
