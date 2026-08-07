# OR-ISSUE-408 — Browser upload is the wrong transport for the complete source tree

- Corrective: `STEP023AR1_GITHUB_PUBLISHING_SOURCE_HYGIENE_AND_EOL_CONTRACT_CLOSURE`
- Product: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`, version `0.25.0-step023a`, schema 26
- Classification: repository publication / transport completeness
- Finding: the uploaded STEP023A tree contains 1,883 files before this corrective. Repeated browser upload batches would make completeness, line-ending behavior and initial history harder to verify than one Git commit/push.
- Correction: publication instructions require a local Git repository, one reviewed initial commit, and push to a newly created empty GitHub repository. Generated STEP ZIPs belong in Releases rather than source history.
- Product impact: none.
- Recurrence rule: full source baselines are published through Git transport; browser upload is not the canonical path for a multi-thousand-file repository.
