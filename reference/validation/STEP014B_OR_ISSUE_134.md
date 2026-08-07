# OR-ISSUE-134 — Delegated child could auto-activate parent-unapproved Skills

## Symptom
The Host resolved Skills for every Run from task text even when a child envelope had an empty `allowedSkillIds` set.

## Root cause
Skill instruction resolution did not distinguish root and delegated Runs.

## Correction
Delegated Runs use the default system instructions and skip SkillRunService activation in STEP014B. Child Skill expansion remains denied.

## Gate
Host boundary tests require the `parentRunId` budget check and default-instruction branch.
