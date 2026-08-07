# STEP014DR6 local deterministic validation

```text
STEP014DR6_EXTERNAL_MODEL_ACCEPTANCE_DETERMINISM_AND_NESTED_UI_EVIDENCE_SEPARATION
version=0.14.9-step014dr6
schema=14
baseline=STEP013CR2
```

## Passed
- source/version: `28/27/3`;
- lock: `28/70`;
- root-owned workspace links: `67/27`;
- zero-dist build: PASS;
- static acceptance contracts: `233/233`;
- retained plus DR6 focused tests: `118/118`;
- canonical unit contracts: `448/448` across 80 files, skipped 0, executed in three sequential file-order batches because the current container transport did not preserve the single long subprocess to completion;
- architecture: `27/67/116`;
- exports: `27/27`.

## Live limitations
- external-model stage: `OPENAI_API_KEY` is unavailable in this container;
- deterministic nested UI stage: schema-14 fixture, Host and Protocol preparation succeeded, but managed Chromium displayed an organization loopback block page before UI JavaScript execution.

No local external-model or Chromium rendering success is claimed. Expected Windows aggregate is `265/265`.

## Preliminary fresh-ZIP evidence

The preliminary deterministic ZIP was extracted into a new root. With root-owned workspace links and no packaged `dist` or `.artifacts`, it passed manifest `1124/1124`, source/version `28/27/3`, lock `28/70`, links `67/27`, archive boundary, zero-dist build, focused `118/118`, canonical `448/448` in sequential file-order batches, architecture `27/67/116`, and exports `27/27`. The source ZIP contains 1125 files including `PACKAGE_MANIFEST.json`.
