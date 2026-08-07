# STEP011R5 Vue reactive Proxy structuredClone failure

## Exact symptom

Actual Windows Chromium loaded Vue 3.5.40, mounted the app shell, connected to Local Protocol, and then failed before a pending approval could render.

```text
url=<LOOPBACK>/#/approvals
vueVersion=3.5.40
appShell=true
connection=CONNECTED
alert=Failed to execute 'structuredClone' on 'Window': #<Object> could not be cloned.
appText=...ApprovalsNo approvals.
STEP011R5 ... checks=163/164 state=FAILED
```

The browser evidence contained no Runtime, Log, Network, HTTP, CSP, or asset diagnostic. The failure was the application alert produced by the caught action/notice path.

## Code-confirmed root cause

`apps/agent-web/src/browser-app.ts` stored protocol JSON objects in deep Vue `ref` owners:

```text
conversation = ref<ConversationView | null>(null)
conversation.value = await call("conversation.get", ...)
fixtureFrom(conversation.value, ...)
```

Vue exposes an object assigned to a normal `ref` through a reactive JavaScript Proxy. `fixtureFrom()` passed that object and nested values into `createControlUiProjection()`.

`apps/agent-web/src/control-ui-projection.ts` then called the browser structured clone algorithm directly:

```text
cloneRecord(value) -> structuredClone(value)
cards             -> structuredClone(fixture.snapshot.cards)
```

The pre-fix R5 source was built and invoked with a JavaScript Proxy fixture. The exact deterministic result was:

```text
DataCloneError: #<Object> could not be cloned.
```

Therefore the failed value was not malformed server JSON. It was a framework-created Proxy crossing into the framework-neutral projection clone boundary.

The existing STEP011R4 fake Vue test did not reproduce this because its mock implemented `ref(value)` as a plain `{ value }` holder and never created a Proxy.

## Impact

- conversation creation or reload could connect successfully and still fail while rebuilding the projection
- the user saw an application alert while the approval page remained empty
- the process approval flow never reached the button despite the corrected 120-second approval TTL
- unit tests passed because the mocked Vue reactivity semantics were weaker than the packaged runtime

## Fix

STEP011R6 applies both boundary corrections:

1. protocol/bootstrap-owned object graphs use Vue `shallowRef`, so JSON responses remain raw and are replaced as whole values
2. framework-neutral projection cloning no longer delegates to `structuredClone`; it recursively copies arrays and enumerable record fields, which accepts JSON-like Proxy views and detaches the resulting projection

Scalar UI state continues to use normal `ref`. The mutable projection continues to use `reactive`.

## Detailed evidence

Pre-fix reproduction:

```text
OPENRILL_WORKSPACE_BUILD_PASS
DataCloneError: #<Object> could not be cloned.
```

Post-fix focused evidence:

```text
projection accepts Vue-style reactive Proxy snapshots without DataCloneError
unknown Proxy notice payload remains visible and detached
browser transport state uses shallowRef and projection owns Proxy-safe cloning
3/3 PASSED
```

Post-fix canonical evidence before release metadata packaging:

```text
155/155 tests PASSED
unit_files=28
skipped=0
architecture=PASSED
package_exports=PASSED
```

## Recurrence-prevention gate

- build and call the exported projection with nested JavaScript Proxy fixtures
- assert copied conversation, run, card raw data, and unknown notice payload remain visible
- mutate the original backing objects and assert projection data is detached
- statically require `shallowRef` for all protocol/bootstrap object owners
- reject `structuredClone` in the projection source
- retain the actual packaged Vue 3.5.40 Chromium vertical-slice gate
