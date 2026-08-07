# STEP013B3 OpenClaw Browser Artifact reference audit

## Reference ZIP

```text
sha256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
```

## Code-inspected files

```text
extensions/browser/src/browser/pw-session-state.ts
06744e61c8ca9c006b0343f7873ccdd6b5004535b17d444dbfd508e97065bb43

extensions/browser/src/browser/pw-download-capture.ts
d5c6d5f0ba8ad68bf4cca507d1bc49ec3204725b98d3569f7a86fc06ca809ede

extensions/browser/src/browser/pw-tools-core.downloads.ts
b3c931d37a81c57fc865ae6b219184b46637262c8e39c2b1234984a34d7e39e7

extensions/browser/src/browser/pw-tools-core.interactions.content.ts
a27c6d7fd1678b6defc47bd14252cff172311c178af119af553ad29bc7242b25

extensions/browser/src/browser/client-actions-observe.ts
d4b2123fe3617a9083cab51a2856c2cccdce62898b17054cfe5dae0ad1038dbc

extensions/browser/src/browser/client-actions-core.ts
459468c6939c74b18267d2a5608ffbffef6ad9f4316c3cad944a0f873b73262f
```

## Confirmed patterns used as answer-sheet evidence

- page state owns bounded console messages, page errors, and network request outcomes;
- download capture distinguishes passive action capture from explicit wait/download ownership;
- suggested filenames are sanitized and saved under a guarded output root;
- explicit download capture can validate metadata before saving;
- screenshot supports page, element/ref, full-page, and labelled variants;
- action responses can include downloads caused by click/batch/evaluate actions.

## Deliberate OpenRill differences

- OpenRill exposes three small closed Tools instead of browser-control endpoints with output path parameters;
- screenshot is current viewport only: no full-page, selector, ref-element, coordinate, or labelled overlay mode;
- download accepts a document-scoped ref only and writes into the existing workspace Artifact store; no caller path or output root;
- unexpected downloads are cancelled rather than passively captured from arbitrary actions;
- bytes are streamed into a strict payload bound before Artifact creation;
- console/page-error/network evidence is one cursor-based provider-neutral stream and excludes request headers/bodies and response bodies;
- network query strings are redacted rather than retained;
- Artifact kinds require migration 010/schema 10, but there is still no Browser action/evidence ledger or Browser protocol operation.
