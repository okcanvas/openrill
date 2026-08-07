# OR-ISSUE-184 — STEP014DR7 aggregate regressed exact Vue runtime materialization

## Symptom

The real Windows STEP014DR7 run passed 319/320 checks. `deterministic-nested-control-ui-live` reached Host bootstrap, Protocol delegation listing, index fetch, module fetch and Chromium DevTools discovery, then timed out on `delegation-nav:false`.

## Root cause

The source package intentionally contains no generated `apps/agent-web/public/vendor` directory. The Control UI index requires `/vendor/vue.runtime.global.prod.js`, and `workspace-runner.mjs` copies that runtime into `apps/agent-web/dist/public/vendor` only when `OPENRILL_VUE_RUNTIME_VENDOR_DIR` is present during build.

DR7 ran its aggregate `focused-build` before any exact Vue acquisition and never propagated the vendor root to the build. The resulting Host static root had no Vue runtime. This reproduced the already closed OR-ISSUE-074 contract failure.

## Correction

STEP014DR8 adds ordered stages for exact Vue acquisition, independent re-extraction and byte/hash verification. Only after those stages does it execute a vendor-aware workspace build. The deterministic browser stage receives the same vendor root.

## Recurrence gate

- acquisition → re-extraction → byte verification → vendor-aware build → actual browser is a fixed stage order;
- build and deterministic browser stages must receive `OPENRILL_VUE_RUNTIME_VENDOR_DIR`;
- the acquired and independently re-extracted runtime, license, lock and archive must be byte-identical;
- OR-ISSUE-074 remains referenced as the historical first occurrence.
