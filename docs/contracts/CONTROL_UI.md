# Control UI Contract

## Scope

The OpenRill Control UI is a loopback-only browser client served by the running Agent Host. It is not a direct SQLite, filesystem or process client.

## Framework

```text
framework=VUE_3
runtime=3.5.40
runtime delivery=same-origin packaged asset
```

The framework-neutral protocol client and projection do not import Vue types.

## Routes

```text
#/conversations
#/workspaces
#/skills
#/approvals[/<requestId>]
#/artifacts
#/settings
#/diagnostics
```

## Bootstrap

`GET /ui/bootstrap` is same-origin, loopback-only and `Cache-Control: no-store`. It returns public Host identity, public Workspace projections and an in-memory Local Protocol credential. The credential is never embedded in `index.html` and is never written to local storage.

## Static asset boundary

- Host serves only files below the packaged Control UI root.
- traversal, symlink escape and oversized assets are rejected.
- CSP permits same-origin scripts plus the exact inline import-map hash.
- Vue, app and protocol modules are same-origin assets.
- vendor runtime is immutable-cacheable; HTML, app and bootstrap are not.

## Protocol boundary

The UI uses only Local Protocol operations:

```text
host.status
ui.snapshot
conversation.*
workspace.list
approval.*
artifact.list
artifact.get
```

Artifact bytes are read through authenticated `GET /ui/artifacts/<id>/content?file=<name>`. Public responses never expose canonical Workspace roots or private Artifact storage paths.

## Notice ordering

- `sequence <= cursor`: duplicate; do not apply.
- `sequence == cursor + 1`: apply and advance.
- `sequence > cursor + 1`: do not advance; enter `RESYNC_REQUIRED`.
- resync obtains `ui.snapshot`, reloads server projections and reconnects from the snapshot cursor.

## Projection

Canonical live progress envelope:

```json
{
  "runId": "...",
  "type": "model.text_delta | tool.started | tool.completed | approval.requested | ...",
  "data": {}
}
```

Unknown notice and progress types remain visible as unknown cards. They are not discarded.

## Persistence

The browser may persist only a non-secret reconnect cursor. Protocol tokens, model credentials, Secret values, canonical paths and Artifact private paths must not be stored in local storage.

## Accessibility and bounds

- banner, named navigation, main region, transcript log and modal dialog landmarks;
- keyboard card selection with ArrowUp/ArrowDown and modal close with Escape;
- approval deep link;
- at most 40 transcript cards rendered in the vertical slice;
- responsive 390 px width smoke.

## Acceptance browser executable authority

The real-browser acceptance uses an actual Chromium-family executable and CDP. Resolution order is deterministic:

```text
OPENRILL_CHROMIUM_EXECUTABLE
PATH
Windows system/user Chrome, Edge, Chromium
macOS application locations
POSIX standard locations
```

The resolver validates file existence/executability before spawn. A missing browser fails closed with `OPENRILL_CHROMIUM_EXECUTABLE_NOT_FOUND`; it never substitutes a mock browser. Spawn-stage errors preserve the OS error code and attempted executable.
