# STEP019A H1 Harness acceptance

```text
harness=STEP019A_H1_STATE_SCHEMA_SOURCE_OF_TRUTH_ALIGNMENT
product_version=0.19.0-step019a
state_schema=17
product_change=NONE
local_source_package=37/37 PASS
focused_product=4/4 PASS
affected_regression=10/10 PASS
governance=92/92 PASS
canonical=118 files / 650/650 PASS
automated_run_seconds=87.598
retained_windows_product_tests=4/4 PASS
retained_windows_canonical=117 files / 646/646 PASS
windows_goal_live=PENDING_RERUN
```

H1 changes only the final Windows schema evidence. The live child now reads the built State runtime export instead of searching for a definition in the source barrel, and failed evidence includes the observed runtime schema value.

```text
artifact=openrill-step019a-h1-state-schema-source-of-truth-alignment-v1.zip
```
