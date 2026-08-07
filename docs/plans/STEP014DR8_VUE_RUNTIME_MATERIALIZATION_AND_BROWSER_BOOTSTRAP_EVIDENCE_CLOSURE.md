# STEP014DR8 — Vue Runtime Materialization and Browser Bootstrap Evidence Closure

## Identity

```text
STEP014DR8_VUE_RUNTIME_MATERIALIZATION_AND_BROWSER_BOOTSTRAP_EVIDENCE_CLOSURE
version=0.14.11-step014dr8
schema=14
baseline=STEP013CR2
retained_feature=STEP014D
```

## Why this corrective step exists

The real Windows STEP014DR7 run passed the real OpenAI parallel delegation stage and 319/320 aggregate checks. The only failure was `deterministic-nested-control-ui-live`:

```text
OPENRILL_STEP014DR7_WAIT_TIMEOUT:delegation-nav:false
```

Code inspection proved that the delegation graph, Protocol list operation, Host bootstrap, served index and served browser module had already passed. The failure was before Vue Control UI mount.

DR7 invoked `workspace-runner.mjs build` without first acquiring the exact Vue runtime and without passing `OPENRILL_VUE_RUNTIME_VENDOR_DIR`. The source package does not contain `apps/agent-web/public/vendor`, while `index.html` requires `/vendor/vue.runtime.global.prod.js`. `workspace-runner.mjs` materializes the vendor directory only when the build receives that environment variable. Therefore the DR7 static root lacked the Vue runtime and the browser could not create `nav-delegations`.

This is a recurrence of the already documented OR-ISSUE-074 boundary, not a delegation product defect. During canonical validation, DR8 also found OR-ISSUE-186: the retained DR7 boundary test froze the mutable root version and rejected the valid DR8 release. Lifecycle review then found OR-ISSUE-187: a pre-return Chromium launch/navigation failure could escape outer cleanup ownership. OR-ISSUE-188 found that the lifecycle audit inventory itself still inspected DR6 rather than the current DR8 fixtures. OR-ISSUE-189 then closed the retained outer-finally path that swallowed cleanup failures after body or cleanup-only failure.

## Scope

STEP014DR8 restores the exact Vue browser bootstrap chain inside the current aggregate owner:

1. acquire Vue 3.5.40 from `OPENRILL_VUE_ARCHIVE` or the integrity-pinned package URL;
2. re-extract the acquired archive independently;
3. verify archive, runtime, license and lock byte equality and hashes;
4. pass the acquired vendor root to the workspace build;
5. verify the built Host serves runtime and lock with exact status, MIME, bytes and SHA before Chromium starts;
6. preserve `Page.navigate` error text, runtime/console/network diagnostics and bounded page state on browser timeout;
7. require Control UI `startupPhase=READY` before delegation navigation and tree assertions.

## Explicit non-goals

- no migration or schema change;
- no delegation runtime, Protocol, Tool, budget or Control UI product change;
- no OpenAI adapter change;
- no compatibility alias for missing Vue assets;
- no timeout increase as a substitute for bootstrap evidence;
- no historical test ownership of the mutable current release version;
- no partial Chromium process outside bounded cleanup ownership;
- no current live fixture outside lifecycle-audit inventory ownership;
- no final live-fixture cleanup failure suppression.

## Acceptance closure

Windows promotion requires:

- exact Vue acquisition, re-extraction and byte verification PASS;
- vendor-aware build before any actual Chromium stage;
- Host-served Vue runtime and lock preflight PASS;
- real OpenAI direct-parallel delegation PASS;
- deterministic schema-14 nested delegation tree rendered in actual Chromium;
- browser evidence empty and `chromium_orphan=0`;
- final Chromium, Protocol client, Host and temporary-root cleanup failures remain observable;
- all retained focused, canonical, architecture, export and manifest gates PASS.
