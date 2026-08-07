# STEP014 Product Core Acceptance Evidence

```text
step=STEP014_PRODUCT_CORE_ACCEPTED
source_artifact=openrill-step014dr8-vue-runtime-materialization-browser-bootstrap-evidence-closure-v1.zip
source_sha256=484c231d4998d9dc58c298624671cf7a084348567ab2779c5a4bce6f04f05054
windows_aggregate=357/358
product_core=ACCEPTED
external_model_parallel=PASS
deterministic_nested_tree=PASS
control_ui_privacy=KNOWN_ISSUE_OR_ISSUE_190
chromium_harness=KNOWN_ISSUE_OR_ISSUE_191
```

The raw supplied Windows log is retained at
`reference/validation/STEP014DR8_WINDOWS_357_OF_358_EVIDENCE.txt`.

The deterministic fixture source executes the failing raw-transcript assertion only after ready
state, delegation navigation, at least three rendered rows, and exactly one depth-2 row. The
external-model parallel stage independently passed. This evidence accepts the delegation Product
core while retaining the UI and Harness failures as separate dimensions.
