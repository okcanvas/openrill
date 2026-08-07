# OR-ISSUE-410 — Git clone byte comparator included generated files outside the package boundary

- Corrective: `STEP023AR1_GITHUB_PUBLISHING_SOURCE_HYGIENE_AND_EOL_CONTRACT_CLOSURE`
- Product: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`, version `0.25.0-step023a`, schema 26
- Classification: publication validation / source-boundary equivalence
- Failure: the first source-vs-clone byte-identity comparator recursively compared every non-`.git` file after `python -m py_compile` had created `scripts/__pycache__/run_step023a_acceptance.cpython-313.pyc`. Git and `PACKAGE_MANIFEST.json` correctly exclude `__pycache__` and `*.pyc`, so the comparator reported one false `missing` file even though clone manifest verification had already passed 1890/1890 with zero changed files.
- Correction: clone byte comparison uses the same excluded directories and suffixes as the package manifest (`.git`, `node_modules`, `dist`, `.artifacts`, `__pycache__`, `*.pyc`, `*.pyo`) and compares only source-package-owned files.
- Product impact: none.
- Recurrence rule: cross-transport identity comparators must reuse the canonical source-package inclusion boundary; generated local files are never evidence of Git transport drift.
