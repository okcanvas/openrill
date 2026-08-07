# OR-ISSUE-289 — Failed ER1 and ER2 governance froze the old STEP020D baseline

| Field | Value |
|---|---|
| First observed | STEP021A cumulative governance |
| Classification | Historical governance / mutable baseline ownership |
| Direct cause | STEP020ER1 and STEP020ER2 tests still asserted STEP020D after STEP020ER3 became Windows LIVE accepted. |
| Correction | Retain immutable failed-candidate evidence but read the currently accepted STEP020ER3 identity. |
| Product impact | none |
| Recurrence gate | dynamic accepted evidence and historical ownership governance |
