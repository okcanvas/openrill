# STEP014DR4 Local Deterministic Validation

## Source aggregate
```text
STEP014DR4_DELEGATION_DEFAULT_BUDGET_FANOUT_AND_TYPED_TOOL_ERROR_DIAGNOSTICS
checks=222/223
state=FAILED
only_failed_stage=external-model-control-ui-live
local_prerequisite=OPENAI_API_KEY
```

## Deterministic evidence
```text
source/version=28 manifests / 27 sources / 3 Host literals
workspace lock=28 importers / 70 dependencies
workspace links=67 edges / 27 materialized / root_owned=true
source-root archives=0
zero-dist build=PASS
focused=102/102 PASS
canonical=432/432 PASS
unit files=76
skipped=0
architecture=27 packages / 67 edges / 116 sources
exports=27/27 PASS
package manifest=1096/1096 changed=0
```

## Live status
No local external-model success is claimed because `OPENAI_API_KEY` is absent. Expected Windows total is `223/223`.

## Preliminary fresh-ZIP evidence
The sealed ZIP was extracted into a new root. Root-owned workspace links and the Node type shim were materialized outside the source package contract. With `.artifacts` and every `dist` removed, the exact ZIP passed manifest `1096/1096`, source/version `28/27/3`, lock `28/70`, links `67/27`, source-root boundary, zero-dist build, focused `102/102`, canonical `432/432`, architecture `27/67/116`, and exports `27/27`.
