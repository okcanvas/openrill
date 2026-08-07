# STEP014D local deterministic validation

## Identity

```text
STEP014D_DELEGATED_WORK_CONTROL_UI_AND_WINDOWS_VERTICAL_SLICE
version=0.14.3-step014d
schema=14
baseline=STEP013CR2
```

## Source aggregate

```text
checks=116/117
state=FAILED
only_failed_stage=external-model-control-ui-live
failure=OPENRILL_STEP014D_PREREQUISITE_MISSING:OPENAI_API_KEY
```

The local container does not provide the user's external model credential/model selection. No external-model or Chromium UI success is claimed locally.

All deterministic stages pass:

```text
source/version=28 manifests / 27 sources / 3 Host literals
workspace lock=28 importers / 70 dependencies
workspace links=67 edges / 27 materialized
zero-dist build=PASS
focused=72/72
canonical=402/402
unit files=67
skipped=0
architecture=27 packages / 67 edges / 116 sources
exports=27/27
package manifest=1034/1034
```

## Windows prerequisites

```cmd
set "OPENAI_API_KEY=..."
set "OPENRILL_STEP014D_MODEL=<explicit available model>"
rem optional:
set "OPENRILL_STEP014D_ENDPOINT=https://api.openai.com/v1"
set "OPENRILL_CHROMIUM_EXECUTABLE=C:\path\to\chrome.exe"
pnpm acceptance:step014d
```

Expected final total is `117/117`. The live stage must prove external-model parallel/nested delegation, Protocol list/get/cancel, rendered Chromium tree/detail, and `chromium_orphan=0`.

## Preliminary fresh extraction

The deterministic ZIP was extracted under a new root, root-owned workspace links were rematerialized, all `dist` output was removed by acceptance, and the same result was reproduced:

```text
manifest=1034/1034
source/version=28/27/3
lock=28/70
workspace links=67/27
zero-dist build=PASS
focused=72/72
canonical=402/402
architecture=27/67/116
exports=27/27
aggregate=116/117
only_failed_stage=external-model-control-ui-live
```

The final sealed ZIP is revalidated again after this evidence is embedded.
