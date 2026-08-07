# OR-ISSUE-403 — Fresh verification again selected a not-yet-created extraction directory as workdir

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: Fresh ZIP validation sequencing / recurrence of OR-ISSUE-340
- Failure: the first STEP023A Fresh verification call selected `/mnt/data/step023a_fresh` as the container workdir in the same command that was supposed to create that directory. The container rejected the command before extraction, reproducing the sequencing class already recorded by OR-ISSUE-340.
- Correction: STEP023A adds `scripts/verify_step023a_fresh.py`, which is launched from an already-existing source/parent directory and owns deletion/creation of the Fresh directory, safe ZIP extraction, source-only checks, generated-output checks, and deterministic repack comparison.
- Product impact: none. The failed call never entered the nonexistent workdir and never executed Product or ZIP validation code.
- Recurrence rule: Fresh verification is invoked only through the dedicated verifier from an existing workdir; callers never select the future extraction directory as process cwd.
