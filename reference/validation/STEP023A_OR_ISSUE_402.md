# OR-ISSUE-402 — STEP023A acceptance imported report writer from the wrong module

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: acceptance entrypoint / shared helper ownership
- Failure: the official `run_step023a_acceptance.py` imported `write_acceptance_report` from `acceptance_stage_runner`, but that module exports no such symbol. The aggregate therefore failed with `ImportError` before any acceptance stage ran.
- Correction: `run_stage` remains imported from `acceptance_stage_runner`; `write_acceptance_report` is imported from the actual owner `acceptance_reports`, matching retained acceptance implementations.
- Product impact: validation only. The failed aggregate exited before cleanup/build/stage execution and changed no Product runtime source.
- Recurrence rule: every new Python acceptance entrypoint is import-executed/compiled before long-running validation, and shared helper ownership is copied from the actual current module rather than inferred.
