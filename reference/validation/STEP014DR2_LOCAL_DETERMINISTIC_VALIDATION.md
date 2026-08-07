# STEP014DR2 Local Deterministic Validation

```text
STEP014DR2_OPENAI_RESPONSES_FUNCTION_NAME_ALIAS_AND_CANONICAL_TOOL_ROUND_TRIP
version=0.14.5-step014dr2
schema=14
baseline=STEP013CR2
retained_feature=STEP014D
```

## Source aggregate

```text
checks=167/168
state=FAILED
only_failed_stage=external-model-control-ui-live
cause=OPENRILL_STEP014D_PREREQUISITE_MISSING:OPENAI_API_KEY
```

All deterministic stages passed:

```text
source/version=28 manifests / 27 sources / 3 Host literals
workspace lock=28 importers / 70 dependencies
workspace links=67 edges / 27 materialized
source-root archives=0
zero-dist build=PASS
focused=88/88
canonical=418/418
unit files=72
skipped=0
architecture=27 packages / 67 edges / 116 sources
exports=27/27
package manifest=1065/1065
```

The local environment does not contain an OpenAI credential, so no external-model or Chromium success is claimed. The Windows rerun must use an explicit available model and is expected to pass `168/168` if no new typed provider failure is emitted.

## Provider correction evidence

- captured HTTP requests contain no dotted function names;
- all provider names match `^[A-Za-z0-9_-]{1,64}$`;
- `agent.spawn` receives a deterministic SHA-derived alias;
- historical function-call input uses the same alias;
- streamed aliases return canonical `agent.spawn` to the Kernel;
- unknown aliases fail `MODEL_STREAM_INVALID`.

## Final fresh-ZIP contract

The exact final ZIP must be extracted into a new root, root-owned workspace links recreated, and the following repeated:

```text
manifest=1065/1065
source/version=28/27/3
lock=28/70
workspace links=67/27
source-root archives=0
zero-dist build=PASS
focused=88/88
canonical=418/418
architecture=27/67/116
exports=27/27
aggregate=167/168 only OPENAI_API_KEY prerequisite
```

## Preliminary sealed-ZIP verification

The deterministic candidate ZIP was extracted into a new root. Root-owned workspace links were recreated and all packaged `dist`/`.artifacts` state was absent before build.

```text
manifest=1065/1065
source/version=28/27/3
lock=28/70
workspace links=67/27
source-root archives=0
zero-dist build=PASS
focused=88/88
canonical=418/418
architecture=27/67/116
exports=27/27
```

Two independently generated preliminary ZIPs were byte-identical. After this evidence is incorporated, the final source is packaged twice again and the exact final ZIP is independently reverified.
