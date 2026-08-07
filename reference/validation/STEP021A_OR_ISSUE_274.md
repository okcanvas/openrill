# OR-ISSUE-274 — Draft controller wrapper could admit the same Step twice

| Field | Value |
|---|---|
| First observed | STEP021A implementation and focused validation |
| Classification | Implementation draft / admission ownership |
| Direct cause | The first wrapper invoked Goal admission and then called the base runtime again, while a private inferred type was not compilable. |
| Correction | Discard the draft; return one explicit admission result from the Goal executor and compile before Host wiring. |
| Recurrence gate | STEP021A focused Product tests, current governance, cumulative canonical suite |

The failure is retained independently; it is not merged with adjacent Product or fixture failures.
