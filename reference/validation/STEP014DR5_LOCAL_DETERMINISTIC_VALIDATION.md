# STEP014DR5 Local Deterministic Validation

```text
STEP014DR5_CONTROL_UI_ENTRYPOINT_DISCOVERY_AND_STATIC_ASSET_ROUTE_ALIGNMENT
checks=239/240
state=FAILED
schema=14
baseline=STEP013CR2
only_failed_stage=external-model-control-ui-live
local_cause=OPENAI_API_KEY prerequisite
```

Deterministic results:
- static acceptance contracts: `211/211`;
- external stages: 29, with 28 locally passing;
- focused retained plus DR5: `110/110`;
- canonical: `440/440`, 78 unit files, skipped 0;
- architecture: `27 packages / 67 edges / 116 sources`;
- exports: `27/27`;
- source/version: `28 manifests / 27 sources / 3 Host literals`;
- lock: `28 importers / 70 dependencies`;
- workspace links: `67 edges / 27 materialized`;
- package manifest count is finalized after documentation sealing.

No local external-model or Chromium success is claimed. Expected Windows total is `240/240`.

## Preliminary sealed-ZIP fresh extraction
The preliminary sealed ZIP was extracted into a new root. After materializing root-owned workspace links and removing `.artifacts` and every `dist`, the exact archive passed manifest `1108/1108`, source/version `28/27/3`, lock `28/70`, links `67/27`, source-root boundary, zero-dist build, focused `110/110`, canonical `440/440`, architecture `27/67/116`, and exports `27/27`.
