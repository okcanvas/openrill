# OR-ISSUE-400 — STEP023A acceptance stopped checking issue evidence at OR-ISSUE-392

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: acceptance evidence completeness / recurrence governance
- Failure: `run_step023a_acceptance.py` required evidence files only for OR-ISSUE-376 through OR-ISSUE-392 even after new independently recorded issues OR-ISSUE-393 through OR-ISSUE-399 were added. A package could therefore pass the acceptance asset check while omitting later corrective evidence.
- Correction: the STEP023A acceptance asset inventory now covers the full current issue range OR-ISSUE-376 through OR-ISSUE-400.
- Product impact: validation only; Product runtime semantics are unchanged.
- Recurrence rule: whenever a STEP gains a new issue, its acceptance evidence range and governance range must advance atomically before packaging.
