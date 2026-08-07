# OR-ISSUE-407 — OpenClaw's referenced MIT license could be mistaken for an OpenRill license

- Corrective: `STEP023AR1_GITHUB_PUBLISHING_SOURCE_HYGIENE_AND_EOL_CONTRACT_CLOSURE`
- Product: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`, version `0.25.0-step023a`, schema 26
- Classification: repository publication / license ownership
- Finding: `NOTICE.md` correctly records the referenced OpenClaw source as MIT, but the repository has no root `LICENSE` for OpenRill itself. Publishing publicly without documenting this boundary could cause a reader to infer that the NOTICE statement licenses OpenRill.
- Correction: `GITHUB_PUBLISHING.md` explicitly states that no OpenRill license is inferred or added and recommends private visibility until the owner intentionally selects a license if public reuse/contribution is desired.
- Product impact: none.
- Recurrence rule: third-party/reference license evidence must never be promoted into a Product license by inference; root Product licensing is an explicit owner decision.
