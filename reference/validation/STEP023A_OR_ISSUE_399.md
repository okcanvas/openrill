# OR-ISSUE-399 — Historical STEP022CR3 byte-contract test reclaimed the current Product root version

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: historical corrective validation ownership / current Product identity
- Failure: `tests/unit/mattermost-testbed-step022cr3.test.mjs` asserted the current root `package.json` version must remain `0.24.0-step022c`. Advancing the independent Product source to `0.25.0-step023a` therefore failed the historical Windows CMD byte-contract test even though all CMD bytes and STEP022CR3 behavior remained intact.
- Correction: the historical test now proves the immutable STEP022CR3 packaging script retains its own Product baseline `0.24.0-step022c`, while current root version ownership belongs to the active Product step.
- Product impact: none. No Mattermost, CMD, maintenance, Host, or runtime semantics changed.
- Recurrence rule: validation/bootstrap correctives may retain their immutable baseline inside their own package/evidence assets, but must never freeze the current root Product version after independent Product development advances.
