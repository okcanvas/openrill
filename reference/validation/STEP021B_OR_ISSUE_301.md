# OR-ISSUE-301 — Historical completion governance froze the accepted baseline at STEP020ER3

| Field | Value |
|---|---|
| First observed | STEP021B cumulative validation governance |
| Classification | Historical validation ownership |
| Direct cause | STEP020ER1, STEP020ER2 and STEP020ER3 historical tests asserted the mutable current accepted baseline instead of retaining only their immutable evidence |
| Correction | preserve each historical runner, failure and Windows evidence while current baseline validation is owned by STEP021B and points to accepted STEP021A |
| Product impact | none; focused Product and affected regression passed |
| Recurrence gate | historical governance may validate current baseline integrity but may not freeze it to its own STEP |
