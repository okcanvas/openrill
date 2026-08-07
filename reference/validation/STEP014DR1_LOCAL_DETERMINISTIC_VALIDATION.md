# STEP014DR1 Local Deterministic Validation

```text
STEP014DR1_SOURCE_ROOT_ARCHIVE_BOUNDARY_AND_EXTERNAL_MODEL_FAILURE_DIAGNOSTICS
version=0.14.4-step014dr1
schema=14
baseline=STEP013CR2
retained_feature=STEP014D
```

## Source aggregate

```text
checks=140/141
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
focused=81/81
canonical=411/411
unit files=70
skipped=0
architecture=27 packages / 67 edges / 116 sources
exports=27/27
package manifest=1051/1051
```

No external-model or Chromium success is claimed locally. The prerequisite failure occurs before a Run exists, so no root diagnostic is expected in this environment. On a configured Windows run, any post-creation root failure must emit `OPENRILL_STEP014DR1_ROOT_FAILURE_DIAGNOSTICS` before cleanup.

## Preliminary fresh-ZIP verification

The deterministic ZIP was extracted into a new root. Root-owned workspace links were recreated to that root and all build output was absent before validation.

```text
manifest=1051/1051
source/version=28/27/3
lock=28/70
workspace links=67/27
source-root archives=0
zero-dist build=PASS
focused=81/81
canonical=411/411
architecture=27/67/116
exports=27/27
```

Two independently generated preliminary ZIPs were byte-identical. Final sealed-ZIP evidence is recorded after this document is included in the package manifest.

## Final sealed-source verification contract

After this evidence was incorporated, the final package is generated twice and the exact final ZIP is extracted again. The required final result is:

```text
manifest=1051/1051
source/version=28/27/3
lock=28/70
workspace links=67/27
source-root archives=0
zero-dist build=PASS
corrective focused=9/9
canonical=411/411
architecture=27/67/116
exports=27/27
deterministic two-pack=byte-identical
```
