# OR-ISSUE-389 — Tombstone redaction test confused generated fixture identifiers with retained payload

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: validation fixture / privacy assertion
- Failure: Tombstone redaction test confused generated fixture identifiers with retained payload.
- Correction: assert the exact public tombstone key set and absence of payload fields rather than substring-matching generated ids.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
