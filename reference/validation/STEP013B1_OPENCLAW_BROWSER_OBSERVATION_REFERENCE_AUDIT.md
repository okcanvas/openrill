# STEP013B1 OpenClaw Browser observation reference audit

## Pinned archive

```text
archive=openclaw-main.zip
sha256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
role=reference_answer_sheet_only
copied_source=0
runtime_dependency=0
```

## Files inspected

| File | SHA-256 | Verified role |
|---|---|---|
| `extensions/browser/src/browser-tool.schema.ts` | `fb2daff41c8131aea17b17a95646633829a1fb14f51b6845cbfc9a3fac66978f` | public action vocabulary and nested act schemas |
| `extensions/browser/src/browser-tool-session-tabs.ts` | `ec297d58e0597e7c70a6e2ef716e933ea7a613d872280fe795b4888415631b12` | session tab registry and stable tab selection |
| `extensions/browser/src/browser/pw-session-state.ts` | `06744e61c8ca9c006b0343f7873ccdd6b5004535b17d444dbfd508e97065bb43` | Playwright page/session state, refs, dialog and bounded evidence ownership |
| `extensions/browser/src/browser/pw-tools-core.snapshot.ts` | `8ced9c3f8acfbca4bf9cb4331145d0a6ca92ec76fc2f1cbaf2f4ed7d87a4cc83` | snapshot/ref generation and accessibility observation |
| `extensions/browser/src/browser/pw-session-navigation.ts` | `e6b5ea2c0c49e43ea035b37d41728e1d660a4a267fee22d61aa7fe53dc4e2163` | main-frame navigation and page-state synchronization |
| `extensions/browser/src/browser/chrome.executables.ts` | `13555887e13580fb1e9106b966307fb05de73f25d0e834965563c3f61c4c9d81` | broad browser executable discovery inventory |

## Code-confirmed findings

OpenClaw Browser is not a thin `page.goto` wrapper. The inspected code contains a broad public action schema, nested interaction actions, session tab registry, snapshot refs, navigation-coupled state, dialog and evidence state, and broad executable discovery. Those facilities are accumulated infrastructure and cannot be safely published in OpenRill before its provider-neutral lifecycle boundary owns stable identities and invalidation.

The sequence adopted for OpenRill is therefore:

```text
STEP013A process/context/page lifecycle and policy
STEP013B1 concrete adapter + read-only observation + document refs
STEP013B2 interactions + navigation result + dialog blocker
STEP013B3 artifacts and bounded console/page/network evidence
STEP013C automation trigger + durable action ledger + restart recovery
```

## Deliberate differences

- OpenRill uses separate small tools instead of one large action union.
- OpenRill STEP013B1 uses Run-owned `sessionId/pageId/documentGeneration/ref`; no CDP target cache or user label is added.
- executable discovery is intentionally limited to explicit, PATH, and common Chrome/Edge/Chromium system paths.
- no browser download, profile import, existing Chrome attach, persistent login, interaction action, screenshot, download, PDF, upload, dialog response, or durable ledger is copied.
- OpenClaw source is not vendored and its package is not a product dependency.
