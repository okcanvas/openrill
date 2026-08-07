# OR-ISSUE-396 — STEP022CR2 validation corrective froze Product root version after later development

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: historical validation corrective / identity ownership
- Failure: STEP022CR2's single-root Testbed test required the ever-current root package to remain `0.24.0-step022c`.
- Correction: CR2 now validates the retained STEP022C contract version and single-root Testbed scripts without owning later Product source identity.
- Product impact: none; integrated Mattermost Testbed remains retained and non-blocking.
