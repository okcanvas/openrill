# OR-ISSUE-270 — Successful Windows LIVE Harness rejected by divergent exact marker literals

| Field | Value |
|---|---|
| First observed | Actual Windows `pnpm acceptance:step020er1:live` |
| Symptom | Stage PASS and inner 21/21 PASSED, aggregate 59/60 FAILED |
| Product impact | none demonstrated; completion restart test passed |
| Direct cause | live runner omitted `queue` and `migration`; aggregate required an exact independently copied full string |
| Correction | JSON single source, shared JS renderer, structural Python field-set validation |
| Recurrence gate | reordered fields accepted; missing required fields rejected before Windows promotion |

A sleep, retry, or Product lifecycle change is not an acceptable correction because the actual Windows Product Harness already passed.
