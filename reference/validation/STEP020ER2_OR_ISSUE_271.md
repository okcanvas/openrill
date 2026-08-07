# OR-ISSUE-271 — Historical STEP020ER1 governance reclaimed mutable current identity

| Field | Value |
|---|---|
| First observed | STEP020ER2 cumulative governance |
| Symptom | historical STEP020ER1 tests rejected current version, root continuation and mutable manifest scripts |
| Classification | Validation governance / historical ownership overreach |
| Direct cause | the failed candidate's governance still asserted that STEP020ER1 owned current `package.json`, current root docs and mutable package manifest tooling |
| Correction | retain immutable STEP020ER1 runner, retry implementation and evidence checks; release mutable identity to STEP020ER2 |
| Product impact | none |

Historical failed or superseded candidates must remain inspectable without preventing a corrective successor from owning current identity.
