# OR-ISSUE-371 — Canonical reconciliation compared absolute expected paths with relative executed paths

After all 183 canonical files had individually passed, the first reconciliation helper compared absolute `Path` values for the expected set with relative strings recorded in the deterministic group files. It therefore falsely reported 183 missing and 183 extra files.

Correction: canonical reconciliation normalizes both expected and executed identities to repository-relative POSIX paths before comparing count, uniqueness, order, missing, and extra sets. The corrected result is 183 expected / 183 executed / 183 unique / order exact / missing 0 / extra 0.
