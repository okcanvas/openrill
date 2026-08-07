# OR-ISSUE-220 — STEP018B Skill fixture used unsupported inline YAML

## First observation

The first STEP018B focused Skill CLI run failed all Skill operation checks while Tool Discovery and Agent bridge checks passed.

## Direct evidence

The diagnostic was `SKILL_MANIFEST_INVALID`: the test fixture wrote `resources: []`, but the existing strict Skill YAML parser accepts resources through block-list syntax. The Product correctly failed closed instead of silently accepting a different YAML dialect.

## Classification

```text
owner_dimension=HARNESS_FIXTURE
product_parser_behavior=CORRECT_FAIL_CLOSED
product_version_change=NONE
state_schema_change=NONE
```

## Correction

- write a manifest that conforms to the existing block-list contract;
- retain a missing-required-Tool fixture as an explicit eligibility failure;
- add Browser-disabled eligibility coverage against the actual profile configuration.

## Recurrence prevention

Focused Skill tests must create manifests through the syntax owned by the strict parser. Unsupported YAML shorthand may appear only in explicit invalid-manifest tests.
