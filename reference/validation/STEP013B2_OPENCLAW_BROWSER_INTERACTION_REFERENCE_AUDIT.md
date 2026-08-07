# STEP013B2 OpenClaw Browser interaction reference audit

## Reference ZIP

```text
sha256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
```

## Code-inspected files

```text
browser-tool.schema.ts
fb2daff41c8131aea17b17a95646633829a1fb14f51b6845cbfc9a3fac66978f

pw-tools-core.interactions.actions.ts
cfad81292b126a9d5fa327faba5000c4750a406c1210e6215bdb6f2ba86ae712

pw-tools-core.interactions.navigation.ts
a7f6823514cc71ddf4f81b735b6858e3ae1a28172faf281a903870378b16a31e

pw-session-dialogs.ts
b6a76a0214c906873d7b589ffa3ad13e7df41df422fd40a757abf2cb3b5677e9

pw-session-state.ts
06744e61c8ca9c006b0343f7873ccdd6b5004535b17d444dbfd508e97065bb43
```

## Confirmed patterns used as answer-sheet evidence

- action locators are derived from accessibility refs rather than raw DOM ownership escaping the adapter;
- navigation observation spans the action and can detect slightly delayed navigation;
- dialogs are observed as action-affecting state instead of left to hang indefinitely;
- page/session state and navigation behavior are separate from public Tool schema parsing.

## Deliberate OpenRill differences

- 12 small closed Tools rather than one monolithic action enum Tool;
- no coordinates, hover, drag, evaluate, batch, resize, or scroll action in this STEP;
- no automatic stale-ref rematch/replay;
- no public dialog-response operation;
- no persistent profile or existing Chrome attach;
- no screenshot/download/console/network evidence until STEP013B3.
