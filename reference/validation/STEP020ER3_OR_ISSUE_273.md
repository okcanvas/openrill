# OR-ISSUE-273 — Windows failure state omitted from issue summary

| Field | Value |
|---|---|
| First observed | STEP020ER3 focused validation governance |
| Symptom | Product and validator tests passed, governance 13/14 |
| Classification | Validation evidence precision |
| Direct cause | OR-ISSUE-272 summary wrote `Live Harness 20/23` without the observed `FAILED` state |
| Correction | preserve the exact `20/23 FAILED` marker in both failure evidence and issue summary |
| Recurrence gate | current governance requires `54/57 FAILED`, `20/23 FAILED`, and the exact `ModuleNotFoundError` identity |

No Product or validator behavior changed for this correction.
